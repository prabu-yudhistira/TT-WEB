import type { PokeConfig } from './types'

/**
 * Press and hold an orb: the pair shakes, and when the shake tops out the
 * screen and its rays flicker.
 *
 * ⚠️ The flicker is the PAYOFF of the hold, not a second thing that happens at
 * the same time. It fires once, when the shake reaches full, and not again
 * until the pointer is released — otherwise holding still would strobe the
 * screen on a loop, which is both ugly and a photosensitivity problem on a
 * surface that will later carry subtitles.
 *
 * Pure: no THREE, no DOM. The caller decides what was hit and applies the
 * numbers.
 */

export type PokeState = 'idle' | 'holding' | 'firing' | 'spent'

export class PokeController {
  private held = false
  private heldMs = 0
  /** Milliseconds into the triggered flicker, or -1 when it is not running. */
  private fireMs = -1
  private fired = false
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
    if (this.fireMs >= 0) return 'firing'
    if (this.held) return this.fired ? 'spent' : 'holding'
    return 'idle'
  }

  press() {
    if (this.held) return
    this.held = true
    this.heldMs = 0
    this.fired = false
    this.tailMs = -1
  }

  release() {
    if (!this.held) return
    // Carry the amplitude reached, so the decay is continuous with the hold.
    this.tailFrom = this.heldRamp()
    this.held = false
    this.heldMs = 0
    this.fired = false
    this.tailMs = 0
  }

  reset() {
    this.held = false
    this.heldMs = 0
    this.fireMs = -1
    this.fired = false
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
        this.fireMs = 0
      }
    }

    // ⚠️ Runs whether or not the pointer is still down. Letting go halfway
    // through the flicker must not cut it off mid-strobe — that leaves the
    // screen at whatever brightness the dip happened to be on.
    if (this.fireMs >= 0) {
      this.fireMs += dtMs
      if (this.fireMs >= Math.max(1, cfg.FLICKER_MS)) this.fireMs = -1
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
   * Two stutters rather than one dip, matching `flickerAt` — the screen's own
   * idle flicker and this one have to look like the same instability, or the
   * poke reads as a different mechanism entirely.
   */
  dip(cfg: PokeConfig): number {
    if (this.fireMs < 0) return 0
    const p = this.fireMs / Math.max(1, cfg.FLICKER_MS)
    return Math.abs(Math.sin(p * Math.PI * 2)) * cfg.FLICKER_DEPTH
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
