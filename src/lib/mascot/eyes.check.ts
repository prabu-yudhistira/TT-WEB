/**
 * Assertions for the frozen, owner-approved eye shapes and the pure shape
 * helpers. Run: npm run verify:config
 *
 * Mirrors src/lib/mascot/types.check.ts. This repo has no test runner; this
 * follows the existing `seed:verify` idiom of a plain tsx script that throws.
 */
import {
  EXPRESSIONS,
  EXPRESSION_ORDER,
  lerpEye,
  packEye,
  pickWeighted,
  rightOf,
  type EyeShape,
} from './eyes'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// ── the table itself ────────────────────────────────────────────────
check('EXPRESSIONS is frozen', Object.isFrozen(EXPRESSIONS))
check('14 expressions', EXPRESSION_ORDER.length === 14)
for (const name of EXPRESSION_ORDER) {
  check(`${name}: name field matches its key`, EXPRESSIONS[name].name === name)
}

// Only `wink` has independently tuned eyes. Spec §5.3.
for (const name of EXPRESSION_ORDER) {
  const hasRight = EXPRESSIONS[name].right != null
  check(
    `${name}: right eye ${name === 'wink' ? 'is' : 'is not'} separate`,
    hasRight === (name === 'wink'),
  )
}

// ── the approved values, verbatim from spec §5.3 ────────────────────
// Pinned so a later edit is a deliberate act with the owner in the loop, not
// a silent diff. These took three live tuning rounds.
const APPROVED: Record<string, Partial<EyeShape>> = {
  neutral: { dx: 0.25, dy: 0.09, gaze: 0, w: 0.42, h: 0.68, lean: 0, crescent: 0 },
  blink: { dx: 0.26, dy: 0.05, gaze: 0, w: 0.4, h: 0.03, lean: 0, crescent: 0 },
  squint: { dx: 0.21, dy: 0.2, gaze: 0, w: 0.6, h: 0.11, lean: 0, crescent: 0 },
  wide: { dx: 0.21, dy: 0.17, gaze: 0, w: 0.6, h: 0.78, lean: 0, crescent: 0 },
  happy: { dx: 0.25, dy: 0.1, gaze: 0, w: 0.45, h: 0.47, lean: 24, crescent: 0.3 },
  lookLeft: { dx: 0.18, dy: 0.09, gaze: -0.35, w: 0.38, h: 0.6, lean: 0, crescent: 0 },
  lookRight: { dx: 0.18, dy: 0.09, gaze: 0.36, w: 0.38, h: 0.6, lean: 0, crescent: 0 },
  lookUp: { dx: 0.11, dy: 0.5, gaze: 0, w: 0.38, h: 0.56, lean: -19, crescent: 0 },
  lookDown: { dx: 0.12, dy: -0.5, gaze: -0.01, w: 0.38, h: 0.52, lean: 25, crescent: 0 },
  lookUpLeft: { dx: 0.08, dy: 0.46, gaze: -0.3, w: 0.38, h: 0.57, lean: 0, crescent: 0 },
  lookUpRight: { dx: 0.07, dy: 0.38, gaze: 0.28, w: 0.38, h: 0.57, lean: 0, crescent: 0 },
  lookDownLeft: { dx: 0.09, dy: -0.37, gaze: -0.34, w: 0.38, h: 0.52, lean: 11, crescent: 0 },
  lookDownRight: { dx: 0.08, dy: -0.45, gaze: 0.29, w: 0.38, h: 0.52, lean: 12, crescent: 0 },
  wink: { dx: 0.26, dy: 0.11, gaze: 0.03, w: 0.39, h: 0.49, lean: -1, crescent: 0 },
}
for (const [name, want] of Object.entries(APPROVED)) {
  const got = EXPRESSIONS[name].left
  for (const [k, v] of Object.entries(want)) {
    check(`approved ${name}.${k}`, got[k as keyof EyeShape] === v)
  }
}
// wink's right eye is tuned independently of happy — spec §2.
{
  const r = rightOf(EXPRESSIONS.wink)
  check('approved wink.R.dx', r.dx === 0.25)
  check('approved wink.R.dy', r.dy === 0.04)
  check('approved wink.R.gaze', r.gaze === -0.05)
  check('approved wink.R.w', r.w === 0.45)
  check('approved wink.R.h', r.h === 0.44)
  check('approved wink.R.crescent', r.crescent === 0.22)
  check('wink.R differs from happy', r.h !== EXPRESSIONS.happy.left.h)
}

// The deliberate asymmetries. Spec §5.3 — a future pass must not mirror these.
check(
  'lookUpLeft/Right dy differ on purpose',
  EXPRESSIONS.lookUpLeft.left.dy === 0.46 && EXPRESSIONS.lookUpRight.left.dy === 0.38,
)
check(
  'lookDownLeft/Right gaze magnitudes differ on purpose',
  Math.abs(EXPRESSIONS.lookDownLeft.left.gaze) === 0.34 &&
    Math.abs(EXPRESSIONS.lookDownRight.left.gaze) === 0.29,
)

// ── packEye: slot layout the shader reads ───────────────────────────
{
  const out = new Float32Array(24).fill(9)
  const e: EyeShape = { dx: 1, dy: 2, gaze: 6, w: 3, h: 4, lean: 90, crescent: 5 }
  packEye(e, out, 0)
  check('slot0 dx', out[0] === 1)
  check('slot1 dy', out[1] === 2)
  check('slot2 w', out[2] === 3)
  check('slot3 h', out[3] === 4)
  check('slot4 lean is RADIANS', Math.abs(out[4] - Math.PI / 2) < 1e-6)
  check('slot5 crescent', out[5] === 5)
  check('slot6 gaze', out[6] === 6)
  check(
    'slots 7..11 zeroed',
    Array.from(out.slice(7, 12)).every((v) => v === 0),
  )
  check('does not write past its 12 slots', out[12] === 9)
}

// ── lerpEye ─────────────────────────────────────────────────────────
{
  const a: EyeShape = { dx: 0, dy: 0, gaze: 0, w: 0, h: 0, lean: 0, crescent: 0 }
  const b: EyeShape = { dx: 1, dy: 2, gaze: 3, w: 4, h: 5, lean: 6, crescent: 7 }
  const m = lerpEye(a, b, 0.5)
  check('lerp midpoint dx', m.dx === 0.5)
  check('lerp midpoint gaze', m.gaze === 1.5)
  check('lerp midpoint crescent', m.crescent === 3.5)
  check('lerp t=0 is a', JSON.stringify(lerpEye(a, b, 0)) === JSON.stringify(a))
  check('lerp t=1 is b', JSON.stringify(lerpEye(a, b, 1)) === JSON.stringify(b))
  check('lerp interpolates EVERY field', Object.keys(m).length === Object.keys(b).length)
}

// ── pickWeighted ────────────────────────────────────────────────────
{
  const only = { ...Object.fromEntries(EXPRESSION_ORDER.map((k) => [k, 0])), happy: 1 }
  check('single positive weight always wins', pickWeighted(only, 0.99) === 'happy')
  check('rand 0 picks the first eligible', pickWeighted(only, 0) === 'happy')

  const none = Object.fromEntries(EXPRESSION_ORDER.map((k) => [k, 0]))
  // An owner who zeroes the pool wants the face at REST, not a fallback to an
  // expression they removed on purpose.
  check('empty pool returns null', pickWeighted(none, 0.5) === null)

  // avoid = NO_REPEAT. Dropped from the running total rather than re-rolled,
  // so a pool whose only positive weight IS the avoided entry still returns
  // something instead of spinning.
  check(
    'avoid excludes that entry',
    pickWeighted({ ...none, happy: 1, blink: 1 }, 0.1, 'happy') === 'blink',
  )
  check('avoid on a single-entry pool returns null', pickWeighted(only, 0.5, 'happy') === null)

  // Negative weights are treated as 0, never as a reversed contribution.
  check('negative weight is clamped out', pickWeighted({ ...none, happy: -5, blink: 1 }, 0.5) === 'blink')
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll eye shape checks passed.')
process.exit(failures ? 1 : 0)
