/**
 * Shapes shared by the orbit engine and the CMS layer
 * (concept: docs/CONCEPT-SEMESTA.md §3).
 *
 * These mirror the select options in collections/Businesses.ts. They are
 * declared here rather than imported from payload-types so the client bundle
 * never pulls the CMS types in, and so a check script can run in plain Node.
 */

export type OrbitPlaneId = 'a' | 'b' | 'c'
export type BusinessKind =
  | 'clinic'
  | 'food'
  | 'craft'
  | 'retail'
  | 'service'
  | 'education'
  | 'other'
export type PlanetSize = 'small' | 'medium' | 'large'
export type PlanetPattern = 'plain' | 'crosshatch' | 'stipple' | 'ringed'
export type PlanetInk = 'graphite' | 'red' | 'sepia' | 'blue'
export type TrailStyle = 'line' | 'dots' | 'ticks' | 'none'
export type TrailLength = 'short' | 'medium' | 'long'

/** One approved business, flattened for the client. */
export type Planet = {
  id: string
  name: string
  /** Already composed for display, e.g. "Surakarta, Jawa Tengah". */
  city: string
  /** Plots the pin on the manifesto map. Null when the city has no coordinates. */
  lat: number | null
  lng: number | null
  kind: BusinessKind
  website: string | null
  foundedYear: number | null
  size: PlanetSize
  pattern: PlanetPattern
  ink: PlanetInk
  trailStyle: TrailStyle
  trailLength: TrailLength
  /** null = derive the plane from the id, so placement stays stable but spread. */
  orbit: OrbitPlaneId | null
}
