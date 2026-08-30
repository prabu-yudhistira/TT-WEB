/**
 * The SAMSARA sequence state machine.
 *
 * Spec §5.1:
 *
 *   idle --(beat down)--> charge1 --> charge2 --> charge3
 *                            ^                       |
 *                            +------(beat up)--------+
 *                                                (4th beat)
 *                                                    v
 *                                               committed
 *                           +-- timed, uninterruptible --+
 *                           | half-orbit -> handoff ->   |
 *                           | fall -> bounce x3 -> settle|
 *                           +------------+---------------+
 *                                        v
 *   idle <--(exit)-- exiting <--(beat up)-- landed
 *
 * The charge beats are REVERSIBLE — a beat upward steps back down, and from
 * charge1 it releases the freeze entirely. Only `committed` is one-way: bounce
 * physics scrubbed backwards at whatever speed a visitor happens to scroll does
 * not read as physics.
 *
 * Pure: no DOM, no three.js, no clock of its own. The caller supplies beats and
 * elapsed milliseconds, which is what makes the whole machine testable without
 * a browser.
 */
import type { SequenceConfig } from './types'

export type Mode = 'idle' | 'charge1' | 'charge2' | 'charge3' | 'committed' | 'landed' | 'exiting'

const CHARGE_MODES: Mode[] = ['charge1', 'charge2', 'charge3']

export class SequenceController {
  /** 0 = idle, 1..3 = charge steps. */
  private step = 0
  private phase: 'charge' | 'committed' | 'landed' | 'exiting' = 'charge'
  private transitMs = 0
  private exitMs = 0

  constructor(private cfg: SequenceConfig) {}

  get mode(): Mode {
    if (this.phase === 'committed') return 'committed'
    if (this.phase === 'landed') return 'landed'
    if (this.phase === 'exiting') return 'exiting'
    return this.step === 0 ? 'idle' : (CHARGE_MODES[this.step - 1] ?? 'charge3')
  }

  /** Total duration of the committed cinematic, summed from its phases. */
  get transitTotalMs(): number {
    const t = this.cfg.TRANSIT
    return (
      t.HALF_ORBIT_MS +
      t.FALL_MS +
      t.BOUNCE_MS.slice(0, t.BOUNCE_COUNT).reduce((a, b) => a + b, 0) +
      t.SETTLE_MS
    )
  }

  /** 0..1 through the committed cinematic. Feed this to transitPoseAt(). */
  get transit01(): number {
    if (this.phase === 'landed') return 1
    if (this.phase !== 'committed') return 0
    const total = this.transitTotalMs
    return total > 0 ? Math.min(1, this.transitMs / total) : 1
  }

  /** 0..1 through the exit. */
  get exit01(): number {
    if (this.phase !== 'exiting') return 0
    const total = Math.max(1, this.cfg.EXIT_MS)
    return Math.min(1, this.exitMs / total)
  }

  /**
   * Logo separation charge, 0..1. Drives the same machinery the pointer-hold
   * gesture already drives, from scroll instead of a pointer.
   */
  get chargeLevel(): number {
    if (this.phase === 'committed' || this.phase === 'landed' || this.phase === 'exiting') return 1
    if (this.step === 0) return 0
    return this.cfg.FREEZE.CHARGE_PER_BEAT[this.step - 1] ?? 1
  }

  /** Rigid page-shake amplitude in px for the current beat. */
  get shakePx(): number {
    if (this.step === 0 || this.phase !== 'charge') return 0
    return this.cfg.FREEZE.SHAKE_PX_PER_BEAT[this.step - 1] ?? 0
  }

  /**
   * Spec §5.8. From beat 1 the sequence OWNS the charge, so pointer-hold must be
   * disabled — otherwise the visitor can fight the animation, and during a pin
   * `scrollY` never changes so ShatterController's own scroll-disarm never
   * fires. Exposed as a flag rather than left implicit, so the React layer
   * cannot forget to ask.
   */
  get pointerHoldAllowed(): boolean {
    return this.mode === 'idle'
  }

  /** Is the page pinned? True for everything except idle. */
  get pinned(): boolean {
    return this.mode !== 'idle'
  }

  beat(dir: 'down' | 'up'): void {
    // Committed is one-way and uninterruptible. Landed only listens for `up`.
    if (this.phase === 'committed' || this.phase === 'exiting') return

    if (this.phase === 'landed') {
      if (dir === 'up') {
        this.phase = 'exiting'
        this.exitMs = 0
      }
      return
    }

    if (dir === 'down') {
      this.step++
      if (this.step >= this.cfg.GESTURES.BEATS_TO_COMMIT) {
        this.phase = 'committed'
        this.transitMs = 0
      }
    } else {
      this.step = Math.max(0, this.step - 1)
    }
  }

  /** Advance the timed states. Inert while idle or charging. */
  advance(dtMs: number): void {
    if (dtMs <= 0) return

    if (this.phase === 'committed') {
      this.transitMs += dtMs
      if (this.transitMs >= this.transitTotalMs) {
        this.phase = 'landed'
      }
      return
    }

    if (this.phase === 'exiting') {
      this.exitMs += dtMs
      if (this.exitMs >= this.cfg.EXIT_MS) {
        // Full reset: the hero is live again and the belt reclaims SAMSARA.
        this.phase = 'charge'
        this.step = 0
        this.transitMs = 0
        this.exitMs = 0
      }
    }
  }

  /** Hard reset, for the bench's replay control. */
  reset(): void {
    this.phase = 'charge'
    this.step = 0
    this.transitMs = 0
    this.exitMs = 0
  }

  setConfig(cfg: SequenceConfig): void {
    this.cfg = cfg
  }
}
