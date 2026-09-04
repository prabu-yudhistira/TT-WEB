import type { HologramConfig } from './types'
import type { OrbCtx } from './emitterOrbs'

/**
 * The holographic screen's geometry, and the rect a DOM layer will read.
 *
 * ⚠️ The projected rect is the CONTRACT between the WebGL glass and the DOM
 * layer that will later carry subtitles and option buttons. It is the bounding
 * box of the four PROJECTED corners — never a projection of the centre plus the
 * world size. Under perspective those two differ, and the difference is exactly
 * the kind of subtle wrongness that positions text slightly off while nothing
 * looks broken.
 *
 * This module takes `project` as a parameter rather than importing THREE, so
 * the contract stays unit-testable without a renderer.
 */

export type Vec3 = [number, number, number]

export type ScreenQuad = {
  /** TL, TR, BR, BL in world space. Coplanar. */
  corners: [Vec3, Vec3, Vec3, Vec3]
  centre: Vec3
  w: number
  h: number
}

export type Rect = { x: number; y: number; w: number; h: number }

export function screenQuad(cfg: HologramConfig, ctx: OrbCtx): ScreenQuad {
  const halfH = ctx.roomDepth / 2
  const halfW = halfH * (ctx.W / ctx.H)

  const wf = ctx.mobile ? cfg.MOBILE_W_FRAC : cfg.W_FRAC
  const xf = ctx.mobile ? cfg.MOBILE_X_FRAC : cfg.X_FRAC
  const yf = ctx.mobile ? cfg.MOBILE_Y_FRAC : cfg.Y_FRAC

  const w = wf * 2 * halfW
  /**
   * ⚠️ HEIGHT FOLLOWS THE ART, and H_FRAC is gone because of it.
   *
   * The panel is the owner's drawing now, not a procedural frame. W_FRAC and
   * H_FRAC were fractions of the VIEWPORT, so the panel's shape changed with
   * the browser window and the drawing stretched with it — the dashed circle
   * became an ellipse and the 45-degree chamfers stopped being 45 degrees. A
   * width and an aspect is the only pair that cannot do that.
   *
   * PANEL_ASPECT must match the artwork. `scripts/build-hud-sdf.mjs` prints
   * the source's aspect on every run for exactly this reason.
   */
  const h = w / Math.max(0.01, cfg.PANEL_ASPECT)
  // Same viewport-fraction convention as LANDING and EMITTERS: 0..1 across the
  // viewport with y DOWN, negated into world y UP.
  const cx = (xf - 0.5) * 2 * halfW
  const cy = -(yf - 0.5) * 2 * halfH
  /**
   * Parallel to the back wall and standing well in front of it.
   *
   * Far enough forward that the shafts have somewhere to travel and the glass
   * never z-fights the wall; far enough back that the orbs are clearly in front
   * of it rather than embedded in it.
   */
  const cz = ctx.camZ - ctx.roomDepth * 0.55

  const hw = w / 2
  const hh = h / 2
  return {
    corners: [
      [cx - hw, cy + hh, cz],
      [cx + hw, cy + hh, cz],
      [cx + hw, cy - hh, cz],
      [cx - hw, cy - hh, cz],
    ],
    centre: [cx, cy, cz],
    w,
    h,
  }
}

/**
 * The screen's axis-aligned bounding box in CSS pixels.
 *
 * `project` maps a world point to viewport pixels. The caller supplies it,
 * which keeps this module free of THREE and lets a check exercise the contract
 * against a deliberately skewed projection.
 */
export function projectQuad(quad: ScreenQuad, project: (p: Vec3) => [number, number]): Rect {
  const pts = quad.corners.map(project)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function shaftFor(
  lens: Vec3,
  quad: ScreenQuad,
  cfg: HologramConfig,
): { origin: Vec3; target: Vec3; length: number; spread: number } {
  const target = quad.centre
  return {
    origin: lens,
    target,
    length: Math.hypot(
      target[0] - lens[0],
      target[1] - lens[1],
      target[2] - lens[2],
    ),
    spread: cfg.SHAFT_SPREAD,
  }
}

/**
 * Disc radius for a fan, in world units at the emitter's own depth.
 *
 * ⚠️ From the CAMERA FRUSTUM, not from the lens-to-screen distance. That was
 * the first attempt and the owner caught it: the near orb sits close to the
 * screen, so its disc was the smallest of the two and its edge landed inside
 * the frame — the rays visibly stopped either side of the panel. Worse, the
 * two orbs are at very different depths, so one world reach draws a huge fan
 * for the near orb and a small one for the far.
 *
 * The frame's full diagonal at a given depth is the greatest distance any
 * point inside the frame can be from any corner of it. A disc of that radius
 * therefore covers the frame from ANYWHERE, at any viewport and any depth, so
 * at SHAFT_REACH 1 the fan can never be seen to end. Above 1 is headroom for
 * the falloff; below 1 deliberately brings the edge into view.
 */
/**
 * A fan's axis on screen, turned by its slot's angle.
 *
 * ⚠️ Falls back to straight up rather than to zero. A zero-length direction
 * makes `dot(n, uDir)` zero everywhere and the fan vanishes silently; up is
 * where the screen sits from both orbs, so the degenerate case still draws
 * something sensible. Degenerate happens when the fan points straight at the
 * viewer, which the entry animation passes through.
 */
export function shaftAim(dx: number, dy: number, angleDeg: number): [number, number] {
  const len = Math.hypot(dx, dy)
  const [ux, uy] = len > 1e-6 ? [dx / len, dy / len] : [0, 1]
  const a = (angleDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [ux * c - uy * s, ux * s + uy * c]
}

export function shaftReach(
  camDist: number,
  fovDeg: number,
  aspect: number,
  cfg: HologramConfig,
): number {
  const halfH = Math.abs(camDist) * Math.tan((fovDeg * Math.PI) / 360)
  const halfW = halfH * aspect
  return Math.hypot(halfW, halfH) * 2 * cfg.SHAFT_REACH
}

/**
 * The glass's brightness dip at `tMs`. 0 = clear, FLICKER_DEPTH = deepest.
 *
 * ⚠️ This applies to the GLASS ONLY. The published rect and the `live` state
 * must not change with it: this screen will carry SUBTITLES, and text that
 * flickers on a 5s cycle defeats the accessibility feature it exists to
 * provide. `samsara-hologram.mjs` asserts the rect holds steady through a dip.
 */
export function flickerAt(tMs: number, cfg: HologramConfig): number {
  if (tMs < cfg.FLICKER_MS) return 0
  const into = tMs % cfg.FLICKER_MS
  if (into >= cfg.FLICKER_DUR_MS) return 0
  const p = into / cfg.FLICKER_DUR_MS
  // Two quick stutters rather than one smooth dip, so it reads as an unstable
  // projection rather than as a deliberate pulse.
  return Math.abs(Math.sin(p * Math.PI * 2)) * cfg.FLICKER_DEPTH
}
