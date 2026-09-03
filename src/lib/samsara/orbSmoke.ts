import { PORT_OFFSETS, type EmittersConfig } from './types'

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
 * ── Two behaviours, one pool ────────────────────────────────────────
 *
 * THRUST is the continuous afterburner plume while the orbs fly in; it is what
 * makes the entry read as propulsion rather than as two objects sliding into
 * place, and it ends when the orb parks. CADENCE is the permanent every-3s
 * burst once parked, which runs for as long as the room is up.
 *
 * ⚠️ Size the pool for THRUST, which is far denser. A pool sized for the
 * cadence truncates the entrance silently — puffs simply stop appearing, and
 * nothing logs.
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

export type SmokeMode = 'thrust' | 'cadence' | 'off'

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

export class SmokeState {
  private pool: Puff[]
  private rnd: () => number
  private next = 0
  /** Fractional puff budget carried between frames, so a low rate still emits. */
  private carry = 0
  /** Index of the last cadence burst already fired. */
  private lastBurst = 0
  /**
   * Which port thrust emits from next.
   *
   * ⚠️ PERSISTENT across frames, and that is the whole point. Cycling on the
   * index within a single frame's batch looks equivalent and is not: at a
   * typical rate the batch is only 2-3 puffs, so `i % 4` never reaches port 3
   * and one afterburner silently never fires. Caught by asserting the set of
   * ports actually seen in a sample.
   */
  private thrustPort = 0

  constructor(pool: Puff[], rnd: () => number) {
    this.pool = pool
    this.rnd = rnd
  }

  private spawn(cfg: EmittersConfig, nowMs: number, port: number, spread: number) {
    const p = this.pool[this.next]
    this.next = (this.next + 1) % this.pool.length
    const o = PORT_OFFSETS[port]
    p.x = o[0]
    p.y = o[1]
    p.z = o[2]
    // Ports point DOWN, so the plume falls away and spreads outward. The
    // port's own offset biases the lateral drift, which keeps four plumes
    // visibly separate instead of merging into one cloud under the orb.
    const a = this.rnd() * Math.PI * 2
    const r = this.rnd() * spread
    p.vx = Math.cos(a) * r * 0.4 + o[0] * 0.3
    p.vy = -0.5 - this.rnd() * 0.4
    p.vz = Math.sin(a) * r * 0.4 + o[2] * 0.3
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
   * `elapsedMs` is time within the CURRENT behaviour, not absolute — so the
   * cadence counts from the moment the orb parked, which is what makes the
   * "first burst waits a full interval" rule expressible at all.
   */
  update(cfg: EmittersConfig, mode: SmokeMode, elapsedMs: number, dtMs: number): number {
    if (mode === 'off') return 0

    if (mode === 'thrust') {
      // THRUST_RATE is per SECOND per PORT, across four ports.
      this.carry += (cfg.THRUST_RATE * 4 * dtMs) / 1000
      const n = Math.floor(this.carry)
      this.carry -= n
      for (let i = 0; i < n; i++) {
        this.spawn(cfg, elapsedMs, this.thrustPort, cfg.THRUST_SPREAD)
        this.thrustPort = (this.thrustPort + 1) % 4
      }
      return n
    }

    // ⚠️ The first cadenced burst waits a FULL interval. Firing on the arrival
    // frame lands it on top of the thrust smoke still dissipating, and reads as
    // a continuation of the entrance rather than as its own event. `roomBurst`
    // established the same rule for the same reason.
    const due = Math.floor(elapsedMs / cfg.CADENCE_MS)
    if (due <= this.lastBurst) return 0
    this.lastBurst = due
    for (let port = 0; port < 4; port++) {
      for (let k = 0; k < cfg.CADENCE_PUFFS; k++) {
        this.spawn(cfg, elapsedMs, port, cfg.THRUST_SPREAD * 0.6)
      }
    }
    return cfg.CADENCE_PUFFS * 4
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
    this.lastBurst = 0
    this.thrustPort = 0
  }
}
