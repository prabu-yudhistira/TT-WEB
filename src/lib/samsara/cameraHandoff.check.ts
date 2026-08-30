/**
 * Pins the orthographic → perspective handoff.
 *
 * SAMSARA's orbit renders through an orthographic camera in CSS-pixel units;
 * the room needs perspective. At the seam the two must agree to sub-pixel or
 * the mascot visibly jumps size in one frame.
 *
 * This is exactly the class of error this project has been burned by twice by
 * trusting eyes over assertions: orbit direction had to be asserted via the
 * SIGN OF A CROSS PRODUCT because rotation through a tilted projection reads
 * backwards to a human, and the "hollow ring" eye bug was misdiagnosed from
 * thumbnails and half-fixed before a 715px render showed the crescents had been
 * solid all along.
 * Run: npm run verify:config
 */
import { solveHandoff, projectedPx } from './cameraHandoff'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}
const near = (a: number, b: number, eps: number) => Math.abs(a - b) < eps

// ── round trip ──────────────────────────────────────────────────────
// Solve for the distance that renders a given pixel size, project at that
// distance, get the size back. Sub-pixel across every size the sequence uses:
// ~21px at the far point, 28px at zero depth, up to 40% of viewport height
// when landed.
for (const targetPx of [21, 28, 120, 360]) {
  for (const viewportH of [900, 844, 1200]) {
    const sol = solveHandoff(targetPx, 1.0, viewportH, 45)
    const back = projectedPx(1.0, sol.distance, viewportH, 45)
    check(
      `round trip ${targetPx}px @${viewportH}h -> ${back.toFixed(4)}px`,
      near(back, targetPx, 0.01),
    )
  }
}

// Round trip must also hold across FOVs, since the room's FOV is CMS-tunable.
for (const fov of [30, 45, 60, 75]) {
  const sol = solveHandoff(120, 1.0, 900, fov)
  const back = projectedPx(1.0, sol.distance, 900, fov)
  check(`round trip holds at fov ${fov}`, near(back, 120, 0.01))
  check(`solveHandoff echoes its fov (${fov})`, sol.fovDeg === fov)
}

// ── monotonicity ────────────────────────────────────────────────────
// If this ever inverts, the three bounces would grow the wrong way and the
// whole fall would read backwards — the same "obvious once seen, invisible in
// code" defect as a reversed orbit.
{
  const a = projectedPx(1.0, 10, 900, 45)
  const b = projectedPx(1.0, 20, 900, 45)
  const c = projectedPx(1.0, 40, 900, 45)
  check(`further is smaller (${a.toFixed(1)} > ${b.toFixed(1)} > ${c.toFixed(1)})`, a > b && b > c)
}

// Solving for a BIGGER on-screen size must return a CLOSER distance.
{
  const small = solveHandoff(21, 1.0, 900, 45)
  const large = solveHandoff(360, 1.0, 900, 45)
  check('bigger target solves to a closer camera', large.distance < small.distance)
}

// A wider FOV at the same distance renders smaller.
{
  const narrow = projectedPx(1.0, 20, 900, 30)
  const wide = projectedPx(1.0, 20, 900, 60)
  check('wider fov renders smaller', wide < narrow)
}

// Doubling the world diameter doubles the pixels at a fixed distance.
{
  const one = projectedPx(1.0, 20, 900, 45)
  const two = projectedPx(2.0, 20, 900, 45)
  check('projected size is linear in world size', near(two, one * 2, 1e-9))
}

// Doubling viewport height doubles the pixels — the projection is in pixels,
// not fractions, which is what lets SIZE keep meaning literal pixels.
{
  const short = projectedPx(1.0, 20, 450, 45)
  const tall = projectedPx(1.0, 20, 900, 45)
  check('projected size is linear in viewport height', near(tall, short * 2, 1e-9))
}

// ── deterministic fixture ───────────────────────────────────────────
// projectedPx(worldD=1, dist=20, viewportH=900, fov=45)
//   frustum height at 20 = 2 * 20 * tan(22.5deg) = 16.5685
//   px = 900 * (1 / 16.5685) = 54.32
// If this ever fails, RE-DERIVE it — do not paste the new output, that would
// defeat the lock.
{
  check('fixture 54.32px', near(projectedPx(1.0, 20, 900, 45), 54.32, 0.02))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll camera handoff checks passed.')
process.exit(failures ? 1 : 0)
