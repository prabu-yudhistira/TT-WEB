/**
 * The orbital projection shared by every body in the hero's belt.
 *
 * Extracted from SatelliteEngine so the mascot can be placed by the SAME
 * function that places the satellites, rather than by a second camera model
 * that merely resembles it. Two independent projections would drift the moment
 * either was tuned, and "the mascot is not quite in the belt" is exactly the
 * kind of defect that is obvious on screen and miserable to chase in code.
 *
 * Pure: no DOM, no canvas, no config object beyond the plane itself.
 */

/**
 * The plane every orbiting body shares. Read from the satellite config rather
 * than duplicated per-body — see the CMS note in the mascot spec on why these
 * three are deliberately NOT editable per-body.
 */
export type OrbitPlane = {
  /** Disk inclination (deg). 0 is edge-on, 90 is face-on. */
  TILT: number
  /** Roll of the whole disk around the view axis (deg). */
  TILT_SIDEWAY: number
  /** Projection depth. Lower = stronger perspective. */
  PERSPECTIVE: number
}

export type Projected = {
  /** Screen x, in CSS px, relative to the field's own box. */
  x: number
  /** Screen y, in CSS px, relative to the field's own box. */
  y: number
  /**
   * Depth. >= 0 is BEHIND the orbital centre (and so behind the logo), < 0 is
   * in front of it. The whole canvas-sandwich occlusion scheme keys off this
   * sign, so it is part of the contract, not an implementation detail.
   */
  z: number
  /** Perspective divide, 1 at zero depth. Multiply sizes by this. */
  scale: number
}

/**
 * Project a point on a tilted, rolled orbit into screen space.
 *
 * @param plane   shared inclination / roll / perspective
 * @param cx,cy   orbital centre in screen px (the logo's own centre)
 * @param radius  orbit radius in screen px
 * @param angle   position along the orbit, radians
 * @param height  offset out of the disk plane, px
 * @param tiltRad this body's own inclination, radians — normally the plane's
 *                TILT converted to radians, plus any per-body spread
 */
export function projectOrbit(
  plane: OrbitPlane,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  height: number,
  tiltRad: number,
): Projected {
  const sw = (plane.TILT_SIDEWAY * Math.PI) / 180
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)

  const xb = radius * cosA
  const yb = height
  const zb = radius * sinA

  // inclination around X
  const y1 = yb * Math.cos(tiltRad) + zb * Math.sin(tiltRad)
  const z1 = -yb * Math.sin(tiltRad) + zb * Math.cos(tiltRad)

  // roll around the view axis
  const x3 = xb * Math.cos(sw) - y1 * Math.sin(sw)
  const y3 = xb * Math.sin(sw) + y1 * Math.cos(sw)

  const scale = plane.PERSPECTIVE / (plane.PERSPECTIVE + z1)
  return { x: cx + x3 * scale, y: cy + y3 * scale, z: z1, scale }
}

/**
 * Where the belt sits, in screen px, for a given field box.
 *
 * Shared for the same reason projectOrbit is: the mascot's orbit radius is
 * expressed as a fraction of the satellites' own outer radius, so if the two
 * computed that radius separately, every future edit to the satellites' band
 * would silently move the mascot relative to it.
 */
export type OrbitGeometry = {
  /** Orbital centre — the logo's own on-screen centre. */
  cx: number
  cy: number
  /** The mark's on-screen half-height, which INNER_RADIUS is a multiple of. */
  hh: number
  innerR: number
  outerR: number
  mobile: boolean
}

type BeltRadii = {
  INNER_RADIUS: number
  OUTER_RADIUS: number
  MOBILE_INNER_RADIUS: number
  MOBILE_OUTER_RADIUS: number
}

export function orbitGeometry(
  cfg: BeltRadii,
  W: number,
  H: number,
  box: { cx: number; cy: number; hh: number },
  mobile: boolean,
): OrbitGeometry {
  const innerFrac = mobile ? cfg.MOBILE_INNER_RADIUS : cfg.INNER_RADIUS
  const outerFrac = mobile ? cfg.MOBILE_OUTER_RADIUS : cfg.OUTER_RADIUS
  const innerR = Math.max(8, box.hh * innerFrac)
  // Floor keeps outerR strictly above innerR: dust seeds across
  // innerR..outerR, and an inverted span would place particles inside the
  // orbit floor. Reachable on a tall narrow window, where INNER_RADIUS 3 of a
  // tall mark can exceed a radius measured off the short side.
  const outerR = Math.max(innerR + 12, (Math.min(W, H) / 2) * outerFrac)
  return { cx: box.cx, cy: box.cy, hh: box.hh, innerR, outerR, mobile }
}
