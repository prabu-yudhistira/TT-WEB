/**
 * Pins gesture normalization.
 *
 * The whole sequence's feel depends on one trackpad flick counting as ONE beat,
 * and that is not observable by eye — a flick that fires four beats looks like
 * the animation is broken, not like the counter is wrong. Hence synthetic event
 * streams shaped like real hardware.
 * Run: npm run verify:config
 */
import { createGestureState, feedWheel, feedTouchMove, endTouch } from './gestures'
import { DEFAULT_SEQUENCE } from './types'

const cfg = DEFAULT_SEQUENCE.GESTURES
let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// ── mouse wheel ─────────────────────────────────────────────────────
//
// ⚠️ Derived from the config, not written as 120. These fixtures are about the
// ALGORITHM — one gesture, one beat — and WHEEL_THRESHOLD is an owner-tuned
// number that moved from 120 to 205 at the freeze gate. A hardcoded delta turns
// every future retune into three mysterious failures in a file that has nothing
// to do with the thing that changed.
const OVER = cfg.WHEEL_THRESHOLD
{
  const s = createGestureState()
  check('a gesture past the threshold emits one down beat', feedWheel(s, OVER, 1000, cfg) === 'down')
}

// ⚠️ A REAL mouse-wheel notch is ~100-120 in Chrome, and the approved threshold
// is 205 — so a physical notch is deliberately NOT one beat any more. It takes
// two. Recorded because it is a genuine consequence of the owner's tuning and
// invisible from the config alone: with BEATS_TO_COMMIT down from 4 to 2, the
// total wheel travel needed to reach the room is about what it always was, just
// spent in fewer, larger beats.
{
  const s = createGestureState()
  const first = feedWheel(s, 120, 1000, cfg)
  const second = feedWheel(s, 120, 1040, cfg)
  check('one physical notch is NOT a beat at the approved threshold', first === null)
  check('two notches in quick succession are', second === 'down')
}

// ── trackpad flick ──────────────────────────────────────────────────
// THE critical case, and the fixture has to be shaped like real hardware to
// mean anything.
//
// ⚠️ An earlier version of this test used 30 events over 240ms. That is SHORTER
// than COOLDOWN_MS (380), so the cooldown alone suppressed it and the quiet-
// window gate was never exercised — deleting that gate left the suite green.
// A near-tautology dressed as the suite's most important assertion.
//
// Real momentum scrolling runs 800–1500ms, well past any sane cooldown, which
// is exactly why the quiet window exists. 60 events over 1180ms.
const FLICK_EVENTS = 60
const FLICK_GAP_MS = 20
const flick = (s: ReturnType<typeof createGestureState>, t0: number) => {
  let beats = 0
  let t = t0
  for (let i = 0; i < FLICK_EVENTS; i++) {
    if (feedWheel(s, 60 * Math.pow(0.95, i), t, cfg)) beats++
    t += FLICK_GAP_MS
  }
  return { beats, endAt: t }
}

check(
  'the flick fixture outlasts the cooldown, or it proves nothing',
  FLICK_EVENTS * FLICK_GAP_MS > cfg.COOLDOWN_MS,
)

{
  const s = createGestureState()
  const { beats } = flick(s, 1000)
  check(`a full-length trackpad flick emits exactly ONE beat (got ${beats})`, beats === 1)
}

// A second flick, after the finger has lifted and the stream gone quiet, is a
// second beat — the gate must suppress momentum, not the user.
{
  const s = createGestureState()
  const first = flick(s, 1000)
  const second = flick(s, first.endAt + cfg.COOLDOWN_MS + cfg.QUIET_MS + 50)
  check(
    `two separated flicks emit exactly TWO beats (got ${first.beats + second.beats})`,
    first.beats + second.beats === 2,
  )
}

// ── four deliberate notches, spaced beyond the cooldown ─────────────
{
  const s = createGestureState()
  let beats = 0
  let t = 1000
  for (let i = 0; i < 4; i++) {
    if (feedWheel(s, OVER, t, cfg)) beats++
    t += cfg.COOLDOWN_MS + cfg.QUIET_MS + 50
  }
  check(`four spaced gestures emit four beats (got ${beats})`, beats === 4)
}

// ── direction ───────────────────────────────────────────────────────
{
  const s = createGestureState()
  check('negative delta emits an up beat', feedWheel(s, -OVER, 1000, cfg) === 'up')
}

// ── sub-threshold noise ─────────────────────────────────────────────
{
  const s = createGestureState()
  check('sub-threshold nudge emits nothing', feedWheel(s, 5, 1000, cfg) === null)
}

// A very slow drift still accumulates to a beat rather than being lost —
// otherwise a cautious scroller could never advance at all.
{
  const s = createGestureState()
  let beats = 0
  let t = 1000
  for (let i = 0; i < 40; i++) {
    if (feedWheel(s, 8, t, cfg)) beats++
    t += 30
  }
  check(`a slow drift eventually beats (got ${beats})`, beats >= 1)
}

// ── touch ───────────────────────────────────────────────────────────
{
  const s = createGestureState()
  let beats = 0
  let t = 1000
  for (let i = 0; i < 20; i++) {
    if (feedTouchMove(s, 20, t, cfg)) beats++
    t += 16
  }
  check(`one long swipe emits exactly ONE beat (got ${beats})`, beats === 1)

  endTouch(s)
  check('after touchend the next swipe can beat again', feedTouchMove(s, 80, t + 100, cfg) === 'down')
}

// An upward swipe is an up beat — this is how the visitor backs out.
{
  const s = createGestureState()
  check('upward swipe emits an up beat', feedTouchMove(s, -80, 1000, cfg) === 'up')
}

// ── independence ────────────────────────────────────────────────────
// Two states must not share anything. A module-level reservoir would make the
// bench and the live hero interfere.
{
  const a = createGestureState()
  const b = createGestureState()
  feedWheel(a, 100, 1000, cfg)
  check('states are independent', feedWheel(b, 5, 1000, cfg) === null)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll gesture checks passed.')
process.exit(failures ? 1 : 0)
