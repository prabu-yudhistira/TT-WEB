import type { MascotConfig } from './types'

/**
 * Gold-dust trail — pure particle bookkeeping, no GL context.
 *
 * Extracted from MascotEngine so the fractional emission carry, the frame-stall
 * clamp, the fade curve and the ring buffer can be tested directly — the same
 * discipline that caught two silent bugs in the satellites' label module.
 * MascotEngine's job shrinks to: call emit() with the mascot's real position,
 * then write sample()'s output into the Points geometry's attributes.
 *
 * The GPU side stays in MascotEngine and its comments there still apply — in
 * particular gl_PointSize is set to LITERAL pixels because the camera is
 * orthographic; do not convert it to the perspective idiom 300.0/-mv.z, that
 * assumes a far larger world scale (the trap that cost the ignition 5.9 fps).
 */

export type Mote = {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  size: number
  seed: number
}

export function makeMotePool(size: number): Mote[] {
  const pool = new Array<Mote>(size)
  for (let i = 0; i < size; i++) {
    pool[i] = { x: 0, y: 0, vx: 0, vy: 0, born: 0, life: 0, size: 0, seed: 0 }
  }
  return pool
}

/**
 * Fade curve: in fast over the first 12% of life, out slowly over the rest. A
 * mote that pops in at full brightness reads as a glitch rather than as
 * something being shed. Exported so it can be tested without going through a
 * mote's per-particle age arithmetic.
 */
export function moteFade(age: number): number {
  const f = age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88
  return f > 0 ? f : 0
}

export class TrailState {
  private next = 0
  /** Fractional carry so a density that is not a multiple of the frame rate still emits evenly. */
  private debt = 0

  constructor(
    private pool: Mote[],
    /** Injectable for deterministic tests; MascotEngine passes the default. */
    private rng: () => number = Math.random,
  ) {}

  /** Shed new motes at the mascot's current position. */
  emit(cfg: MascotConfig, x: number, y: number, dtSec: number, alpha: number, elapsed: number): void {
    if (!cfg.TRAIL_ENABLED || alpha <= 0.001 || dtSec <= 0) {
      this.debt = 0
      return
    }
    this.debt += cfg.TRAIL_DENSITY * dtSec
    let n = Math.floor(this.debt)
    this.debt -= n
    // A stall (tab restored, slow frame) must not dump hundreds of motes at one
    // point — that reads as a blob, not a wake.
    if (n > 40) n = 40
    for (let i = 0; i < n; i++) {
      const m = this.pool[this.next]
      this.next = (this.next + 1) % this.pool.length
      const a = this.rng() * Math.PI * 2
      const rad = this.rng() * cfg.TRAIL_SPREAD
      m.x = x + Math.cos(a) * rad
      m.y = y + Math.sin(a) * rad
      const da = this.rng() * Math.PI * 2
      const sp = cfg.TRAIL_DRIFT * (0.35 + this.rng() * 0.65)
      m.vx = Math.cos(da) * sp
      m.vy = Math.sin(da) * sp
      m.born = elapsed
      m.life = cfg.TRAIL_SECONDS * (0.7 + this.rng() * 0.6)
      m.size = cfg.TRAIL_SIZE * (0.55 + this.rng() * 0.9)
      m.seed = this.rng()
    }
  }

  /** One entry per pool slot; dead slots have alpha 0. Advances live motes by dtSec (default 0). */
  sample(
    cfg: MascotConfig,
    elapsed: number,
    alpha: number,
    dtSec = 0,
  ): { i: number; x: number; y: number; alpha: number; size: number }[] {
    const out: { i: number; x: number; y: number; alpha: number; size: number }[] = []
    for (let i = 0; i < this.pool.length; i++) {
      const m = this.pool[i]
      const age = m.life > 0 ? (elapsed - m.born) / m.life : 2
      if (age >= 1 || age < 0) {
        out.push({ i, x: m.x, y: m.y, alpha: 0, size: 0 })
        continue
      }
      m.x += m.vx * dtSec
      m.y += m.vy * dtSec
      const twinkle = 1 - cfg.TRAIL_TWINKLE * 0.5 * (1 + Math.sin(elapsed * 9 + m.seed * 40))
      out.push({
        i,
        x: m.x,
        y: m.y,
        alpha: Math.max(0, cfg.TRAIL_OPACITY * moteFade(age) * twinkle * alpha),
        size: m.size * (1 - age * 0.45),
      })
    }
    return out
  }
}
