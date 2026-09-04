import type { SequenceConfig } from './types'
import type { SmokeMode } from './orbSmoke'

/**
 * The four beats, as a phase machine.
 *
 * ⚠️ DELIBERATELY separate from `SequenceController`. That machine's modes
 * (`idle → charge1..3 → committed → landed → exiting`) are asserted BY NAME in
 * samsara-kill-switch, samsara-seam, samsara-room-scroll,
 * samsara-arms-after-intro, samsara-reduced-motion and the bench. Adding
 * hologram phases there would ripple through every one of them for no gain.
 *
 * This runs INSIDE `landed`: started when the sequence arrives, reset when it
 * leaves. Pure arithmetic — no GL, no DOM, no clock of its own.
 */
export type HoloPhase = 'dormant' | 'entering' | 'parked' | 'emitting' | 'forming' | 'live'

/** Beat 3's dwell — parked and floating before the lenses light. */
const PARKED_HOLD_MS = 260
/** Beat 3's own ramp, before the shafts converge into a screen. */
const EMITTING_MS = 520

export class HologramController {
  phase: HoloPhase = 'dormant'
  /** Milliseconds inside the current phase. */
  phaseMs = 0
  /** Milliseconds since start(). */
  totalMs = 0
  /**
   * Milliseconds since the LAGGING orb parked — the clock the smoke cadence
   * and the flicker both run on.
   *
   * ⚠️ Not the same as `totalMs`. Counting the cadence from start() would fire
   * the first burst ~1.9s early, landing it under the entrance's own thrust
   * plume instead of clear of it.
   */
  private sinceParked = 0

  start() {
    this.phase = 'entering'
    this.phaseMs = 0
    this.totalMs = 0
    this.sinceParked = 0
  }

  reset() {
    this.phase = 'dormant'
    this.phaseMs = 0
    this.totalMs = 0
    this.sinceParked = 0
  }

  /**
   * Entry is over only when the LAGGING orb has arrived.
   *
   * ⚠️ ENTRY_MS alone is the near orb's flight. Advancing on that would cut the
   * far orb's arrival off mid-flight and snap it into place.
   */
  private entryTotal(cfg: SequenceConfig) {
    return cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS
  }

  update(cfg: SequenceConfig, dtMs: number): HoloPhase {
    if (this.phase === 'dormant') return this.phase

    this.phaseMs += dtMs
    this.totalMs += dtMs
    if (this.phase !== 'entering') this.sinceParked += dtMs

    const advance = (to: HoloPhase) => {
      this.phase = to
      this.phaseMs = 0
    }

    switch (this.phase) {
      case 'entering':
        if (this.phaseMs >= this.entryTotal(cfg)) advance('parked')
        break
      case 'parked':
        if (this.phaseMs >= PARKED_HOLD_MS) advance('emitting')
        break
      case 'emitting':
        if (this.phaseMs >= EMITTING_MS) advance('forming')
        break
      case 'forming':
        if (this.phaseMs >= cfg.HOLOGRAM.FORM_MS) advance('live')
        break
      case 'live':
        // ⚠️ Terminal, deliberately. The 3s smoke cadence and the 5s flicker
        // are PERMANENT — a phase beyond `live` would stop them, and both are
        // explicit owner decisions.
        break
    }
    return this.phase
  }

  entry01(cfg: SequenceConfig): number {
    if (this.phase === 'dormant') return 0
    if (this.phase !== 'entering') return 1
    return Math.min(1, this.phaseMs / this.entryTotal(cfg))
  }

  form01(cfg: SequenceConfig): number {
    if (this.phase === 'live') return 1
    if (this.phase !== 'forming') return 0
    return Math.min(1, this.phaseMs / cfg.HOLOGRAM.FORM_MS)
  }

  /**
   * The orbs emit CONSTANTLY from the moment they appear.
   *
   * ⚠️ This used to return 'thrust' while entering and 'cadence' once parked,
   * per the owner's original brief. Superseded 2026-09-04: constant throughout.
   */
  smokeMode(): SmokeMode {
    return this.phase === 'dormant' ? 'off' : 'on'
  }

  /** The cadence and flicker clock, counting from the park. */
  parkedMs(): number {
    return this.phase === 'entering' || this.phase === 'dormant' ? 0 : this.sinceParked
  }
}
