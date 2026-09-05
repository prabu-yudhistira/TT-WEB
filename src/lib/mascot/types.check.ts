/**
 * Assertions for the frozen mascot defaults.
 * Run: npm run verify:config
 *
 * Mirrors src/lib/satellites/types.check.ts. This repo has no test runner;
 * this follows the existing `seed:verify` idiom of a plain tsx script that throws.
 */
import { DEFAULT_MASCOT } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_MASCOT
const HEX = /^#[0-9a-fA-F]{6}$/

check('defaults are frozen', Object.isFrozen(d))

// HEIGHT is load-bearing: it biases depth toward the viewer so the mascot never
// sorts wrongly against a bead despite orbiting inside the bead band. Spec §5.1.
check('HEIGHT is positive', d.HEIGHT > 0)

// Fractions the engine multiplies alphas / sizes by.
for (const [k, v] of [
  ['OPACITY', d.OPACITY],
  ['TRAIL_GLOW', d.TRAIL_GLOW],
  ['TRAIL_OPACITY', d.TRAIL_OPACITY],
  ['TRAIL_TWINKLE', d.TRAIL_TWINKLE],
] as const) {
  check(`${k} within 0..1`, v >= 0 && v <= 1)
}

check('RADIUS positive', d.RADIUS > 0)
check('MOBILE_RADIUS positive', d.MOBILE_RADIUS > 0)
check('SIZE positive', d.SIZE > 0)
check('MOBILE_SIZE positive', d.MOBILE_SIZE > 0)
check('SPEED_SCALE non-negative', d.SPEED_SCALE >= 0)
check('TRAIL_SECONDS positive', d.TRAIL_SECONDS > 0)
check('TRAIL_DENSITY non-negative', d.TRAIL_DENSITY >= 0)

check('dust colour is hex', HEX.test(d.TRAIL_COLOR))
check('dust core colour is hex', HEX.test(d.TRAIL_CORE_COLOR))
check('label colour is hex', HEX.test(d.LABEL_COLOR))
check('label text is non-empty', typeof d.LABEL_TEXT === 'string' && d.LABEL_TEXT.trim().length > 0)

// Every value strictly INSIDE the CMS range it will be clamped to (Task 6
// defines the ranges; these bounds must match). A value on the boundary means
// the slider stopped where taste was still heading. Spec §5.3.
const inside = (label: string, v: number, lo: number, hi: number) =>
  check(`${label} strictly inside [${lo}, ${hi}]`, v > lo && v < hi)
inside('RADIUS', d.RADIUS, 0.3, 2.5)
inside('MOBILE_RADIUS', d.MOBILE_RADIUS, 0.3, 2.5)
inside('SPEED_SCALE', d.SPEED_SCALE, 0, 3)
inside('SIZE', d.SIZE, 20, 420)
inside('MOBILE_SIZE', d.MOBILE_SIZE, 16, 300)
inside('SPIN_SPEED', d.SPIN_SPEED, -180, 180)
inside('DEPTH_SCALE', d.DEPTH_SCALE, 0, 3)
inside('HEIGHT', d.HEIGHT, 20, 300)
inside('TRAIL_DENSITY', d.TRAIL_DENSITY, 0, 400)
inside('TRAIL_SECONDS', d.TRAIL_SECONDS, 0.05, 5)

// The owner's approved values, pinned. A future drift should be a deliberate
// act with the owner in the loop, not a silent diff.
check('approved RADIUS', d.RADIUS === 0.71)
check('approved HEIGHT', d.HEIGHT === 70)
check('approved SIZE', d.SIZE === 28)
check('approved SPIN_SPEED', d.SPIN_SPEED === 113)
check('approved SPEED_SCALE', d.SPEED_SCALE === 0.52)
check('approved DEPTH_SCALE (not the satellites 0.9)', d.DEPTH_SCALE === 0.3)
check('approved additive trail', d.TRAIL_ADDITIVE === true)
check('approved dust colour', d.TRAIL_COLOR === '#FDB721')
check('approved dust core colour', d.TRAIL_CORE_COLOR === '#FFFCD6')
check('approved label text', d.LABEL_TEXT === 'SAMSARA')
check('approved label halo off', d.LABEL_HALO === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll mascot default checks passed.')
process.exit(failures ? 1 : 0)
