import type { BurstConfig } from './types'

/**
 * The parked mascot's golden-smoke bursts — pure particle bookkeeping, no GL.
 *
 * ── Why this is NOT the hero's trail ────────────────────────────────
 *
 * `lib/mascot/mascotTrail.ts` is 2D: it works in SCREEN PIXELS and its points
 * are drawn under an ORTHOGRAPHIC camera, where `gl_PointSize` is literally
 * pixels. The room's camera is PERSPECTIVE, so the same positions would land
 * hundreds of world units off-frustum and the same point sizing would be
 * meaningless. Reusing it here would have produced nothing on screen, which is
 * a slow thing to debug.
 *
 * So this module is 3D and works in BODY RADII: (0,0,0) is the mascot's centre
 * and 1.0 is its radius, whatever it happens to be on screen. The engine scales
 * that into world units once, which keeps the burst the same size relative to
 * SAMSARA at every viewport and at every LANDING.SIZE_FRAC.
 *
 * ── "from behind" ───────────────────────────────────────────────────
 *
 * Motes are born on a disc BEHIND the body (−Z, away from the camera) and move
 * outward and forward, so they emerge from the silhouette's edge rather than
 * appearing in front of the face. That ordering is the whole effect: spawn them
 * in front and it reads as a sneeze, not as something shed from behind.
 */

export type BurstMote = {
  /** Body radii, centred on the mascot. */
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  born: number
  life: number
  size: number
  seed: number
}

export type BurstSample = {
  i: number
  x: number
  y: number
  z: number
  alpha: number
  size: number
}

export function makeBurstPool(size: number): BurstMote[] {
  const pool = new Array<BurstMote>(size)
  for (let i = 0; i < size; i++) {
    pool[i] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: 0, life: 0, size: 0, seed: 0 }
  }
  return pool
}

/**
 * Fade curve. Sharper in than the trail's (8% versus 12%) because a BURST
 * should read as a puff that has already happened, not as something easing on.
 * The long tail is what makes it drift away rather than blink out.
 */
export function burstFade(age: number): number {
  const f = age < 0.08 ? age / 0.08 : 1 - (age - 0.08) / 0.92
  return f > 0 ? f : 0
}

export class BurstState {
  private next = 0
  /** When the next burst is due, in seconds on the engine's own clock. */
  private nextAt = -1
  private lastActive = false

  constructor(
    private pool: BurstMote[],
    /** Injectable for deterministic tests; the engine passes the default. */
    private rng: () => number = Math.random,
  ) {}

  /** Test/inspection seam: how many motes are currently alive. */
  aliveCount(elapsed: number): number {
    let n = 0
    for (const m of this.pool) {
      const age = m.life > 0 ? (elapsed - m.born) / m.life : 2
      if (age >= 0 && age < 1) n++
    }
    return n
  }

  /**
   * Advance the schedule. Fires a burst when one is due and `active` is true.
   * Returns true on the frames where a burst actually fired.
   *
   * ⚠️ The FIRST burst is delayed by a full interval rather than firing the
   * instant SAMSARA parks. It lands during the settle otherwise, on top of the
   * bounce and the chatbox arriving, where nobody can read it as its own event.
   */
  update(cfg: BurstConfig, elapsed: number, active: boolean): boolean {
    if (!active || !cfg.ENABLED) {
      // Re-arm, so leaving and re-entering the room does not fire instantly on
      // a timer that has been running while nothing was on screen.
      this.nextAt = -1
      this.lastActive = active
      return false
    }
    const period = Math.max(0.05, cfg.INTERVAL_MS / 1000)
    if (!this.lastActive || this.nextAt < 0) {
      this.lastActive = true
      this.nextAt = elapsed + period
      return false
    }
    if (elapsed < this.nextAt) return false

    // A stalled tab must not fire a burst per missed interval all at once.
    // Snap the schedule forward instead and emit exactly one.
    this.nextAt = elapsed + period
    this.fire(cfg, elapsed)
    return true
  }

  /** Emit one burst immediately. Exposed so the bench can trigger one on demand. */
  fire(cfg: BurstConfig, elapsed: number): void {
    const n = Math.max(0, Math.min(this.pool.length, Math.round(cfg.COUNT)))
    for (let i = 0; i < n; i++) {
      const m = this.pool[this.next]
      this.next = (this.next + 1) % this.pool.length

      // A direction on the sphere, biased to the BACK hemisphere. Uniform on a
      // sphere would put a third of the burst in front of the face.
      const theta = this.rng() * Math.PI * 2
      // cos in [-1, -0.15]: behind, never level with the equator, so nothing
      // spawns exactly on the silhouette edge where it pops rather than emerges.
      const cosPhi = -0.15 - this.rng() * 0.85
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi))

      const dx = Math.cos(theta) * sinPhi
      const dy = Math.sin(theta) * sinPhi
      const dz = cosPhi

      // Born just off the surface, pushed further back by BACK_OFFSET.
      const r = 1 + cfg.SPREAD * this.rng()
      m.x = dx * r
      m.y = dy * r
      m.z = dz * r - cfg.BACK_OFFSET

      // Outward along its own direction, but flattened on Z: a mote travelling
      // straight at the back wall just shrinks, and one travelling straight at
      // the camera covers the face. The interesting motion is lateral.
      const sp = cfg.SPEED * (0.45 + this.rng() * 0.9)
      m.vx = dx * sp
      m.vy = dy * sp + cfg.RISE
      m.vz = dz * sp * 0.35

      m.born = elapsed
      m.life = Math.max(0.05, cfg.SECONDS) * (0.7 + this.rng() * 0.6)
      m.size = cfg.SIZE * (0.55 + this.rng() * 0.9)
      // Also the swirl's phase, so each puff curls on its own schedule rather
      // than the whole cloud swaying together.
      m.seed = this.rng()
    }
  }

  /**
   * One entry per pool slot; dead slots have alpha 0 so the caller can write a
   * fixed-length attribute buffer without branching.
   */
  sample(cfg: BurstConfig, elapsed: number, alpha: number, dtSec = 0): BurstSample[] {
    const out: BurstSample[] = []
    for (let i = 0; i < this.pool.length; i++) {
      const m = this.pool[i]
      const age = m.life > 0 ? (elapsed - m.born) / m.life : 2
      if (age >= 1 || age < 0) {
        out.push({ i, x: m.x, y: m.y, z: m.z, alpha: 0, size: 0 })
        continue
      }
      m.x += m.vx * dtSec
      m.y += m.vy * dtSec
      m.z += m.vz * dtSec

      // Curl. Three incommensurate rates so the path never closes into a
      // visible circle, phased by the mote's own seed.
      if (cfg.SWIRL !== 0 && dtSec > 0) {
        const ph = m.seed * Math.PI * 2
        const t = elapsed * 0.6 + ph
        m.x += Math.cos(t) * cfg.SWIRL * dtSec
        m.y += Math.sin(t * 0.83) * cfg.SWIRL * 0.6 * dtSec
        m.z += Math.sin(t * 1.31) * cfg.SWIRL * 0.5 * dtSec
      }
      // Slow down as they age, so the puff spreads then hangs rather than
      // flying off at a constant rate.
      const drag = Math.max(0, 1 - cfg.DRAG * dtSec)
      m.vx *= drag
      m.vy *= drag
      m.vz *= drag
      out.push({
        i,
        x: m.x,
        y: m.y,
        z: m.z,
        alpha: Math.max(0, cfg.OPACITY * burstFade(age) * alpha),
        // EXPANDING, not shrinking. A puff that shrinks as it fades reads as a
        // grain falling away; one that grows reads as smoke thinning out.
        size: m.size * (1 + (cfg.GROWTH - 1) * age),
      })
    }
    return out
  }
}
