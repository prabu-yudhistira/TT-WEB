/**
 * Map projection for the manifesto's real-world map
 * (concept: docs/CONCEPT-SEMESTA.md §5.1).
 *
 * Plate carrée — longitude and latitude scaled by the same factor. Over
 * Indonesia's 47° of longitude and 17° of latitude, straddling the equator, the
 * east-west stretch a proper Mercator would correct for is under 2%: smaller
 * than the error already baked into a 110m coastline, and far smaller than the
 * wobble of a line meant to look drawn by hand. A heavier projection would buy
 * nothing anyone could see.
 *
 * Both the coastline (generated once by buildOutline.ts) and the live city pins
 * go through this same function, which is the only reason they line up.
 */

export const MAP_VIEW = {
  lonMin: 94.5,
  lonMax: 141.8,
  latMin: -11,
  latMax: 6.2,
  /** SVG user units across. Height follows from the aspect ratio. */
  width: 1000,
} as const

const LON_SPAN = MAP_VIEW.lonMax - MAP_VIEW.lonMin
const LAT_SPAN = MAP_VIEW.latMax - MAP_VIEW.latMin

/** SVG user units per degree — identical on both axes, by definition. */
export const SCALE = MAP_VIEW.width / LON_SPAN

export const MAP_HEIGHT = Math.round(LAT_SPAN * SCALE * 100) / 100

export type Point = { x: number; y: number }

export function project(lat: number, lng: number): Point {
  return {
    x: (lng - MAP_VIEW.lonMin) * SCALE,
    // SVG y grows downward, latitude grows upward.
    y: (MAP_VIEW.latMax - lat) * SCALE,
  }
}

/** True when a coordinate falls inside the drawn frame. */
export function inView(lat: number, lng: number): boolean {
  return (
    lng >= MAP_VIEW.lonMin &&
    lng <= MAP_VIEW.lonMax &&
    lat >= MAP_VIEW.latMin &&
    lat <= MAP_VIEW.latMax
  )
}

/** Meridians and parallels drawn behind the coastline, in whole degrees. */
export const GRATICULE_STEP = 10

export function graticule(): { meridians: number[]; parallels: number[] } {
  const meridians: number[] = []
  const parallels: number[] = []
  for (let lon = Math.ceil(MAP_VIEW.lonMin / GRATICULE_STEP) * GRATICULE_STEP; lon <= MAP_VIEW.lonMax; lon += GRATICULE_STEP) {
    meridians.push(lon)
  }
  for (let lat = Math.ceil(MAP_VIEW.latMin / GRATICULE_STEP) * GRATICULE_STEP; lat <= MAP_VIEW.latMax; lat += GRATICULE_STEP) {
    parallels.push(lat)
  }
  return { meridians, parallels }
}
