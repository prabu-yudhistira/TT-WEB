import {
  portOffsets,
  lensOffset,
  type EmittersConfig,
  type OrbRotConfig,
  type OrbSlotConfig,
} from './types'

/**
 * Where the two emitter orbs are, in the room's world units.
 *
 * ── Frame of reference ──────────────────────────────────────────────
 *
 * World units, origin at the room's centre, +Z toward the camera — the same
 * frame `room.ts` builds in. Config is in VIEWPORT FRACTIONS, which this module
 * converts once, so the composition holds at every viewport and every
 * ROOM.DEPTH rather than being re-derived at each call site.
 *
 * ⚠️ ONE radius for both orbs. They are the same object at two depths (spec
 * §6.1); the apparent size difference in the owner's mockup comes from
 * DEPTH_FRAC and the perspective camera, never from a second size value. A
 * second value would drift the moment either was tuned.
 *
 * ⚠️ This module deliberately does NOT solve a projection the way
 * `cameraHandoff` does. SAMSARA's seam is measured to 0.75px because a
 * discontinuity there is visible; the orbs are decorative and never cross a
 * camera swap, so a fraction-of-depth approximation is correct and far cheaper
 * to reason about.
 */

export type OrbSlot = 'near' | 'far'

export type OrbCtx = {
  W: number
  H: number
  mobile: boolean
  /** ROOM.DEPTH in world units. */
  roomDepth: number
  /** The room camera's z, so entry can start genuinely behind it. */
  camZ: number
}

export type OrbPose = {
  x: number
  y: number
  z: number
  /** World-unit radius. Identical for both slots, by construction. */
  radius: number
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Ease-out cubic — the orbs decelerate into their slots rather than stopping dead. */
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

const slotOf = (slot: OrbSlot, cfg: EmittersConfig, ctx: OrbCtx): OrbSlotConfig =>
  ctx.mobile
    ? slot === 'near'
      ? cfg.MOBILE_NEAR
      : cfg.MOBILE_FAR
    : slot === 'near'
      ? cfg.NEAR
      : cfg.FAR

const radiusOf = (cfg: EmittersConfig, ctx: OrbCtx): number => {
  const frac = ctx.mobile ? cfg.MOBILE_SIZE_FRAC : cfg.SIZE_FRAC
  return (frac * ctx.roomDepth) / 2
}

/**
 * Half-extents of the room's framed volume at the camera plane.
 *
 * The perspective camera is solved so the room's interior height fills the
 * viewport (`room.ts`, ROOM_HEIGHT_FACTOR), so half-height is depth/2 and
 * half-width follows the viewport aspect. Deriving both from one place keeps
 * landscape and portrait consistent.
 */
const halfExtents = (ctx: OrbCtx) => {
  const halfH = ctx.roomDepth / 2
  return { halfH, halfW: halfH * (ctx.W / ctx.H) }
}

export function orbParkedPose(slot: OrbSlot, cfg: EmittersConfig, ctx: OrbCtx): OrbPose {
  const s = slotOf(slot, cfg, ctx)
  const { halfW, halfH } = halfExtents(ctx)
  return {
    // X_FRAC/Y_FRAC are 0..1 across the viewport with y DOWN, matching
    // LANDING's convention exactly. World y is UP, hence the negation — a
    // mismatch here would put the orbs above the screen instead of below it.
    x: (s.X_FRAC - 0.5) * 2 * halfW,
    y: -(s.Y_FRAC - 0.5) * 2 * halfH,
    z: ctx.camZ - s.DEPTH_FRAC * ctx.roomDepth,
    radius: radiusOf(cfg, ctx),
  }
}

/** How long after the sequence's entry beat begins this slot starts moving. */
const startDelay = (slot: OrbSlot, cfg: EmittersConfig): number =>
  slot === 'near' ? 0 : cfg.ENTRY_STAGGER_MS

export function orbPoseAt(
  slot: OrbSlot,
  tMs: number,
  cfg: EmittersConfig,
  ctx: OrbCtx,
): OrbPose {
  const parked = orbParkedPose(slot, cfg, ctx)
  const e = easeOut(clamp01((tMs - startDelay(slot, cfg)) / cfg.ENTRY_MS))

  // ⚠️ Entry begins BEHIND the camera and flies forward past the viewer into
  // the room (spec §5.1). Starting inside the frustum would read as fading in.
  const startZ = ctx.camZ + ctx.roomDepth * 0.35
  // A gentle lateral converge, so the path is an arc rather than a ruler line.
  const startX = parked.x * 0.35
  const startY = parked.y * 0.55

  return {
    x: startX + (parked.x - startX) * e,
    y: startY + (parked.y - startY) * e,
    z: startZ + (parked.z - startZ) * e,
    radius: parked.radius,
  }
}

/**
 * Idle float. Returns ORB RADII — the caller scales by `pose.radius`, so the
 * bob keeps its proportion at every viewport.
 *
 * ⚠️ The two slots are deliberately out of phase. In phase they read as one
 * rigid object on a spring rather than two independently hovering machines.
 */
export function orbBobY(slot: OrbSlot, tMs: number, cfg: EmittersConfig): number {
  const phase = slot === 'near' ? 0 : Math.PI * 0.6
  return Math.sin((tMs / cfg.BOB_MS) * Math.PI * 2 + phase) * cfg.BOB_AMP
}

/** The parked orientation for a slot. Shared across landscape and portrait. */
export function orbRot(slot: OrbSlot, cfg: EmittersConfig): OrbRotConfig {
  return slot === 'near' ? cfg.NEAR_ROT : cfg.FAR_ROT
}

const D2R = Math.PI / 180

/**
 * Rotate a local offset by an XYZ Euler, in degrees.
 *
 * ⚠️ This reproduces THREE's `Matrix4.makeRotationFromEuler` for order 'XYZ'
 * EXACTLY, term for term, and that is the whole point of writing it out rather
 * than reaching for something more readable.
 *
 * The orb MESH is rotated by three.js from the same three numbers. If this
 * function disagreed with three's convention by so much as an axis order, the
 * body would face one way while its afterburners emitted from another — smoke
 * appearing out of empty space beside the orb. Nothing would throw, and at
 * 0/0/0 (the default) the two agree perfectly, so it would look correct until
 * the first time anyone touched a rotation slider.
 */
export function rotateLocal(
  v: readonly [number, number, number],
  r: OrbRotConfig,
): [number, number, number] {
  const a = Math.cos(r.X_DEG * D2R)
  const b = Math.sin(r.X_DEG * D2R)
  const c = Math.cos(r.Y_DEG * D2R)
  const d = Math.sin(r.Y_DEG * D2R)
  const e = Math.cos(r.Z_DEG * D2R)
  const f = Math.sin(r.Z_DEG * D2R)

  const ae = a * e
  const af = a * f
  const be = b * e
  const bf = b * f

  const m00 = c * e
  const m01 = -c * f
  const m02 = d
  const m10 = af + be * d
  const m11 = ae - bf * d
  const m12 = -b * c
  const m20 = bf - ae * d
  const m21 = be + af * d
  const m22 = a * c

  return [
    m00 * v[0] + m01 * v[1] + m02 * v[2],
    m10 * v[0] + m11 * v[1] + m12 * v[2],
    m20 * v[0] + m21 * v[1] + m22 * v[2],
  ]
}

/**
 * Port `i`'s world position. Offsets are in orb radii, in LOCAL space.
 *
 * ⚠️ `rot` is not optional in spirit even though it defaults. The afterburners
 * are part of the body: rotate the mesh without rotating these and the plume
 * detaches from the machine it is supposed to be coming out of.
 */
export function portWorld(
  pose: OrbPose,
  i: number,
  cfg: EmittersConfig,
  rot: OrbRotConfig = ZERO_ROT,
): [number, number, number] {
  const o = rotateLocal(portOffsets(cfg)[i], rot)
  return [
    pose.x + o[0] * pose.radius,
    pose.y + o[1] * pose.radius,
    pose.z + o[2] * pose.radius,
  ]
}

/** The hologram lens's world position — where the shafts originate. */
export function lensWorld(
  pose: OrbPose,
  cfg: EmittersConfig,
  rot: OrbRotConfig = ZERO_ROT,
): [number, number, number] {
  const o = rotateLocal(lensOffset(cfg), rot)
  return [
    pose.x + o[0] * pose.radius,
    pose.y + o[1] * pose.radius,
    pose.z + o[2] * pose.radius,
  ]
}

const ZERO_ROT: OrbRotConfig = { X_DEG: 0, Y_DEG: 0, Z_DEG: 0 }
