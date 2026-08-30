/**
 * The transit path — far point → fall → bounces → landed pose — and the gate
 * that decides when SAMSARA's canvas may be promoted to a fixed top layer.
 *
 * Spec §5.6. The far point is the BACK of the orbit (owner-confirmed
 * 2026-08-30: "furthest from the viewer"), at angle π/2 where projectOrbit's
 * depth term is maximal. With shipped belt values that places SAMSARA about
 * 213px ABOVE the mark, inside its horizontal span, at its smallest, and
 * drawing on the BACK canvas — so the fall descends BEHIND the logo for roughly
 * 397px before emerging underneath. The existing canvas sandwich occludes that
 * for free; it is the sandwich doing exactly what it was built to do.
 *
 * Which is why the promotion is gated on geometry rather than on a clock: see
 * hasClearedLogo below.
 *
 * The start pose is read through the SAME projectOrbit() the satellites and the
 * mascot use, never a local copy. A second implementation would drift the
 * moment the belt was tuned, and "SAMSARA does not start where it actually is"
 * is precisely the defect that is obvious on screen and miserable in code.
 *
 * Pure: no three.js, no DOM.
 */
import { projectOrbit, type OrbitPlane } from '../satellites/project'
import { bounceAt } from './bounce'
import type { SequenceConfig } from './types'

export type Box = { x: number; y: number; w: number; h: number }

export type TransitPose = {
  /** Screen x, CSS px, relative to the field's box. */
  x: number
  /** Screen y, CSS px. */
  y: number
  /** On-screen diameter, CSS px. */
  sizePx: number
  /** 0 at the back wall, 1 at the landed position. */
  depth01: number
}

export type TransitContext = {
  cfg: SequenceConfig
  W: number
  H: number
  mobile: boolean
  /** Orbital centre — the logo's own on-screen centre. */
  cx: number
  cy: number
  /** The mark's on-screen half-height. */
  hh: number
  /** The mascot's orbit radius in screen px. */
  orbitR: number
  /** Its offset out of the belt plane, px. */
  height: number
  plane: OrbitPlane
  /** SAMSARA's on-screen diameter at the far point, px. */
  startSizePx: number
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Where SAMSARA leaves the orbit.
 *
 * projectOrbit computes depth as `-height·sin(TILT) + radius·sin(angle)·cos(TILT)`,
 * so it is maximal at sin(angle) = 1.
 */
export function farPointAngle(): number {
  return Math.PI / 2
}

export function transitPoseAt(t01: number, ctx: TransitContext): TransitPose {
  const t = clamp01(t01)
  const { cfg, mobile, plane } = ctx
  const tiltRad = (plane.TILT * Math.PI) / 180

  // Start: read from the real orbit, so it cannot drift from where the mascot
  // actually is.
  const start = projectOrbit(plane, ctx.cx, ctx.cy, ctx.orbitR, farPointAngle(), ctx.height, tiltRad)

  // End: the landed pose, per breakpoint.
  const L = cfg.LANDING
  const endSizePx = (mobile ? L.MOBILE_SIZE_FRAC : L.SIZE_FRAC) * ctx.H
  const endX = (mobile ? L.MOBILE_X_FRAC : L.X_FRAC) * ctx.W
  const endY = (mobile ? L.MOBILE_Y_FRAC : L.Y_FRAC) * ctx.H

  const b = bounceAt(t, cfg.TRANSIT)

  // Depth drives the horizontal drift and the growth: SAMSARA approaches the
  // camera and its landing spot together.
  const x = start.x + (endX - start.x) * b.depth01
  const sizePx = ctx.startSizePx + (endSizePx - ctx.startSizePx) * b.depth01

  // Vertical position is governed by the bounce, not by depth.
  //
  // ⚠️ `height` is measured ABOVE THE FLOOR, and start.y is already the top of
  // the drop — so it must not be used as a baseline that `height` then lifts
  // further. Doing that double-counts and throws SAMSARA off the top of the
  // frame at t=0 (measured: y 5.5 instead of 236.8).
  //
  // Instead solve the floor line and drop distance from the two real endpoints:
  //   y = floorY - height * dropPx
  // with y(0) = start.y at height h0, and y(1) = endY at height h1.
  // h0/h1 are read back from bounceAt rather than re-derived, so the hover
  // height cannot drift between the two modules.
  const h0 = bounceAt(0, cfg.TRANSIT).height
  const h1 = bounceAt(1, cfg.TRANSIT).height
  const span = h0 - h1
  const dropPx = span > 1e-6 ? (endY - start.y) / span : 0
  const floorY = start.y + h0 * dropPx
  const y = floorY - b.height * dropPx

  return { x, y, sizePx, depth01: b.depth01 }
}

/**
 * May the canvas be promoted to a fixed top layer yet? A plain box
 * non-intersection test.
 *
 * ⚠️ This is a GUARD, not a mechanism, and the distinction was paid for.
 *
 * The design spec originally asserted that promoting at the far point would pop
 * SAMSARA in front of the mark, and gated the promotion behind ~397px of
 * descent "until it emerges below the logo". Both halves turned out to be
 * wrong, and only measurement showed it:
 *
 *  1. At the far point the boxes do NOT intersect. SAMSARA sits ~30px above the
 *     mark's box with a radius of only ~10px, so promoting there is already a
 *     genuine visual no-op.
 *  2. SAMSARA never emerges below the mark at all. With the landed pose at
 *     Y_FRAC 0.52 it descends from y≈237 to a floor at y≈478, while the logo's
 *     box runs 266..634 — it stays inside the mark's vertical span for the
 *     whole transit. A gate waiting for it to pass below would never fire.
 *
 * "Falls behind the mark" was an inference from the geometry, not a
 * requirement: the owner asked only that SAMSARA fall to the next section.
 * Falling behind would also hide it for most of the descent, which is worse.
 * So it promotes at the far point and falls IN FRONT, staying visible, with the
 * room rising beneath it.
 *
 * This function survives as a guard: if a future retune moves the far point so
 * that it does overlap the mark, the promotion defers until it does not, rather
 * than popping.
 */
export function hasClearedLogo(pose: { x: number; y: number; sizePx: number }, logo: Box): boolean {
  const r = pose.sizePx / 2
  const left = pose.x - r
  const right = pose.x + r
  const top = pose.y - r
  const bottom = pose.y + r

  return (
    right <= logo.x || left >= logo.x + logo.w || bottom <= logo.y || top >= logo.y + logo.h
  )
}
