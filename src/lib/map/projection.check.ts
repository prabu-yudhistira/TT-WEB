/**
 * Assertions for the map projection and the generated coastline.
 * Run: npm run verify:config
 *
 * The pins and the coastline are produced at different times — the coastline
 * once by buildOutline.ts, the pins on every request — so the thing most worth
 * pinning down is that both still agree on where a coordinate lands.
 */
import { GRATICULE_STEP, MAP_HEIGHT, MAP_VIEW, SCALE, graticule, inView, project } from './projection'
import { INDONESIA_OUTLINE } from './indonesiaOutline'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol

// ---------- frame ----------
{
  const topLeft = project(MAP_VIEW.latMax, MAP_VIEW.lonMin)
  const bottomRight = project(MAP_VIEW.latMin, MAP_VIEW.lonMax)
  check('north-west corner is the origin', near(topLeft.x, 0) && near(topLeft.y, 0))
  check('south-east corner is the far corner', near(bottomRight.x, MAP_VIEW.width) && near(bottomRight.y, MAP_HEIGHT))
  const lonSpan = MAP_VIEW.lonMax - MAP_VIEW.lonMin
  const latSpan = MAP_VIEW.latMax - MAP_VIEW.latMin
  check('aspect ratio matches the degree span', near(MAP_HEIGHT / MAP_VIEW.width, latSpan / lonSpan, 0.001))
  check('both axes share one scale', near(SCALE, MAP_VIEW.width / lonSpan, 1e-9))
}

// ---------- direction ----------
{
  const jakarta = project(-6.2088, 106.8456)
  const surakarta = project(-7.5755, 110.8243)
  const medan = project(3.5952, 98.6722)
  check('Surakarta is east of Jakarta', surakarta.x > jakarta.x)
  check('Surakarta is south of Jakarta', surakarta.y > jakarta.y)
  check('Medan is north of the equator', medan.y < project(0, 98.6722).y)
  check('the equator is a straight line', near(project(0, 95).y, project(0, 141).y, 1e-9))
}

// ---------- the seeded cities all fit ----------
{
  const cities: [string, number, number][] = [
    ['Surakarta', -7.5755, 110.8243],
    ['Yogyakarta', -7.7956, 110.3695],
    ['Semarang', -6.9667, 110.4167],
    ['Jakarta', -6.2088, 106.8456],
    ['Bandung', -6.9175, 107.6191],
    ['Surabaya', -7.2575, 112.7521],
    ['Malang', -7.9666, 112.6326],
    ['Denpasar', -8.65, 115.2167],
    ['Medan', 3.5952, 98.6722],
    ['Makassar', -5.1477, 119.4327],
  ]
  for (const [name, lat, lng] of cities) {
    const p = project(lat, lng)
    check(
      `${name} lands inside the frame`,
      inView(lat, lng) && p.x >= 0 && p.x <= MAP_VIEW.width && p.y >= 0 && p.y <= MAP_HEIGHT,
    )
  }
  check('a coordinate outside the archipelago is rejected', !inView(35.68, 139.69)) // Tokyo
}

// ---------- graticule ----------
{
  const { meridians, parallels } = graticule()
  check('meridians are on the step', meridians.every((m) => m % GRATICULE_STEP === 0))
  check('parallels are on the step', parallels.every((p) => p % GRATICULE_STEP === 0))
  check('meridians stay inside the frame', meridians.every((m) => m >= MAP_VIEW.lonMin && m <= MAP_VIEW.lonMax))
  check('the equator is drawn', parallels.includes(0))
}

// ---------- generated coastline ----------
{
  check('the outline generated something', INDONESIA_OUTLINE.length > 0)
  check('every path is closed', INDONESIA_OUTLINE.every((d) => d.startsWith('M') && d.endsWith('Z')))
  check(
    'paths are ordered largest first',
    INDONESIA_OUTLINE.every((d, i) => i === 0 || INDONESIA_OUTLINE[i - 1].length >= d.length),
  )

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const d of INDONESIA_OUTLINE) {
    for (const pair of d.slice(1, -1).split('L')) {
      const [x, y] = pair.replace('M', '').split(',').map(Number)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  check('coastline stays inside the viewBox', minX >= 0 && minY >= 0 && maxX <= MAP_VIEW.width && maxY <= MAP_HEIGHT)
  // It should also very nearly FILL the frame — a coastline hugging one corner
  // would mean the projection and the generator disagree about the bounds.
  check('coastline fills the frame horizontally', maxX - minX > MAP_VIEW.width * 0.9)
  check('coastline fills the frame vertically', maxY - minY > MAP_HEIGHT * 0.8)
}

// ---------- the coastline is actually where it claims to be ----------
//
// The projection could be self-consistent and still be drawing the archipelago
// in the wrong place. This walks the generated polygons and asks whether real
// cities land on real land.
{
  const rings = INDONESIA_OUTLINE.map((d) =>
    d
      .slice(1, -1)
      .split('L')
      .map((pair) => pair.split(',').map(Number) as [number, number])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
  )

  const inRing = (ring: [number, number][], x: number, y: number) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }

  const onLand = (lat: number, lng: number) => {
    const p = project(lat, lng)
    return rings.some((ring) => inRing(ring, p.x, p.y))
  }

  check(
    'Java carries its cities',
    onLand(-6.2088, 106.8456) && // Jakarta
      onLand(-7.5755, 110.8243) && // Surakarta
      onLand(-6.9667, 110.4167) && // Semarang
      onLand(-7.2575, 112.7521), // Surabaya
  )
  check('Sumatra carries Medan', onLand(3.5952, 98.6722))
  check('Sulawesi is drawn', onLand(-2, 120.5))
  check('the Indian Ocean is not land', !onLand(-5, 100))
  check('the Java Sea is not land', !onLand(-4.5, 110))

  // Known casualties of a 110m coastline, asserted so that regenerating from
  // finer data shows up here as a failure rather than a surprise: Bali is not
  // in the source at all, and Sulawesi's south-west peninsula is simplified
  // past the point where Makassar sits. Both pins therefore render just
  // offshore. Delete this check if a finer coastline is ever generated.
  check(
    'the coarse coastline leaves Denpasar and Makassar offshore',
    !onLand(-8.65, 115.2167) && !onLand(-5.1477, 119.4327),
  )
}

console.log(failures === 0 ? '\nAll map checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
