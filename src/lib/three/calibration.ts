// Hero logo calibration (measured 2026-07-16 against sketch-poster.webp, the
// stitched draw-in + 3D-extrusion video's final frame — the extruded form,
// bbox x 747–1170 / y 333–774 of 1920×1080). Lets the 3D mesh take over the
// video at the same on-screen size/position so the crossfade is invisible.
// Spec §7.
export const CALIB = {
  HEIGHT_FRAC: 0.408, // logo bbox height as fraction of frame height
  // HEIGHT_FRAC is height-only — on a narrow portrait phone the logo's WIDTH
  // (height * aspect * viewport h/w) ends up ~100%+ of screen width. This is
  // a separate, easily-tunable knob for <640px viewports only (2026-07-14
  // revision — owner approved the screenshot).
  MOBILE_HEIGHT_FRAC: 0.24,
  CENTER_Y: 0.513, // logo center, fraction from top (slightly below middle)
  CENTER_X: 0.5, // horizontally centered
  CAMERA_FOV: 35,
  CAMERA_Z: 2.4,
}

/** Visible world height at the z=0 plane for the calibrated camera. */
export function visibleHeight(distance = CALIB.CAMERA_Z, fovDeg = CALIB.CAMERA_FOV): number {
  return 2 * Math.tan((fovDeg * Math.PI) / 180 / 2) * distance
}

/** The sketch video is 1920x1080. */
export const VIDEO_ASPECT = 16 / 9

/**
 * How much taller the displayed video is than the viewport.
 *
 * HEIGHT_FRAC and CENTER_Y are fractions of the VIDEO FRAME, but the mesh was
 * being sized against the VIEWPORT — and on desktop the video is
 * `object-fit: cover`, so its displayed height is max(viewportH, viewportW /
 * 16:9). Those two agree only at exactly 16:9. On anything wider the video is
 * scaled up and cropped, so its logo is drawn larger than the mesh that
 * replaces it, and the handoff visibly shrinks: ~1.11x on a 1920x969 window,
 * ~1.33x on a 2560x1080 ultrawide. Owner reported it 2026-08-10.
 *
 * Mobile (<640px) is excluded: that breakpoint sizes the video explicitly in
 * svh units with `object-fit: contain`, a different mapping that
 * MOBILE_HEIGHT_FRAC already accounts for.
 */
export function videoCoverScale(viewportW: number, viewportH: number): number {
  if (!(viewportW > 0) || !(viewportH > 0)) return 1
  return Math.max(1, viewportW / viewportH / VIDEO_ASPECT)
}

/** Logo bbox aspect, from _ASSETS/logo/logo-bbox.json. */
export const LOGO_ASPECT = 1532 / 1427

export type LogoScreenBox = { cx: number; cy: number; hw: number; hh: number }

/**
 * Where the 3D mark actually lands on screen, in CSS pixels.
 *
 * Used by the orbiting satellites to place their orbit centre. Mobile swaps
 * HEIGHT_FRAC, and desktop multiplies by the video's object-fit:cover factor
 * exactly as LogoEngine.applyCalibration does. Getting either wrong makes an
 * overlay drift off the mark on anything that isn't a 16:9 window, which is
 * why it lives here rather than being re-derived per consumer — the
 * since-removed ConstellationField used to duplicate this same computation
 * inline before this helper existed.
 */
export function logoScreenBox(
  viewportW: number,
  viewportH: number,
  mobile = viewportW < 640,
): LogoScreenBox {
  const heightFrac = mobile ? CALIB.MOBILE_HEIGHT_FRAC : CALIB.HEIGHT_FRAC
  const cover = mobile ? 1 : videoCoverScale(viewportW, viewportH)
  const lh = heightFrac * viewportH * cover
  return {
    cx: CALIB.CENTER_X * viewportW,
    cy: viewportH / 2 + (CALIB.CENTER_Y - 0.5) * viewportH * cover,
    hw: (lh * LOGO_ASPECT) / 2,
    hh: lh / 2,
  }
}
