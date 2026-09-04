import type { PokeConfig } from './types'

/**
 * Press and hold an orb: the pair shakes, and when the shake tops out the
 * screen and its rays flicker.
 *
 * ⚠️ The flicker RUNS FOR AS LONG AS THE PRESS DOES. It starts when the shake
 * reaches full and does not stop until release. This reverses a first pass
 * that fired once per press on photosensitivity grounds; the owner asked for
 * continuous on 2026-09-05 and that is their call to make. The mitigation that
 * actually matters is upstream and unchanged: SamsaraSequence bails out
 * entirely under `prefers-reduced-motion: reduce`, so none of this runs for
 * anyone who has asked their system for it.
 *
 * ⚠️ What is NOT negotiable is how it STOPS. The dip fades over RELEASE_MS
 * rather than being cut at the release, so the screen can never be left parked
 * at whatever brightness the flicker happened to be passing through.
 *
 * Pure: no THREE, no DOM. The caller decides what was hit and applies the
 * numbers.
 */

export type PokeState = 'idle' | 'holding' | 'firing'

export class PokeController {
  private held = false
  private heldMs = 0
  /** Free-running once the flicker starts, so the waveform never restarts. */
  private cycleMs = 0
  private fired = false
  /** Milliseconds into the release fade, or -1 when the dip is not fading. */
  private fadeMs = -1
  /**
   * The release tail.
   *
   * ⚠️ Without it the shake stops dead on pointerup, which reads as the frame
   * dropping rather than as an object settling. `tailFrom` remembers how far
   * the shake had built so the decay starts where the hold left off instead of
   * from full.
   */
  private tailMs = -1
  private tailFrom = 0

  get phase(): PokeState {
    if (this.fired) return 'firing'
    if (this.held) return 'holding'
    return 'idle'
  }

  press() {
    if (this.held) return
    this.held = true
    this.heldMs = 0
    this.fired = false
    this.fadeMs = -1
    this.tailMs = -1
  }

  release() {
    if (!this.held) return
    // Carry the amplitude reached, so the decay is continuous with the hold.
    this.tailFrom = this.heldRamp()
    this.held = false
    this.heldMs = 0
    this.tailMs = 0
    // ⚠️ `fired` stays TRUE here. The dip has to fade out over RELEASE_MS, and
    // clearing it on the release would cut the flicker off wherever it happened
    // to be — which is how a screen gets left sitting at half brightness.
    if (this.fired) this.fadeMs = 0
  }

  reset() {
    this.held = false
    this.heldMs = 0
    this.cycleMs = 0
    this.fired = false
    this.fadeMs = -1
    this.tailMs = -1
    this.tailFrom = 0
  }

  /** How far the hold has built, 0..1. */
  private heldRamp(): number {
    return this.rampMs <= 0 ? 1 : Math.min(1, this.heldMs / this.rampMs)
  }

  private rampMs = 1

  update(cfg: PokeConfig, dtMs: number) {
    this.rampMs = Math.max(1, cfg.SHAKE_MS)

    if (this.held) {
      this.heldMs += dtMs
      if (!this.fired && this.heldMs >= this.rampMs) {
        this.fired = true
        this.cycleMs = 0
      }
    }

    // The waveform keeps running through the fade, so the flicker dies away
    // rather than freezing on its last value.
    if (this.fired) this.cycleMs += dtMs

    if (this.fadeMs >= 0) {
      this.fadeMs += dtMs
      if (this.fadeMs >= Math.max(1, cfg.RELEASE_MS)) {
        this.fadeMs = -1
        this.fired = false
        this.cycleMs = 0
      }
    }

    if (this.tailMs >= 0) {
      this.tailMs += dtMs
      if (this.tailMs >= Math.max(1, cfg.RELEASE_MS)) this.tailMs = -1
    }
  }

  /** Shake amplitude, 0..1 of SHAKE_AMP. */
  shake01(cfg: PokeConfig): number {
    if (this.held) return this.heldRamp()
    if (this.tailMs >= 0) {
      const t = this.tailMs / Math.max(1, cfg.RELEASE_MS)
      return this.tailFrom * Math.max(0, 1 - t)
    }
    return 0
  }

  /**
   * Extra flicker depth for the screen and the rays, 0..1.
   *
   * ⚠️ TWO RATES, not one. A single sine is a pulse: it repeats exactly, and a
   * steady rhythm reads as a deliberate animation rather than as an unstable
   * projection. Beating two incommensurate rates gives a waveform that never
   * repeats over any realistic hold.
   *
   * ⚠️ HALF-WAVE RECTIFIED, and that is the part that makes it a flicker.
   *
   * Summing two |sin| terms was the first attempt and it is NOT a flicker: the
   * two rarely bottom out together, so the dip never returns to zero and the
   * screen just sits dimmed and wobbling — 5 frames out of 500 came near
   * normal brightness. Clipping the negative half instead gives real darkness
   * roughly half the time, which is what makes the panel look like it is
   * cutting out rather than breathing.
   *
   * The weights sum to 1, so the dip reaches FLICKER_DEPTH but never passes it.
   */
  dip(cfg: PokeConfig): number {
    if (!this.fired) return 0
    const t = this.cycleMs / Math.max(1, cfg.FLICKER_MS)
    const w = Math.max(
      0,
      Math.sin(t * Math.PI * 2) * 0.6 + Math.sin(t * Math.PI * 2 * 2.7 + 1.3) * 0.4,
    )
    const fade =
      this.fadeMs >= 0 ? Math.max(0, 1 - this.fadeMs / Math.max(1, cfg.RELEASE_MS)) : 1
    return w * cfg.FLICKER_DEPTH * fade
  }
}

/**
 * The wobble itself, in ORB RADII, on the screen's own axes.
 *
 * ⚠️ x and y run at DIFFERENT frequencies. At the same frequency the two
 * components stay in phase and the orb slides back and forth along a diagonal,
 * which reads as a nudge rather than a shake. The ratio is deliberately
 * irrational-ish so the path never repeats over a hold.
 *
 * `seed` separates the two orbs. Shaking in lockstep looks like the camera
 * moved, not like two objects reacting.
 */
export function shakeOffset(
  tMs: number,
  cfg: PokeConfig,
  amp01: number,
  seed: number,
): [number, number] {
  const w = (tMs / 1000) * cfg.SHAKE_HZ * Math.PI * 2
  const a = amp01 * cfg.SHAKE_AMP
  return [Math.sin(w + seed * 2.4) * a, Math.sin(w * 1.37 + seed * 5.1) * a]
}

export type ScreenDisc = { cx: number; cy: number; r: number }

/**
 * Which orb, if any, a pointer is over. -1 for none.
 *
 * ⚠️ Takes DISCS IN PIXELS, already projected. The alternative — raycasting the
 * orb meshes — reads the shell's actual silhouette, which is a spiky ball with
 * nozzles: the gaps between the spikes become dead spots that a visitor
 * experiences as the press "not working" half the time.
 *
 * `slop` widens every disc. A finger is not a pixel.
 */
export function orbHit(px: number, py: number, discs: ScreenDisc[], slop: number): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < discs.length; i++) {
    const d = discs[i]
    const reach = d.r + slop
    const dist = Math.hypot(px - d.cx, py - d.cy)
    // Nearest wins, so an overlap resolves to the orb the pointer is actually
    // on rather than to whichever happens to be first in the list.
    if (dist <= reach && dist < bestD) {
      bestD = dist
      best = i
    }
  }
  return best
}
