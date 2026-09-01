/**
 * Fallback / clamp / round-trip for the eye resolver.
 * Run: npm run verify:config
 * Mirrors src/lib/mascot/resolveMascot.check.ts.
 */
import { EXPRESSION_ORDER } from './eyes'
import { DEFAULT_MASCOT_EYES } from './eyeTypes'
import { resolveMascotEyes, toMascotEyesPayload } from './resolveMascotEyes'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_MASCOT_EYES

// Nothing saved -> every field is the frozen default.
check('null cms -> defaults', JSON.stringify(resolveMascotEyes(null)) === JSON.stringify(d))
check('undefined cms -> defaults', JSON.stringify(resolveMascotEyes(undefined)) === JSON.stringify(d))
check('empty object -> defaults', JSON.stringify(resolveMascotEyes({})) === JSON.stringify(d))

// A sibling group applies while others fall back.
{
  const r = resolveMascotEyes({ mascotEyesBeat: { glanceSeconds: 1.4 } })
  check('sibling applies', r.GLANCE_SECONDS === 1.4)
  check('untouched sibling falls back', r.GLOW === d.GLOW)
}

// null inside a group falls back — Payload returns nulls for never-saved fields.
{
  const r = resolveMascotEyes({ mascotEyesLook: { glow: null, gap: null } })
  check('null glow -> default', r.GLOW === d.GLOW)
  check('null gap -> default', r.GAP === d.GAP)
}

// A malformed hex is rejected rather than passed to THREE.Color.
{
  const r = resolveMascotEyes({ mascotEyesLook: { color: 'not-a-colour', socketColor: '#ABC' } })
  check('bad hex -> default colour', r.COLOR === d.COLOR)
  check('short hex -> default socket', r.SOCKET === d.SOCKET)
}
{
  const r = resolveMascotEyes({ mascotEyesLook: { color: '#123ABC' } })
  check('valid hex applies', r.COLOR === '#123ABC')
}

// 0..1 fields are clamped, so a bad CMS value cannot produce a divide-by-zero
// or an inverted beat.
{
  const r = resolveMascotEyes({ mascotEyesBeat: { glancePeak: 5, chargeCrossover: -3 } })
  check('glancePeak clamped below 1', r.GLANCE_PEAK < 1 && r.GLANCE_PEAK > 0)
  check('chargeCrossover clamped above 0', r.CHARGE_CROSSOVER > 0 && r.CHARGE_CROSSOVER < 1)
}
{
  const r = resolveMascotEyes({ mascotEyesBeat: { glanceSeconds: 0 } })
  check('glanceSeconds floored above 0', r.GLANCE_SECONDS > 0)
}

// NaN / Infinity from a corrupt row must not reach the shader.
{
  const r = resolveMascotEyes({
    mascotEyesLook: { glow: Number.NaN, socketSpan: Number.POSITIVE_INFINITY },
  })
  check('NaN glow -> default', r.GLOW === d.GLOW)
  check('Infinite socketSpan -> default', r.SOCKET_SPAN === d.SOCKET_SPAN)
}

// FACE_RADIUS is not CMS-mapped and must always be the measured value.
check('FACE_RADIUS is never overridable', resolveMascotEyes({}).FACE_RADIUS === 0.5)

// Weights: a missing one falls back rather than becoming 0, which would
// silently drop that expression from the beat.
{
  const r = resolveMascotEyes({ mascotEyesWeights: { happy: 4 } })
  check('given weight applies', r.WEIGHTS.happy === 4)
  check('missing weight falls back', r.WEIGHTS.blink === d.WEIGHTS.blink)
  check(
    'every expression still has a weight',
    EXPRESSION_ORDER.every((k) => typeof r.WEIGHTS[k] === 'number'),
  )
}
{
  const r = resolveMascotEyes({ mascotEyesWeights: { happy: -2 } })
  check('negative weight clamped to 0', r.WEIGHTS.happy === 0)
}

// Round trip: perturb EVERY mapped field to a non-default value first.
// Round-tripping defaults against themselves is a near-tautology — the exact
// weakness the 2026-08-09 review found in resolveSeparation.check.ts.
{
  const perturbed: typeof d = {
    ENABLED: false,
    COLOR: '#112233',
    CORE: '#445566',
    SOCKET: '#778899',
    GLOW: 1.25,
    GAP: 0.51,
    SOCKET_SPAN: 1.9,
    // Not CMS-mapped, so like FACE_RADIUS it must be the DEFAULT here: the
    // round trip below asserts every field survives, and a non-mapped field can
    // only survive as whatever the resolver hands back.
    SOCKET_SPAN_Y: 0.95,
    SOCKET_FEATHER: 0.1,
    FACE_RADIUS: 0.5, // not mapped; must survive as the measured value
    SCANLINE_MAX: 14,
    SCANLINE_MIN_PX: 61,
    SCANLINE_RAMP: 22,
    GLANCE_SECONDS: 1.15,
    GLANCE_PEAK: 0.66,
    FACING_THRESHOLD: 0.12,
    CHARGE_CROSSOVER: 0.41,
    NO_REPEAT: true,
    WEIGHTS: Object.freeze(Object.fromEntries(EXPRESSION_ORDER.map((k, i) => [k, (i % 4) + 1]))),
  }
  const round = resolveMascotEyes(toMascotEyesPayload(perturbed))
  for (const k of Object.keys(perturbed) as (keyof typeof perturbed)[]) {
    check(`round trip preserves ${k}`, JSON.stringify(round[k]) === JSON.stringify(perturbed[k]))
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll eye resolver checks passed.')
process.exit(failures ? 1 : 0)
