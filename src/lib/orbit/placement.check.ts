/**
 * Assertions for orbit placement and plane geometry.
 * Run: npm run verify:config
 *
 * The hero's whole claim is that a business always lands in the same place, so
 * determinism is the property most worth pinning down here.
 */
import { PLANES, PLANE_IDS, RING_ARC, RING_BANDS, orbitPoint, phaseAt } from './planes'
import {
  INK_HEX,
  KIND_SHAPE,
  RADIUS_MAX,
  RADIUS_MIN,
  SIZE_PX,
  TRAIL_SAMPLES,
  depthAlpha,
  depthScale,
  hash32,
  phaseFor,
  planeFor,
  radiusFactor,
  unitHash,
} from './placement'
import type { BusinessKind, PlanetInk, PlanetSize, TrailLength } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const NAMES = Array.from({ length: 240 }, (_, i) => `business-${i}`)

// ---------- hashing ----------
check('hash32 is deterministic', hash32('Homeslice') === hash32('Homeslice'))
check('hash32 separates near-identical inputs', hash32('Homeslice') !== hash32('Homeslicf'))
check('hash32 stays a uint32', NAMES.every((n) => hash32(n) >= 0 && hash32(n) <= 0xffffffff))
check(
  'unitHash lands in [0,1)',
  NAMES.every((n) => {
    const u = unitHash(n, 'phase')
    return u >= 0 && u < 1
  }),
)
check('unitHash salts are independent', unitHash('x', 'phase') !== unitHash('x', 'radius'))

// ---------- plane assignment ----------
check('an explicit plane wins over the hash', planeFor('anything', 'c') === 'c')
check('no explicit plane still yields a valid plane', PLANE_IDS.includes(planeFor('anything', null)))
{
  const counts = { a: 0, b: 0, c: 0 }
  NAMES.forEach((n) => counts[planeFor(n, null)]++)
  // 240 names over 3 planes: a fair spread is 80 each. Anything under 40 means
  // the hash is biased enough that one plane would look empty on a real site.
  check(
    `planes are spread (a=${counts.a} b=${counts.b} c=${counts.c})`,
    counts.a >= 40 && counts.b >= 40 && counts.c >= 40,
  )
}

// ---------- phase ----------
check(
  'phaseFor stays inside one revolution',
  NAMES.every((n) => phaseFor(n) >= 0 && phaseFor(n) < Math.PI * 2),
)
check('phaseFor is deterministic', phaseFor('Homeslice') === phaseFor('Homeslice'))

// ---------- radius ----------
{
  const older = radiusFactor('same-seed', 1998, 1998, 2026)
  const newer = radiusFactor('same-seed', 2026, 1998, 2026)
  check('an older business orbits tighter', older < newer)

  const all = NAMES.map((n) => radiusFactor(n, 2010, 1998, 2026))
  check(
    'radius stays inside the band plus jitter',
    all.every((r) => r > RADIUS_MIN - 0.06 && r < RADIUS_MAX + 0.06),
  )

  const noYear = radiusFactor('seed', null, 1998, 2026)
  check('a missing year sits mid-band', noYear > 0.94 && noYear < 1.06)

  const oneYear = radiusFactor('seed', 2026, 2026, 2026)
  check('a single shared year sits mid-band', oneYear > 0.94 && oneYear < 1.06)

  check(
    'two businesses of the same year do not share an orbit',
    radiusFactor('alpha', 2020, 1998, 2026) !== radiusFactor('beta', 2020, 1998, 2026),
  )
}

// ---------- geometry ----------
{
  const R = 200
  for (const id of PLANE_IDS) {
    const plane = PLANES[id]
    const samples = Array.from({ length: 64 }, (_, i) => orbitPoint(plane, R, 1, (i / 64) * Math.PI * 2))
    const maxR = Math.max(...samples.map((p) => Math.hypot(p.x, p.y)))
    check(
      `plane ${id} never exceeds its major radius`,
      maxR <= plane.rx * R + 1e-6,
    )
    check(
      `plane ${id} bottoms out at its minor radius`,
      Math.min(...samples.map((p) => Math.hypot(p.x, p.y))) >= plane.ry * R - 1e-6,
    )
    check(
      `plane ${id} depth stays in [-1,1]`,
      samples.every((p) => p.depth >= -1.000001 && p.depth <= 1.000001),
    )
  }

  const a = PLANES.a
  const start = orbitPoint(a, R, 1, 0)
  const half = orbitPoint(a, R, 1, Math.PI)
  check('opposite parameters are opposite points', Math.abs(start.x + half.x) < 1e-9)

  const wrapped = phaseAt(a, 0, a.periodMs)
  check('one period is one revolution', Math.abs(wrapped - a.dir * Math.PI * 2) < 1e-9)
  check('a reversed plane runs backwards', phaseAt(PLANES.b, 0, PLANES.b.periodMs) < 0)

  const tilts = PLANE_IDS.map((id) => PLANES[id].tilt)
  check(
    'no two planes share a tilt',
    new Set(tilts.map((t) => t.toFixed(6))).size === PLANE_IDS.length,
  )
}

// ---------- the logo's rings ----------
//
// The rings are drawn with canvas arcs while the planets are placed with
// orbitPoint. Those are two different code paths that have to agree on which
// half of a turn is in front, or a planet will cross the logo at one point and
// its ring at another.
{
  const plane = PLANES.b
  const nearSamples = Array.from({ length: 32 }, (_, i) => RING_ARC.near[0] + ((i + 0.5) / 32) * (RING_ARC.near[1] - RING_ARC.near[0]))
  const farSamples = Array.from({ length: 32 }, (_, i) => RING_ARC.far[0] + ((i + 0.5) / 32) * (RING_ARC.far[1] - RING_ARC.far[0]))
  check(
    'the near arc is the half that renders in front',
    nearSamples.every((t) => orbitPoint(plane, 100, 1, t).depth >= 0),
  )
  check(
    'the far arc is the half that renders behind',
    farSamples.every((t) => orbitPoint(plane, 100, 1, t).depth <= 0),
  )
  check(
    'the two arcs cover exactly one turn',
    Math.abs(RING_ARC.near[1] - RING_ARC.near[0] + (RING_ARC.far[1] - RING_ARC.far[0]) - Math.PI * 2) < 1e-9,
  )

  check('a band sits exactly on the orbit', RING_BANDS.some((b) => b.k === 1))
  check(
    'the brightest band is the one the planets ride',
    RING_BANDS.reduce((a, b) => (b.alpha > a.alpha ? b : a)).k === 1,
  )
  check(
    'bands ascend outward',
    RING_BANDS.every((b, i) => i === 0 || RING_BANDS[i - 1].k < b.k),
  )
  check(
    'the band stays close to the orbit it decorates',
    RING_BANDS.every((b) => Math.abs(b.k - 1) < 0.12),
  )
  {
    // Cassini division: one gap has to be clearly wider than the typical one,
    // or the band reads as a solid plate.
    const gaps = RING_BANDS.slice(1).map((b, i) => b.k - RING_BANDS[i].k)
    const widest = Math.max(...gaps)
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    check('the band has a division in it', widest > median * 1.8)
  }
}

// ---------- depth response ----------
check('the far half draws smaller', depthScale(-1) < depthScale(1))
check('the far half draws fainter', depthAlpha(-1) < depthAlpha(1))
check('scale stays sane', depthScale(-1) > 0.5 && depthScale(1) < 1.3)
check('alpha stays visible', depthAlpha(-1) > 0.4 && depthAlpha(1) <= 1)

// ---------- style tables are total ----------
{
  const kinds: BusinessKind[] = ['clinic', 'food', 'craft', 'retail', 'service', 'education', 'other']
  check('every kind has a shape', kinds.every((k) => Boolean(KIND_SHAPE[k])))
  const sizes: PlanetSize[] = ['small', 'medium', 'large']
  check('every size has a pixel value', sizes.every((s) => SIZE_PX[s] > 0))
  check('sizes ascend', SIZE_PX.small < SIZE_PX.medium && SIZE_PX.medium < SIZE_PX.large)
  const lengths: TrailLength[] = ['short', 'medium', 'long']
  check('every trail length has a sample count', lengths.every((l) => TRAIL_SAMPLES[l] > 0))
  check(
    'trail lengths ascend',
    TRAIL_SAMPLES.short < TRAIL_SAMPLES.medium && TRAIL_SAMPLES.medium < TRAIL_SAMPLES.long,
  )
  const inks: PlanetInk[] = ['graphite', 'red', 'sepia', 'blue']
  check('every ink is a hex colour', inks.every((i) => /^#[0-9A-Fa-f]{6}$/.test(INK_HEX[i])))
  check('inks are distinct', new Set(inks.map((i) => INK_HEX[i])).size === inks.length)
}

console.log(failures === 0 ? '\nAll orbit checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
