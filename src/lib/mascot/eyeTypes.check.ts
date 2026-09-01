/**
 * Assertions for the frozen eye configuration — the CMS-editable surface.
 * The SHAPES are not here; they are frozen in eyes.ts (spec §7.1).
 * Run: npm run verify:config
 */
import { EXPRESSION_ORDER } from './eyes'
import { DEFAULT_MASCOT_EYES } from './eyeTypes'

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
const HEX = /^#[0-9a-fA-F]{6}$/

check('defaults are frozen', Object.isFrozen(d))
check('weights are frozen', Object.isFrozen(d.WEIGHTS))

// Approved values, verbatim from spec §5.2.
check('approved COLOR', d.COLOR === '#F2A81C')
check('approved CORE', d.CORE === '#FFF0BE')
check('approved SOCKET (pure black, not the old #06080B)', d.SOCKET === '#000000')
check('approved GLOW', d.GLOW === 0.55)
check('approved GAP', d.GAP === 0.38)
check('approved SOCKET_SPAN', d.SOCKET_SPAN === 1.34)
// ⚠️ MEASURED 2026-09-01, not chosen. The socket is an ELLIPSE because the face
// opening is: a circle wide enough to cover where the eyes travel horizontally
// (lookUpLeft reaches ~1.35) also reaches far enough vertically to black out the
// monogram plaque above the face and the ornamental chin band below it. Both are
// modelled relief, and both were being swallowed — invisible at the hero's
// 12.6-70px, obvious the moment the room shows the body at 400px+.
//
// 0.95 was found by sweeping the span live and checking two things at once: the
// plaque and chin clear, AND no painted amber leaks at the most extreme gaze
// (lookUpLeft). Re-measure with __ttMascotSock if the source mesh changes.
check('measured SOCKET_SPAN_Y', d.SOCKET_SPAN_Y === 0.95)
check(
  'the socket is shorter than it is wide, or it is not clearing the plaque',
  d.SOCKET_SPAN_Y < d.SOCKET_SPAN,
)
check('approved SCANLINE_MAX', d.SCANLINE_MAX === 9)
check('approved SCANLINE_MIN_PX', d.SCANLINE_MIN_PX === 44)
check('approved SCANLINE_RAMP', d.SCANLINE_RAMP === 12)
check('approved GLANCE_SECONDS', d.GLANCE_SECONDS === 0.6)
check('approved GLANCE_PEAK', d.GLANCE_PEAK === 0.45)
check('approved FACING_THRESHOLD', d.FACING_THRESHOLD === 0.3)
check('approved CHARGE_CROSSOVER', d.CHARGE_CROSSOVER === 0.7)
check('approved NO_REPEAT', d.NO_REPEAT === false)
check('enabled by default', d.ENABLED === true)

check('COLOR is hex', HEX.test(d.COLOR))
check('CORE is hex', HEX.test(d.CORE))
check('SOCKET is hex', HEX.test(d.SOCKET))

// FACE_RADIUS is MEASURED, not taste: the smooth front cap ends at 0.50 model
// units and the bezel relief begins. Spec §4.1 / §7.2 — deliberately NOT a CMS
// field, because a control inviting someone to move it can only break the mask.
check('FACE_RADIUS is the measured 0.50', d.FACE_RADIUS === 0.5)

// Fractions the engine uses directly.
check('GLANCE_PEAK within 0..1', d.GLANCE_PEAK > 0 && d.GLANCE_PEAK < 1)
check('CHARGE_CROSSOVER within 0..1', d.CHARGE_CROSSOVER > 0 && d.CHARGE_CROSSOVER < 1)
check('GLANCE_SECONDS positive', d.GLANCE_SECONDS > 0)
check('SOCKET_SPAN positive', d.SOCKET_SPAN > 0)
check('SOCKET_SPAN_Y positive', d.SOCKET_SPAN_Y > 0)

// Every expression must carry a weight. A missing key reads as 0 in
// pickWeighted, which would silently drop that expression from the beat.
for (const name of EXPRESSION_ORDER) {
  check(`weight present for ${name}`, typeof d.WEIGHTS[name] === 'number')
}
check(
  'no weight for an unknown expression',
  Object.keys(d.WEIGHTS).every((k) => EXPRESSION_ORDER.includes(k)),
)

// neutral is the rest state; wide belongs to the hold reaction. Spec §5.4.
check('neutral is not in the glance pool', d.WEIGHTS.neutral === 0)
check('wide is not in the glance pool', d.WEIGHTS.wide === 0)
check('blink is the most frequent', d.WEIGHTS.blink === 2)
check('pool is not empty', EXPRESSION_ORDER.some((k) => d.WEIGHTS[k] > 0))

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll eye config checks passed.')
process.exit(failures ? 1 : 0)
