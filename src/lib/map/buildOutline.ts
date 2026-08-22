/**
 * Turns a country GeoJSON into the committed SVG path in ./indonesiaOutline.ts.
 *
 * Run by hand, not in the build:
 *   node --import tsx src/lib/map/buildOutline.ts <path-to.geojson>
 *
 * The GeoJSON itself is deliberately NOT committed. It is a build input we use
 * once; what the site needs is a few kilobytes of path data, and carrying the
 * source file around would mean carrying its provenance question with it. The
 * generated file records where it came from instead.
 *
 * Source used: Natural Earth 110m admin-0 (public domain), via the
 * world.geo.json project. At that resolution Indonesia is 13 polygons and ~250
 * points — coarse enough that small islands are missing, which is stated in the
 * generated file and visible on the map. For a pencil-line sketch that coarseness
 * is the right amount of detail; for anything claiming cartographic accuracy it
 * would not be.
 */
import { readFileSync, writeFileSync } from 'fs'
import { project } from './projection'

type Ring = [number, number][]

const round = (n: number) => Math.round(n * 10) / 10

const ringToPath = (ring: Ring): string => {
  const pts = ring.map(([lng, lat]) => {
    const p = project(lat, lng)
    return `${round(p.x)},${round(p.y)}`
  })
  // The last GeoJSON point repeats the first; `Z` closes the path instead.
  if (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop()
  if (pts.length < 3) return ''
  return `M${pts.join('L')}Z`
}

const run = () => {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: node --import tsx src/lib/map/buildOutline.ts <path-to.geojson>')
    process.exit(1)
  }

  const geo = JSON.parse(readFileSync(input, 'utf8'))
  const feature = geo.type === 'FeatureCollection' ? geo.features[0] : geo
  const geom = feature.geometry ?? feature
  const polygons: Ring[][] =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates

  const paths: string[] = []
  for (const poly of polygons) {
    // Ring 0 is the outer boundary; the rest are holes, which this coastline
    // does not have at 110m. Taking only ring 0 keeps the output honest about
    // that rather than silently dropping data it never had.
    const d = ringToPath(poly[0] as Ring)
    if (d) paths.push(d)
  }

  const sorted = [...paths].sort((a, b) => b.length - a.length)

  const out = `/**
 * Indonesia's coastline, projected through ./projection.ts.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   node --import tsx src/lib/map/buildOutline.ts <path-to.geojson>
 *
 * Source: Natural Earth 110m admin-0 boundaries (public domain), via the
 * world.geo.json project. At this resolution the archipelago is ${polygons.length} landmasses;
 * islands smaller than roughly half a degree — Bali and Lombok among them — are
 * not in the source data, so a pin can sit on open water. That is a property of
 * the coastline, not a bug in the pin.
 *
 * Ordered largest-first so the biggest landmasses paint first.
 */
export const INDONESIA_OUTLINE: string[] = [
${sorted.map((d) => `  '${d}',`).join('\n')}
]
`

  const target = new URL('./indonesiaOutline.ts', import.meta.url).pathname
  writeFileSync(target, out)
  console.log(
    `Wrote ${target}: ${paths.length} paths, ${out.length} bytes ` +
      `(from ${polygons.length} polygons).`,
  )
}

run()
