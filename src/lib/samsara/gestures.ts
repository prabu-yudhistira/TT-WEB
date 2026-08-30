/**
 * Wheel and touch events → discrete beats.
 *
 * The problem this exists to solve: one mouse-wheel notch is ONE `wheel` event,
 * but one trackpad flick is 20–50 of them with decaying deltas. Counting events
 * fires the whole sequence off a single flick — and that failure looks like a
 * broken animation, not like a miscounted gesture, so it is worth pinning by
 * assertion rather than discovering on a trackpad.
 *
 * Two gates, BOTH required:
 *   1. a cooldown after each beat, and
 *   2. the delta stream must go quiet before re-arming.
 *
 * The second is the one that matters. Momentum keeps events arriving for
 * several hundred ms after the finger lifts, so a cooldown alone would re-arm
 * mid-flick and fire again off the same gesture.
 *
 * Pure: no DOM, no listeners, no module-level state. The caller supplies the
 * events and the clock, which is what makes synthetic hardware streams testable.
 */
import type { GesturesConfig } from './types'

export type Beat = 'down' | 'up' | null

export type GestureState = {
  /** Accumulated deltaY since the last beat. Signed. */
  reservoir: number
  /** Timestamp of the most recent event of any kind. */
  lastEventAt: number
  /** Timestamp of the most recent emitted beat. */
  lastBeatAt: number
  /** False between a beat and the stream going quiet again. */
  armed: boolean
  /** True between a touch beat and the finger lifting. */
  touchLatched: boolean
}

export function createGestureState(): GestureState {
  return {
    reservoir: 0,
    lastEventAt: -Infinity,
    lastBeatAt: -Infinity,
    armed: true,
    touchLatched: false,
  }
}

export function feedWheel(
  s: GestureState,
  deltaY: number,
  nowMs: number,
  cfg: GesturesConfig,
): Beat {
  // Re-arm only once the stream has been quiet AND the cooldown has elapsed.
  // Momentum from the previous flick keeps lastEventAt fresh, so it cannot
  // re-arm on its own however long it runs.
  if (
    !s.armed &&
    nowMs - s.lastEventAt >= cfg.QUIET_MS &&
    nowMs - s.lastBeatAt >= cfg.COOLDOWN_MS
  ) {
    s.armed = true
    s.reservoir = 0
  }

  s.lastEventAt = nowMs
  if (!s.armed) return null

  s.reservoir += deltaY
  if (Math.abs(s.reservoir) < cfg.WHEEL_THRESHOLD) return null

  const beat: Beat = s.reservoir > 0 ? 'down' : 'up'
  s.reservoir = 0
  s.armed = false
  s.lastBeatAt = nowMs
  return beat
}

export function feedTouchMove(
  s: GestureState,
  deltaY: number,
  nowMs: number,
  cfg: GesturesConfig,
): Beat {
  s.lastEventAt = nowMs

  // One swipe is one beat, however far the finger keeps travelling. The latch
  // is released only by endTouch(), which makes touch strictly simpler than
  // wheel: there is an unambiguous gesture boundary, so no quiet window is
  // needed.
  if (s.touchLatched) return null

  s.reservoir += deltaY
  if (Math.abs(s.reservoir) < cfg.TOUCH_THRESHOLD) return null

  const beat: Beat = s.reservoir > 0 ? 'down' : 'up'
  s.reservoir = 0
  s.touchLatched = true
  s.lastBeatAt = nowMs
  return beat
}

/** Call on `touchend`/`touchcancel`. Releases the latch for the next swipe. */
export function endTouch(s: GestureState): void {
  s.touchLatched = false
  s.reservoir = 0
}
