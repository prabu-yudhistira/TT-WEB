import type { OrbitPlaneId } from './types'

/**
 * The three orbital planes (concept: docs/CONCEPT-SEMESTA.md §3.1).
 *
 * Three ellipses at clearly different tilts is what makes the hero read as a
 * drawn sky chart instead of a spinner. One plane, or three at the same angle,
 * reads as a loading state.
 *
 * `rx`/`ry` are multiples of R, where R is the larger half-extent of the logo
 * box — so the system scales with the logo on every viewport instead of being
 * pinned to pixels.
 */

export type OrbitPlane = {
  id: OrbitPlaneId
  /** Radians, applied after the ellipse is traced. */
  tilt: number
  rx: number
  ry: number
  periodMs: number
  /** 1 = the parameter advances, -1 = the plane runs backwards. */
  dir: 1 | -1
}

const deg = (d: number) => (d * Math.PI) / 180

export const PLANES: Record<OrbitPlaneId, OrbitPlane> = {
  a: { id: 'a', tilt: deg(-12), rx: 1.55, ry: 0.42, periodMs: 90_000, dir: 1 },
  b: { id: 'b', tilt: deg(34), rx: 2.15, ry: 0.58, periodMs: 140_000, dir: -1 },
  c: { id: 'c', tilt: deg(-68), rx: 2.8, ry: 0.35, periodMs: 210_000, dir: 1 },
}

export const PLANE_IDS: OrbitPlaneId[] = ['a', 'b', 'c']

/** Phone drops the widest plane — plane C is wider than a 375px screen. */
export const MOBILE_PLANES: OrbitPlaneId[] = ['a', 'b']

/**
 * The concentric arcs that turn one orbital plane into a Saturn ring band
 * around the logo (docs/CONCEPT-SEMESTA.md §3.1).
 *
 * `k` is a radius multiplier on the true orbit, so k = 1 is the path the
 * planets actually ride and the band sits centred on it. The jump from 1.015 to
 * 1.07 is the Cassini division — it is deliberately more than twice any other
 * spacing, because a band with evenly spaced lines reads as a plate, not a ring.
 */
export const RING_BANDS = [
  { k: 0.945, alpha: 0.55, width: 0.8 },
  { k: 0.975, alpha: 0.85, width: 1 },
  { k: 1, alpha: 1, width: 1.15 },
  { k: 1.015, alpha: 0.8, width: 1 },
  { k: 1.07, alpha: 0.5, width: 0.8 },
  { k: 1.088, alpha: 0.3, width: 0.7 },
]

/**
 * Which half of a ring belongs in front of the logo.
 *
 * Canvas `ellipse()` takes the same parameter `t` that `orbitPoint` uses, so
 * the near half is exactly the arc where depth is positive — one arc call per
 * layer, and the rings cross the logo at precisely the point the planets do.
 */
export const RING_ARC = {
  near: [0, Math.PI] as const,
  far: [Math.PI, Math.PI * 2] as const,
}

export type OrbitPoint = {
  /** Offset from the logo centre, in px. */
  x: number
  y: number
  /**
   * +1 = nearest the viewer (in front of the logo), -1 = furthest behind it.
   * Drives scale, alpha and z-index, which is the whole 3D illusion.
   */
  depth: number
}

/**
 * Point on `plane` at parameter `t`, for a logo half-extent of `R` and a
 * per-planet radius multiplier (older business = tighter orbit).
 */
export function orbitPoint(
  plane: OrbitPlane,
  R: number,
  radiusFactor: number,
  t: number,
): OrbitPoint {
  const a = plane.rx * R * radiusFactor
  const b = plane.ry * R * radiusFactor
  const lx = Math.cos(t) * a
  const ly = Math.sin(t) * b
  const cos = Math.cos(plane.tilt)
  const sin = Math.sin(plane.tilt)
  return {
    x: lx * cos - ly * sin,
    y: lx * sin + ly * cos,
    // Before the tilt, +sin(t) is the lower half of the ellipse — the half a
    // reader reads as "in front". Taking depth pre-tilt keeps that true at any
    // tilt angle.
    depth: Math.sin(t),
  }
}

/** Where a planet sits after `elapsedMs`, given its starting parameter. */
export function phaseAt(plane: OrbitPlane, phase0: number, elapsedMs: number): number {
  return phase0 + plane.dir * (elapsedMs / plane.periodMs) * Math.PI * 2
}
