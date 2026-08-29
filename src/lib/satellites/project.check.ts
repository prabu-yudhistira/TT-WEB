/**
 * Pins the shared orbital projection. BOTH SatelliteEngine and MascotEngine
 * now call projectOrbit()/orbitGeometry(); this makes the extraction from
 * SatelliteEngine's old inline math a change that cannot pass silently.
 * Run: npm run verify:config
 */
import { projectOrbit, orbitGeometry, type OrbitPlane } from './project'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

const plane: OrbitPlane = { TILT: 20, TILT_SIDEWAY: 160, PERSPECTIVE: 1300 }
const tiltRad = (plane.TILT * Math.PI) / 180

// angle 0: point is on +x of the orbit, z should be ~0 (at the plane crossing),
// scale should be ~1 (no perspective divide at zero depth).
{
  const p = projectOrbit(plane, 100, 100, 300, 0, 0, tiltRad)
  check('angle 0 -> z ~ 0', near(p.z, 0, 1e-9))
  check('angle 0 -> scale ~ 1', near(p.scale, 1, 1e-9))
}

// The sign of z must flip between the near and far halves of the orbit — this
// is what the mascot's canvas z-index and the satellites' back/front split key
// off. angle pi/2 vs 3pi/2.
{
  const near90 = projectOrbit(plane, 100, 100, 300, Math.PI / 2, 0, tiltRad)
  const far270 = projectOrbit(plane, 100, 100, 300, (3 * Math.PI) / 2, 0, tiltRad)
  check('z changes sign across the orbit', Math.sign(near90.z) === -Math.sign(far270.z))
  check('z is non-zero at the sides', Math.abs(near90.z) > 1)
}

// Deterministic fixture. Values computed from the projection math for
// projectOrbit({TILT:20,TILT_SIDEWAY:160,PERSPECTIVE:1300}, cx640 cy400, r300,
// angle pi/3, height 12, tilt 20deg). If this ever fails, RE-DERIVE it — do not
// just paste the new output, that would defeat the lock.
{
  const p = projectOrbit(plane, 640, 400, 300, Math.PI / 3, 12, tiltRad)
  check('fixture x ~ 492.1', Math.abs(p.x - 492.1) < 0.5)
  check('fixture y ~ 363.9', Math.abs(p.y - 363.9) < 0.5)
  check('fixture z ~ 240.0', Math.abs(p.z - 240.0) < 0.5)
  check('fixture scale ~ 0.8441', Math.abs(p.scale - 0.8441) < 0.001)
}

// orbitGeometry: outerR is always strictly above innerR (an inverted span
// would seed particles inside the orbit floor).
{
  const cfg = {
    INNER_RADIUS: 3,
    OUTER_RADIUS: 1.6,
    MOBILE_INNER_RADIUS: 1.5,
    MOBILE_OUTER_RADIUS: 0.78,
  }
  const desktop = orbitGeometry(cfg, 1440, 900, { cx: 720, cy: 450, hh: 180 }, false)
  check('desktop outerR > innerR', desktop.outerR > desktop.innerR)
  check('desktop centre passed through', desktop.cx === 720 && desktop.cy === 450)
  const mobile = orbitGeometry(cfg, 390, 844, { cx: 195, cy: 300, hh: 90 }, true)
  check('mobile outerR > innerR', mobile.outerR > mobile.innerR)
  // A tall narrow window can make INNER_RADIUS 3 of a tall mark exceed a radius
  // measured off the short side — the floor must still hold.
  const tall = orbitGeometry(cfg, 400, 1600, { cx: 200, cy: 800, hh: 300 }, false)
  check('tall-window outerR > innerR', tall.outerR > tall.innerR)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll projection checks passed.')
process.exit(failures ? 1 : 0)
