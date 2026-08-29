/**
 * How close does each eye come to the socket mask?
 *
 * The shader HARD-RETURNS when r > SOCKET_SPAN — there is no fade, so anything
 * past it is cut with a sharp edge. The approved values leave no headroom:
 * lookUpLeft already reaches 1.354 against a span of 1.34. That overshoot is
 * ~1.7px at 715px and sub-pixel at ship size, so it is the RECORDED BASELINE
 * rather than a failure. This script fails on anything WORSE than that.
 *
 * Pure geometry, no browser: reads the frozen shapes and config directly.
 * Run: node --import tsx docs/superpowers/verification/eyes-clearance.mjs
 */
import { EXPRESSIONS, EXPRESSION_ORDER, rightOf } from '../../../src/lib/mascot/eyes.ts'
import { DEFAULT_MASCOT_EYES } from '../../../src/lib/mascot/eyeTypes.ts'

const { GAP, SOCKET_SPAN } = DEFAULT_MASCOT_EYES
// The worst overshoot the owner approved, 2026-08-28. Spec §6.
const BASELINE_WORST = 1.36

const rimMax = (s, side) => {
  const cx = (GAP + s.dx) * side + s.gaze
  const cy = s.dy
  const a = (s.lean * side * Math.PI) / 180
  let worst = 0
  for (let i = 0; i < 720; i++) {
    const th = (i / 720) * Math.PI * 2
    const ex = s.w * Math.cos(th)
    const ey = s.h * Math.sin(th)
    // A leaned ellipse's extreme is not simply centre + w, so sample the rim.
    const rx = ex * Math.cos(a) - ey * Math.sin(a)
    const ry = ex * Math.sin(a) + ey * Math.cos(a)
    worst = Math.max(worst, Math.hypot(cx + rx, cy + ry))
  }
  return worst
}

let failures = 0
let worstOverall = 0
console.log(`socket span ${SOCKET_SPAN}   (smooth front cap ends at 1.00)\n`)
const rows = EXPRESSION_ORDER.map((name) => {
  const e = EXPRESSIONS[name]
  return { name, reach: Math.max(rimMax(e.left, -1), rimMax(rightOf(e), 1)) }
}).sort((a, b) => b.reach - a.reach)

for (const r of rows) {
  worstOverall = Math.max(worstOverall, r.reach)
  const m = SOCKET_SPAN - r.reach
  const flag = m < 0 ? 'CLIPPED' : m < 0.06 ? 'tight' : ''
  console.log(`  ${r.name.padEnd(15)} reach ${r.reach.toFixed(3)}  margin ${m.toFixed(3)}  ${flag}`)
}

const ok = worstOverall <= BASELINE_WORST
if (!ok) failures++
console.log(
  `\n${ok ? 'ok  ' : 'FAIL'}  worst reach ${worstOverall.toFixed(3)} vs recorded baseline ${BASELINE_WORST}`,
)
if (!ok) {
  console.error('      A shape now reaches further than the owner approved. Either pull it back,')
  console.error('      or raise SOCKET_SPAN — which is the documented release valve (spec §6).')
}
process.exit(failures ? 1 : 0)
