import type { EmittersConfig } from './types'

/**
 * The emitter orbs' smoke — pure particle bookkeeping, no GL.
 *
 * ── Why this is NOT `roomBurst` ─────────────────────────────────────
 *
 * `roomBurst` works in BODY RADII and spawns on a disc BEHIND SAMSARA, so its
 * puffs emerge from the silhouette's edge — the whole point of that module.
 * This works in ORB RADII, from FOUR DISCRETE PORTS at the orb's base, drifting
 * down and out.
 *
 * Generalising `roomBurst` to cover both would mean editing frozen,
 * gate-covered code to serve a case it was never designed for. Forking it would
 * invite two copies to drift apart. So: a sibling — exactly as `roomBurst` is a
 * sibling of `mascotTrail`, and for the same reason. This project now runs
 * three particle systems and each split has paid for itself.
 *
 * ── One behaviour: continuous ───────────────────────────────────────
 *
 * ⚠️ There were TWO until 2026-09-04 — a continuous thrust during entry, then a
 * repeating burst once parked, which was the owner's original brief. They
 * superseded it: the orbs emit constantly, entrance and idle alike. The
 * cadence and its CADENCE_MS / CADENCE_PUFFS went with it rather than being
 * left in place unused, because config nothing reads is the failure this
 * project has already paid for once with LANDING.ROT_*.
 *
 * Rate is per SECOND per PORT, carried across frames as a fraction so a low
 * rate still emits rather than rounding to nothing every frame.
 */

export type Puff = {
  /** Orb radii, origin at the orb centre. */
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
  port: number
}

export type PuffSample = {
  i: number
  x: number
  y: number
  z: number
  alpha: number
  size: number
  seed: number
  /**
   * Which of the four ports emitted this puff.
   *
   * Carried so a gate can assert all four are actually firing. Without it the
   * only available check is over the sample's array index, which is true of any
   * input with four or more puffs and therefore proves nothing.
   */
  port: number
}

export type SmokeMode = 'on' | 'off'

export function makeSmokePool(size: number): Puff[] {
  const pool = new Array<Puff>(size)
  for (let i = 0; i < size; i++) {
    pool[i] = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      born: -1, life: 0, size: 0, seed: 0, port: 0,
    }
  }
  return pool
}

export type Port = readonly [number, number, number]

/**
 * Where a plume leaves from, and which way it goes.
 *
 * ⚠️ Both are supplied by the CALLER rather than imported. The orbs have four
 * afterburners pointing down; SAMSARA has two exhausts on its upper rear
 * pointing up and back. Same bookkeeping, different hardware — and importing a
 * fixed four-port constant here is what would have forced a second copy of this
 * file the first time something else needed to emit.
 */
export type PortSpec = {
  at: Port
  /** Outward velocity, in emitter radii per second. */
  dir: Port
}

export class SmokeState {
  private pool: Puff[]
  private ports: PortSpec[]
  private rnd: () => number
  private next = 0
  /** Fractional puff budget carried between frames, so a low rate still emits. */
  private carry = 0
  /**
   * Which port emits next.
   *
   * ⚠️ PERSISTENT across frames, and that is the whole point. Cycling on the
   * index within a single frame's batch looks equivalent and is not: at a
   * typical rate the batch is only 2-3 puffs, so cycling on that index never
   * reaches the last port and one afterburner silently never fires. Caught by
   * asserting the set of ports actually seen in a sample.
   */
  private thrustPort = 0

  constructor(pool: Puff[], ports: PortSpec[], rnd: () => number) {
    this.pool = pool
    this.ports = ports
    this.rnd = rnd
  }

  /** Swapped live, so a bench slider can move a port without a rebuild. */
  setPorts(ports: PortSpec[]) {
    this.ports = ports
  }

  private spawn(cfg: EmittersConfig, nowMs: number, port: number, spread: number) {
    const p = this.pool[this.next]
    this.next = (this.next + 1) % this.pool.length
    const spec = this.ports[port % this.ports.length]
    const o = spec.at
    p.x = o[0]
    p.y = o[1]
    p.z = o[2]
    // The plume leaves along the port's own direction, with a cone of scatter
    // around it. Scatter is applied on the two axes the direction is weakest
    // on, so a mostly-vertical exhaust spreads sideways rather than stalling.
    const a = this.rnd() * Math.PI * 2
    const r = this.rnd() * spread
    p.vx = spec.dir[0] + Math.cos(a) * r * 0.4
    p.vy = spec.dir[1] + (this.rnd() - 0.5) * r * 0.4
    p.vz = spec.dir[2] + Math.sin(a) * r * 0.4
    p.born = nowMs
    // ⚠️ Randomised up to 1.25x. Anything asserting a puff is gone must sample
    // past the LONGEST life, not the nominal one.
    p.life = cfg.PUFF_LIFE_MS * (0.75 + this.rnd() * 0.5)
    p.size = cfg.PUFF_SIZE * (0.7 + this.rnd() * 0.6)
    p.seed = this.rnd()
    p.port = port
  }

  /**
   * Advance and emit. Returns how many puffs were spawned this step.
   *
   * ⚠️ `elapsedMs` must be MONOTONIC. It stamps each puff's birth and `sample`
   * measures age against it, so a clock that jumps backwards makes every live
   * puff read as unborn and the cloud disappears.
   */
  update(cfg: EmittersConfig, mode: SmokeMode, elapsedMs: number, dtMs: number): number {
    if (mode === 'off') return 0

    // THRUST_RATE is per SECOND per PORT, across however many ports the caller
    // supplied — four afterburners on an orb, two exhausts on SAMSARA.
    this.carry += (cfg.THRUST_RATE * this.ports.length * dtMs) / 1000
    const n = Math.floor(this.carry)
    this.carry -= n
    for (let i = 0; i < n; i++) {
      this.spawn(cfg, elapsedMs, this.thrustPort, cfg.THRUST_SPREAD)
      this.thrustPort = (this.thrustPort + 1) % this.ports.length
    }
    return n
  }

  /** Live puffs at `nowMs`, in orb radii. Dead ones are simply omitted. */
  sample(nowMs: number, cfg: EmittersConfig): PuffSample[] {
    const out: PuffSample[] = []
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]
      if (p.born < 0) continue
      const age = nowMs - p.born
      if (age < 0 || age >= p.life) continue
      const t = age / p.life
      const s = age / 1000
      out.push({
        i,
        x: p.x + p.vx * s,
        y: p.y + p.vy * s,
        z: p.z + p.vz * s,
        /**
         * ⚠️ A BLOOM, not a step: near zero at birth, peaking around 44% of
         * life, back to zero at death. A puff that starts at full opacity pops
         * into existence, which reads as a glitch rather than as steam. The
         * `1.15` skews the peak slightly early so the fade is the longer half.
         */
        alpha: cfg.PUFF_OPACITY * Math.sin(Math.PI * Math.min(1, t * 1.15)),
        size: p.size * (1 + t * 1.6),
        seed: p.seed,
        port: p.port,
      })
    }
    return out
  }

  reset() {
    for (const p of this.pool) p.born = -1
    this.next = 0
    this.carry = 0
    this.thrustPort = 0
  }
}
