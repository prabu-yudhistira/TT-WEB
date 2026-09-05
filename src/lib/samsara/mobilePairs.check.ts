/**
 * Pins `mobilePairs` — every portrait value is reachable from the bench.
 *
 * This is a COVERAGE check, not a value pin. It walks `DEFAULT_SEQUENCE` for
 * anything named `MOBILE_*` and fails if it is not paired with the landscape
 * control it stands in for.
 *
 * ⚠️ Written because ten portrait values shipped with no way to tune them. The
 * bench listed the three `LANDING.MOBILE_*` sliders and stopped there;
 * `EMITTERS.MOBILE_SIZE_FRAC`, both mobile orb slots and all three
 * `HOLOGRAM.MOBILE_*` were live on every phone and editable only by hand in
 * `types.ts`. Nothing said so — the config had them, the renderer read them,
 * and the bench simply had no row. Same failure the idle-eye weights are
 * generated from `eyes.ts` to avoid: a hand-written list is how a value ends up
 * untunable.
 *
 * ⚠️ PROVE IT CAN FAIL. A coverage check that has never gone red is decoration:
 *
 *     TT_BREAK_PAIRS=1 node --import tsx src/lib/samsara/mobilePairs.check.ts
 *
 * drops one pair from the map and every uncovered-value assertion must go red.
 *
 * Run: node --import tsx src/lib/samsara/mobilePairs.check.ts
 */
import { DEFAULT_SEQUENCE } from './types'
import { MOBILE_PATHS } from './mobilePairs'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  }
}

const BREAK = process.env.TT_BREAK_PAIRS === '1'
const pairs: Record<string, string> = { ...MOBILE_PATHS }
if (BREAK) {
  const victim = Object.keys(pairs)[0]
  delete pairs[victim]
  console.log(`\n⚠️  TT_BREAK_PAIRS=1 — "${victim}" removed from the map.`)
  console.log('    Its portrait value must now report as unreachable.\n')
}

type Plain = Record<string, unknown>
const isPlainObject = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every leaf path in the config, dotted. Arrays are leaves — none are paired. */
const leaves = (node: unknown, prefix = ''): string[] => {
  if (!isPlainObject(node)) return prefix ? [prefix] : []
  return Object.entries(node).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  )
}

const allLeaves = leaves(DEFAULT_SEQUENCE)
const isMobilePath = (p: string) => p.split('.').some((seg) => seg.startsWith('MOBILE_'))

// ── 1. the walk itself has to be working ────────────────────────────
//
// A coverage check whose walk silently returns nothing would pass forever. Two
// values it MUST see, one nested inside a group, are asserted directly.
check('the config walk reaches nested leaves', allLeaves.includes('EMITTERS.MOBILE_NEAR.X_FRAC'))
check('and top-level ones', allLeaves.includes('LANDING.MOBILE_SIZE_FRAC'))

const mobileLeaves = allLeaves.filter(isMobilePath)
check('there are portrait values to cover at all', mobileLeaves.length >= 13, `${mobileLeaves.length} found`)

// ── 2. every portrait value is reachable from a landscape control ────
const covered = new Set(Object.values(pairs))
for (const leaf of mobileLeaves) {
  check(`${leaf} is reachable from the bench`, covered.has(leaf))
}

// ── 3. the map itself is sane ────────────────────────────────────────
//
// Typos here fail SILENTLY at runtime — `setPath` happily creates a branch that
// nothing reads, so a mistyped target would look like a working slider that
// changes nothing. Both sides are resolved against the real config instead.
const at = (path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (isPlainObject(o) ? o[k] : undefined), DEFAULT_SEQUENCE)

for (const [desktop, mobile] of Object.entries(MOBILE_PATHS)) {
  check(`${desktop} exists in the config`, at(desktop) !== undefined)
  check(`${mobile} exists in the config`, at(mobile) !== undefined)
  check(
    `${desktop} and its portrait twin are the same type`,
    typeof at(desktop) === typeof at(mobile),
    `${typeof at(desktop)} vs ${typeof at(mobile)}`,
  )
  // A landscape key that is itself a MOBILE_ path would mean the map points
  // portrait at portrait, and the desktop value would become unreachable
  // instead — the same bug, mirrored.
  check(`${desktop} is the landscape side`, !isMobilePath(desktop))
  check(`${mobile} is the portrait side`, isMobilePath(mobile))
}

// One control, one twin. Two landscape paths pointing at the same portrait
// value would make one of them silently edit the other's slider in mobile mode.
const targets = Object.values(MOBILE_PATHS)
check('no portrait value is claimed by two controls', new Set(targets).size === targets.length)

if (BREAK) {
  const ok = failures > 0
  console.log(
    ok
      ? `\nGood: ${failures} assertion(s) went red with a pair removed — the check discriminates.`
      : '\nBAD: dropping a pair changed nothing. This check is not testing coverage.',
  )
  process.exit(ok ? 0 : 1)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nEvery portrait value is tunable.')
process.exit(failures ? 1 : 0)
