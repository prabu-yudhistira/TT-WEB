/**
 * Assertions for the frozen satellite defaults.
 * Run: npm run verify:config
 *
 * Mirrors resolveIgnition.check.ts. This repo has no test runner; this follows
 * the existing `seed:verify` idiom of a plain tsx script that throws.
 */
import { DEFAULT_SATELLITES } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_SATELLITES
const HEX = /^#[0-9a-fA-F]{6}$/

check('defaults are frozen', Object.isFrozen(d))

// Orbit band must be ordered, or seed() spreads satellites backwards.
check('radius band ordered', d.SAT_RADIUS_MIN <= d.SAT_RADIUS_MAX)
check('radius band positive', d.SAT_RADIUS_MIN > 0)

// Dust seeds across innerR..outerR; an inverted span puts particles inside
// the orbit floor. The engine floors outerR, but the defaults should not
// depend on that rescue.
check('outer radius positive', d.OUTER_RADIUS > 0)
check('mobile outer radius positive', d.MOBILE_OUTER_RADIUS > 0)
check('inner radius positive', d.INNER_RADIUS > 0)
check('mobile inner radius positive', d.MOBILE_INNER_RADIUS > 0)

// Fractions that the engine multiplies alphas by.
for (const [k, v] of [
  ['SAT_ALPHA', d.SAT_ALPHA],
  ['DUST_ALPHA', d.DUST_ALPHA],
  ['SAT_SHADE', d.SAT_SHADE],
  ['SAT_STREAK', d.SAT_STREAK],
  ['DUST_STREAK', d.DUST_STREAK],
] as const) {
  check(`${k} within 0..1`, v >= 0 && v <= 1)
}

check('trail within 0..50', d.TRAIL >= 0 && d.TRAIL <= 50)
check('orbit direction is +/-1', d.ORBIT_DIR === 1 || d.ORBIT_DIR === -1)
check('label mode is known', ['hover', 'always', 'none'].includes(d.LABEL_MODE))

check('base colour is hex', HEX.test(d.SAT_COLOR))
check(
  'every satellite colour is hex',
  d.SAT_COLORS.every((c) => HEX.test(c)),
)
check('label colour is hex', HEX.test(d.LABEL_COLOR))
check('dust colour is hex', HEX.test(d.DUST_COLOR))

// The owner's approved values, pinned. If a future edit drifts these, it
// should be a deliberate act with the owner in the loop, not a silent diff.
check('approved orbit band', d.SAT_RADIUS_MIN === 0.5 && d.SAT_RADIUS_MAX === 0.8)
check('approved outer radius', d.OUTER_RADIUS === 1.6)
check('approved orbit speed', d.ORBIT_SPEED === 2.2)
check('approved counter-clockwise', d.ORBIT_DIR === -1)
check('approved labels always on', d.LABEL_MODE === 'always')
check('dust off', d.DUST_COUNT === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll satellite default checks passed.')
process.exit(failures ? 1 : 0)
