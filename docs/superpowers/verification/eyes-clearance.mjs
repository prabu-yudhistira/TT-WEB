/**
 * How close does each eye come to the socket mask?
 *
 * ⛔ STALE, AND KNOWN TO BE — do not trust the numbers below without re-deriving
 * them. Left in place because deleting it would lose the only record of the
 * question; fixing it needs a measurement nobody has made yet.
 *
 * TWO things are wrong with it as of the fifth socket pass (2026-09-01):
 *
 *  1. It models a CIRCULAR socket. The shader's cover became an ELLIPSE
 *     (uSocketSpan x uSocketSpanY) when the monogram plaque and chin band
 *     stopped being blacked out, so `reach` — a plain Euclidean radius — is not
 *     the quantity the shader tests. It prints CLIPPED for six expressions
 *     against SOCKET_SPAN 1.27 and still exits 0, because its pass/fail
 *     compares `worstOverall` to a FIXED baseline and never looks at the span
 *     at all. A gate that shouts CLIPPED and passes is worse than no gate.
 *
 *  2. The obvious repair — measure the rim in the ellipse's normalised space —
 *     was written, and it disagreed with the renderer. It scored lookUpLeft at
 *     13% of the blob clipped, while eyeshots/lookUpLeft.png at the same config
 *     shows a whole, rounded eye with dark socket clearly above it. Rendering
 *     the same expression at SOCKET_SPAN_Y 2.60 (a cover so wide it cannot clip
 *     anything) produced the same eye shape. So the flat-plane model is missing
 *     something real about how the display maps onto the DOME — vTtObjPos is a
 *     position on a sphere, not on a plane — and the rewrite was reverted rather
 *     than shipped on the strength of an argument the picture contradicts.
 *
 * To fix it properly: establish empirically what p-space range the front cap
 * actually spans on the mesh (sweep __ttMascotSock and watch where the cover's
 * edge lands relative to the plaque), then rebuild the test around that. Until
 * then the load-bearing checks for the socket are the RENDER gates, which
 * measure pixels instead of arithmetic: eyes-render.mjs and eyes-kill-switch.mjs.
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
