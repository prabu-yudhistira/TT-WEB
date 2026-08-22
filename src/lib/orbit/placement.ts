import { PLANE_IDS } from './planes'
import type {
  BusinessKind,
  OrbitPlaneId,
  PlanetInk,
  PlanetSize,
  TrailLength,
} from './types'

/**
 * Deterministic placement and the fixed style tables
 * (concept: docs/CONCEPT-SEMESTA.md §3.5–3.6).
 *
 * Everything here is a pure function of the planet's own data, which buys two
 * things: the same business lands in the same place on every load (so the hero
 * is a stable picture, not a shuffle), and the whole module is testable in Node
 * — see placement.check.ts.
 */

/** FNV-1a, 32-bit. Small, stable, and good enough to spread names over 3 planes. */
export function hash32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Hash of `${seed}:${salt}` mapped to 0..1 — one hash, many independent draws. */
export function unitHash(seed: string, salt: string): number {
  return hash32(`${seed}:${salt}`) / 0x100000000
}

/** Explicit plane from the CMS wins; otherwise spread by name hash. */
export function planeFor(seed: string, explicit?: OrbitPlaneId | null): OrbitPlaneId {
  if (explicit) return explicit
  return PLANE_IDS[hash32(seed) % PLANE_IDS.length]
}

/** Starting parameter, so planets do not all launch from the same point. */
export function phaseFor(seed: string): number {
  return unitHash(seed, 'phase') * Math.PI * 2
}

export const RADIUS_MIN = 0.78
export const RADIUS_MAX = 1.16
const RADIUS_JITTER = 0.05

/**
 * Older business = tighter orbit. With no year, or with every business sharing
 * one year, the planet sits mid-band — the point is relative age, and a single
 * year carries no relative information.
 *
 * A small hash jitter is added regardless so two businesses founded in the same
 * year on the same plane do not trace the exact same ellipse.
 */
export function radiusFactor(
  seed: string,
  foundedYear: number | null,
  minYear: number,
  maxYear: number,
): number {
  const jitter = (unitHash(seed, 'radius') - 0.5) * 2 * RADIUS_JITTER
  if (foundedYear == null || maxYear <= minYear) return 1 + jitter
  const age = (foundedYear - minYear) / (maxYear - minYear) // 0 = oldest
  return RADIUS_MIN + age * (RADIUS_MAX - RADIUS_MIN) + jitter
}

/**
 * How many planets the hero carries at once. Shared with the manifesto map,
 * which uses it to tell the reader when the hero is showing a rotating subset
 * and the list below is the complete one.
 */
export const HERO_PLANET_LIMIT = 40
export const HERO_PLANET_LIMIT_MOBILE = 12

/**
 * Which planets the hero shows when there are more than it can carry
 * (concept: docs/CONCEPT-SEMESTA.md §3.7).
 *
 * Random would make the hero flicker between reloads; newest-first would freeze
 * out everyone who joined early. Rotating on a date key keeps the picture still
 * all day and still gives every planet its turn. `ids` must be pre-sorted by
 * the caller for the result to be stable, which it is: the CMS sorts by name.
 */
export function dailySubset<T extends { id: string }>(items: T[], max: number, dayKey: string): T[] {
  if (items.length <= max) return items
  return [...items]
    .sort((a, b) => hash32(`${dayKey}:${a.id}`) - hash32(`${dayKey}:${b.id}`))
    .slice(0, max)
}

/** Rendered planet diameter in px. */
export const SIZE_PX: Record<PlanetSize, number> = { small: 12, medium: 18, large: 26 }

/** How many trail samples a planet keeps — the visible length of its mark. */
export const TRAIL_SAMPLES: Record<TrailLength, number> = { short: 40, medium: 90, long: 160 }

/**
 * The four inks. Raw hex rather than CSS variables because the trail is drawn
 * on a 2D canvas, and canvas cannot resolve var(). --accent's value is repeated
 * here deliberately; if the token moves, this map moves with it.
 */
export const INK_HEX: Record<PlanetInk, string> = {
  graphite: '#2B2A27',
  red: '#8E1114',
  sepia: '#7A5230',
  blue: '#2F4A6B',
}

/**
 * Base outline per kind — a second axis of difference that costs no assets.
 * `core` is a circle with a filled centre; the saturn ring is a *pattern*
 * choice, not a shape, so the two never fight over the same silhouette.
 */
export type PlanetShape = 'circle' | 'core' | 'diamond' | 'square' | 'hex' | 'triangle' | 'oval'

export const KIND_SHAPE: Record<BusinessKind, PlanetShape> = {
  clinic: 'core',
  food: 'circle',
  craft: 'diamond',
  retail: 'square',
  service: 'hex',
  education: 'triangle',
  other: 'oval',
}

/**
 * Axial spin, deterministic per planet (docs/CONCEPT-SEMESTA.md §3.2).
 *
 * Every planet turning at the same rate on the same axis would read as one
 * object repeated, which is the opposite of the point.
 */
export function spinSeconds(seed: string): number {
  return 7 + unitHash(seed, 'spin') * 9
}

/** Axial tilt in degrees, ±28° — enough to differentiate, short of falling over. */
export function axialTilt(seed: string): number {
  return -28 + unitHash(seed, 'tilt') * 56
}

/**
 * How many meridian lines a planet's wireframe carries.
 *
 * With the hero's planets drawn as spheres, `kind` can no longer be a
 * silhouette — every sphere has the same outline. It moves to the surface
 * instead: the line count is what tells two kinds apart up close. The map's
 * pins keep the flat per-kind shapes, where a symbol reads better than a body.
 */
export const KIND_MERIDIANS: Record<BusinessKind, number> = {
  clinic: 4,
  food: 3,
  craft: 5,
  retail: 4,
  service: 6,
  education: 3,
  other: 4,
}

/** Depth (-1..1) to render scale — the far half reads smaller. */
export function depthScale(depth: number): number {
  return 0.7 + ((depth + 1) / 2) * 0.45
}

/** Depth (-1..1) to opacity — the far half also reads fainter. */
export function depthAlpha(depth: number): number {
  return 0.55 + ((depth + 1) / 2) * 0.45
}
