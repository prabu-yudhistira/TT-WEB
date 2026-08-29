/**
 * Fallback / clamp / round-trip for the mascot resolver.
 * Run: npm run verify:config
 * Mirrors src/lib/satellites/resolveSatellites.check.ts.
 */
import { DEFAULT_MASCOT } from './types'
import { resolveMascot, toMascotPayload } from './resolveMascot'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// Nothing saved -> every field is the frozen default.
{
  const d = DEFAULT_MASCOT
  check('null cms -> defaults', JSON.stringify(resolveMascot(null)) === JSON.stringify(d))
  check('undefined cms -> defaults', JSON.stringify(resolveMascot(undefined)) === JSON.stringify(d))
  check('empty object -> defaults', JSON.stringify(resolveMascot({})) === JSON.stringify(d))
}

// A sibling group is respected while others fall back.
{
  const r = resolveMascot({ mascotSpin: { spinSpeed: 40 } })
  check('sibling applies', r.SPIN_SPEED === 40)
  check('untouched sibling falls back', r.RADIUS === DEFAULT_MASCOT.RADIUS)
}

// null inside a group falls back (Payload returns nulls for never-saved fields).
{
  const r = resolveMascot({ mascotOrbit: { radius: null, height: null } })
  check('null radius -> default', r.RADIUS === DEFAULT_MASCOT.RADIUS)
  check('null height -> default', r.HEIGHT === DEFAULT_MASCOT.HEIGHT)
}

// 0..1 fields are clamped.
{
  const r = resolveMascot({ mascotTrail: { opacity: 5, glow: -2 }, mascotLook: { opacity: 9 } })
  check('trail opacity clamped to 1', r.TRAIL_OPACITY === 1)
  check('trail glow clamped to 0', r.TRAIL_GLOW === 0)
  check('mascot opacity clamped to 1', r.OPACITY === 1)
}

// Invalid hex falls back rather than reaching the shader.
{
  const r = resolveMascot({ mascotTrail: { color: 'nope', coreColor: '#GGGGGG' } })
  check('bad dust colour -> default', r.TRAIL_COLOR === DEFAULT_MASCOT.TRAIL_COLOR)
  check('bad core colour -> default', r.TRAIL_CORE_COLOR === DEFAULT_MASCOT.TRAIL_CORE_COLOR)
}

// Empty / whitespace label text falls back to the default word, never renders blank.
{
  check(
    'empty label text -> default',
    resolveMascot({ mascotLabelText: '' }).LABEL_TEXT === DEFAULT_MASCOT.LABEL_TEXT,
  )
  check(
    'blank label text -> default',
    resolveMascot({ mascotLabelText: '   ' }).LABEL_TEXT === DEFAULT_MASCOT.LABEL_TEXT,
  )
  check(
    'real label text passes through',
    resolveMascot({ mascotLabelText: 'KARMA' }).LABEL_TEXT === 'KARMA',
  )
}

// Round trip: perturb EVERY mapped field to a non-default value, then
// resolve(toPayload(perturbed)) must equal perturbed. Round-tripping the
// defaults against themselves is a near-tautology — this catches a field the
// inverse forgot.
{
  const d = DEFAULT_MASCOT
  const perturbed: typeof d = {
    ...d,
    ENABLED: !d.ENABLED,
    RADIUS: d.RADIUS + 0.13,
    MOBILE_RADIUS: d.MOBILE_RADIUS + 0.11,
    HEIGHT: d.HEIGHT + 17,
    TILT_OFFSET: d.TILT_OFFSET + 7,
    PHASE: d.PHASE + 33,
    SPEED_SCALE: d.SPEED_SCALE + 0.21,
    SIZE: d.SIZE + 9,
    MOBILE_SIZE: d.MOBILE_SIZE + 6,
    DEPTH_SCALE: d.DEPTH_SCALE + 0.17,
    OPACITY: 0.7,
    ENV_INTENSITY: d.ENV_INTENSITY + 0.4,
    LIGHT_INTENSITY: d.LIGHT_INTENSITY + 0.6,
    SPIN_SPEED: d.SPIN_SPEED - 40,
    SPIN_TILT: d.SPIN_TILT + 8,
    BOB_PX: d.BOB_PX + 12,
    BOB_SECONDS: d.BOB_SECONDS + 2,
    TRAIL_ENABLED: !d.TRAIL_ENABLED,
    TRAIL_SECONDS: d.TRAIL_SECONDS + 0.3,
    TRAIL_DENSITY: d.TRAIL_DENSITY + 25,
    TRAIL_SIZE: d.TRAIL_SIZE + 3,
    TRAIL_SPREAD: d.TRAIL_SPREAD + 2,
    TRAIL_DRIFT: d.TRAIL_DRIFT + 7,
    TRAIL_GLOW: 0.4,
    TRAIL_CORE_COLOR: '#123456',
    TRAIL_COLOR: '#abcdef',
    TRAIL_OPACITY: 0.33,
    TRAIL_TWINKLE: 0.66,
    TRAIL_ADDITIVE: !d.TRAIL_ADDITIVE,
    LABEL_ENABLED: !d.LABEL_ENABLED,
    LABEL_TEXT: 'MOKSHA',
    LABEL_SIZE: d.LABEL_SIZE + 4,
    LABEL_COLOR: '#654321',
    LABEL_OFFSET: d.LABEL_OFFSET + 6,
    LABEL_HALO: 2,
    HOLD_FREEZE: !d.HOLD_FREEZE,
    HOLD_SHAKE_PX: d.HOLD_SHAKE_PX + 3,
    HOLD_SHAKE_SPEED: d.HOLD_SHAKE_SPEED + 0.5,
    ENTRANCE_MS: d.ENTRANCE_MS + 400,
    SCROLL_FADE_VH: d.SCROLL_FADE_VH + 0.4,
  }
  const round = resolveMascot(toMascotPayload(perturbed))
  for (const k of Object.keys(perturbed) as (keyof typeof perturbed)[]) {
    check(`round trip preserves ${k}`, JSON.stringify(round[k]) === JSON.stringify(perturbed[k]))
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll mascot resolver checks passed.')
process.exit(failures ? 1 : 0)
