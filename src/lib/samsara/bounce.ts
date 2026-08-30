/**
 * The fall-and-bounce arc.
 *
 * Spec §6.3. SAMSARA drops from the far point, strikes the floor, bounces three
 * times at a restitution coefficient so apex heights go h, e·h, e²·h, and each
 * contact carries it further toward the camera so it grows as it approaches.
 * After the last bounce it does NOT come to rest — it rises into a hover, which
 * is the correct ending for a floating mascot and hands off naturally into the
 * room's idle.
 *
 * Phases are laid out on the normalised timeline in the order they occur:
 *
 *   [ FALL_MS ][ BOUNCE_MS[0] ][ BOUNCE_MS[1] ][ BOUNCE_MS[2] ][ SETTLE_MS ]
 *   t01 = 0                                                            t01 = 1
 *
 * `depth01` advances by a fixed share per phase, so it is monotonic BY
 * CONSTRUCTION rather than by a numeric accident — a reversal there would make
 * the bounces recede instead of approach, which reads as the whole fall running
 * backwards.
 *
 * Pure: no three.js, no DOM.
 */
import type { TransitConfig } from './types'

export type BouncePose = {
  /** Height above the floor, in normalised units where the drop height is 1. */
  height: number
  /** 0 at the back wall, 1 at the landed position. Monotonic. */
  depth01: number
  /** -1 during the initial fall, then 0, 1, 2 … during each bounce and settle. */
  bounceIndex: number
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * A parabolic hop: 0 at both ends, `apex` in the middle.
 * Used for each bounce. `4·p·(1-p)` peaks at exactly 1 when p = 0.5.
 */
const hop = (p: number, apex: number) => apex * 4 * p * (1 - p)

export function bounceAt(t01: number, cfg: TransitConfig): BouncePose {
  const t = clamp01(t01)

  // Phase durations along the normalised timeline.
  const durations = [cfg.FALL_MS, ...cfg.BOUNCE_MS.slice(0, cfg.BOUNCE_COUNT), cfg.SETTLE_MS]
  const total = durations.reduce((a, b) => a + b, 0)

  // Equal depth share per phase keeps depth01 monotonic regardless of how the
  // durations are tuned, and guarantees it hits exactly 1 at t = 1.
  const phaseCount = durations.length
  const depthPerPhase = 1 / phaseCount

  let elapsed = 0
  for (let i = 0; i < phaseCount; i++) {
    const dur = durations[i]
    const phaseEnd = elapsed + dur
    const isLast = i === phaseCount - 1

    // `<=` on the last phase so t = 1 resolves here rather than falling through.
    if (t * total < phaseEnd || isLast) {
      const p = dur > 0 ? clamp01((t * total - elapsed) / dur) : 1
      const depth01 = clamp01(i * depthPerPhase + p * depthPerPhase)

      if (i === 0) {
        // The initial fall: 1 → 0, accelerating under gravity (p²).
        return { height: 1 - p * p, depth01, bounceIndex: -1 }
      }

      if (isLast) {
        // Settle: rise from the floor into the hover. Eased out so it arrives
        // gently rather than snapping to height.
        const hover = Math.pow(cfg.RESTITUTION, cfg.BOUNCE_COUNT + 1)
        return { height: hover * (1 - Math.pow(1 - p, 2)), depth01, bounceIndex: cfg.BOUNCE_COUNT - 1 }
      }

      // Bounce i-1: a hop whose apex is the drop height decayed by restitution.
      const bounceIndex = i - 1
      const apex = Math.pow(cfg.RESTITUTION, bounceIndex + 1)
      return { height: hop(p, apex), depth01, bounceIndex }
    }

    elapsed = phaseEnd
  }

  // Unreachable — the `isLast` branch always returns.
  return { height: 0, depth01: 1, bounceIndex: cfg.BOUNCE_COUNT - 1 }
}
