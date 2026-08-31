import { DEFAULT_SEPARATION, type SeparationConfig, type ShatterEvent, type ShatterUniforms } from './types'

/**
 * Charge / blast / reform state machine for the hero logo.
 * Spec: docs/superpowers/specs/2026-08-08-hero-logo-shatter-design.md §7
 *
 * All authoritative state lives here in JS — the GPU only renders the number
 * this hands it. That's what keeps the effect verifiable despite the actual
 * displacement happening in a vertex shader.
 */

/** Solves a CSS-style cubic-bezier in JS (Newton–Raphson on x). */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x
      if (Math.abs(err) < 1e-6) break
      const d = slopeX(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    return sampleY(t)
  }
}

/** trionn's reform curve, read from their source. */
const REFORM_EASE = cubicBezier(0.25, 0.46, 0.45, 0.94)

type State = 'idle' | 'charging' | 'blasted' | 'reforming'

export class ShatterController {
  private charge = 0
  private state: State = 'idle'
  private reformFrom = 0
  private reformT = 0
  private vibratePhase = 0
  private holding = false
  private armed = false
  /**
   * Separation driven from OUTSIDE the pointer gesture, 0..1.
   *
   * Spec §4.4: during the SAMSARA freeze all three 3D layers shake, and the
   * mark shakes "through its separation — the sequence drives that charge from
   * beat 1". The satellites and the mascot read a published number and jitter
   * themselves; the mark has no such input, because until now the only thing
   * that could separate it was a finger held on it.
   *
   * ⚠️ It does NOT go through the state machine, and that is deliberate. The
   * machine models a GESTURE — press, charge, blast, release, reform — with a
   * clock of its own. The sequence already owns its own clock and its own
   * ramp, so feeding it in as a synthetic press would mean two authorities on
   * one number and a fight over who gets to release it.
   */
  private external = 0
  private downX = 0
  private downY = 0
  private listeners = new Set<(e: ShatterEvent) => void>()

  constructor(
    private u: ShatterUniforms,
    private logoHeight: number,
    private config: SeparationConfig = DEFAULT_SEPARATION,
  ) {}

  /** Armed only once the 3D mesh is actually on screen (not during the sketch video). */
  setArmed(v: boolean) {
    this.armed = v
    if (!v) this.cancel()
  }

  onShatter(cb: (e: ShatterEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /**
   * Set the externally-driven separation. See `external`.
   *
   * Clamped rather than trusted: it is fed from a config-driven ramp the owner
   * tunes on a bench, and a slider that overshoots 1 must not push the vertex
   * displacement past what the shader was authored for.
   */
  setExternalCharge(v: number) {
    this.external = v < 0 ? 0 : v > 1 ? 1 : v
  }

  /**
   * What the POINTER has charged, 0..1.
   *
   * ⚠️ Deliberately excludes the external drive, and this is load-bearing.
   * `LogoEngine.getCharge()` is published to the satellites and the mascot so
   * they freeze and shake with the mark. During the SAMSARA sequence they are
   * ALREADY being driven from the same source that drives `external` — folding
   * it in here would make that value depend on itself through two components,
   * and because the merge is a max(), it could then never fall again: the
   * belt would latch at full freeze for the rest of the session.
   *
   * Anything that renders the separation wants getEffectiveCharge() instead.
   */
  getCharge() {
    return this.charge
  }

  /** What is actually DRAWN: the pointer's charge or the sequence's, whichever leads. */
  getEffectiveCharge() {
    return Math.max(this.charge, this.external)
  }

  getState(): State {
    // While the external drive leads, report the state that charge implies, so
    // that everything keyed off the gesture's phase — the ignition's hold
    // pulses, above all — behaves as it does under a real press. Without this
    // the mark separates in silence: displaced, but with none of the electrical
    // punctuation that makes the separation read as an event.
    if (this.external > this.charge) return this.external >= 1 ? 'blasted' : 'charging'
    return this.state
  }

  /** Shake offset to apply to the logo group while charging. */
  getVibrateOffset(): { x: number; y: number } {
    const amp = this.getEffectiveCharge() * this.config.VIBRATE_FRAC * this.logoHeight
    return {
      x: Math.sin(this.vibratePhase) * amp,
      y: Math.cos(this.vibratePhase * 1.3) * amp,
    }
  }

  /** @returns true if the press started a charge. */
  pointerDown(x: number, y: number): boolean {
    if (!this.armed) return false
    if (
      typeof window !== 'undefined' &&
      window.scrollY > window.innerHeight * this.config.SCROLL_DISARM_FRAC
    ) {
      return false
    }
    this.downX = x
    this.downY = y
    this.holding = true
    this.state = 'charging'
    return true
  }

  /** @returns true if this move reclassifies the gesture as a drag. */
  pointerMove(x: number, y: number): boolean {
    if (!this.holding) return false
    const dx = x - this.downX
    const dy = y - this.downY
    if (dx * dx + dy * dy > this.config.DRAG_THRESHOLD_PX * this.config.DRAG_THRESHOLD_PX) {
      this.holding = false
      this.beginReform()
      return true
    }
    return false
  }

  pointerUp() {
    if (!this.holding) return
    this.holding = false
    this.beginReform()
  }

  /** pointercancel, blur, disarm — never leave a blast stuck open. */
  cancel() {
    this.holding = false
    if (this.charge > 0) this.beginReform()
    else {
      this.state = 'idle'
      this.charge = 0
      // Not 0: `setShatterArmed(false)` calls this, and the SAMSARA sequence
      // disarms hold-to-separate from beat 1 (spec §5.8) at the exact moment it
      // starts driving `external` — zeroing here would blank the separation for
      // whatever remains of the frame.
      this.u.uBlast.value = this.external
    }
  }

  private beginReform() {
    if (this.charge <= 0) {
      this.state = 'idle'
      return
    }
    this.reformFrom = this.charge
    this.reformT = 0
    this.state = 'reforming'
    this.emit('reform')
  }

  private emit(e: ShatterEvent) {
    this.listeners.forEach((cb) => cb(e))
  }

  update(dt: number) {
    if (this.state === 'charging' && this.holding) {
      const prev = this.charge
      this.charge = Math.min(1, this.charge + (dt * 1000) / this.config.CHARGE_MS)
      if (prev < 1 && this.charge >= 1) {
        this.state = 'blasted'
        this.emit('blast')
      }
    } else if (this.state === 'reforming') {
      this.reformT = Math.min(1, this.reformT + (dt * 1000) / this.config.REFORM_MS)
      this.charge = this.reformFrom * (1 - REFORM_EASE(this.reformT))
      if (this.reformT >= 1) {
        this.charge = 0
        this.state = 'idle'
        this.emit('idle')
      }
    }

    const effective = this.getEffectiveCharge()
    if (effective > 0) this.vibratePhase += this.config.VIBRATE_PHASE_STEP
    this.u.uBlast.value = effective
  }

  dispose() {
    this.listeners.clear()
  }
}
