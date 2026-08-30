/**
 * Solving the orthographic → perspective seam.
 *
 * The orbit's camera is orthographic in CSS-pixel units, which is what makes
 * MascotConfig.SIZE mean literal on-screen pixels and what guarantees the
 * mascot cannot drift out of the belt. The room's camera is perspective. At the
 * handoff SAMSARA must occupy the SAME number of pixels either side, or it
 * jumps in a single frame.
 *
 * Extracted rather than inlined into MascotEngine for the same reason
 * satellites/project.ts was extracted from SatelliteEngine — its own check file
 * says so: pulling the math out is what makes a change to it unable to pass
 * silently. Matching two projections by eye is unreliable, and a sub-pixel jump
 * on one viewport only is not something a contact sheet reveals.
 *
 * Pure: no three.js, no DOM.
 */
export type PerspectiveSolution = {
  fovDeg: number
  /** Camera distance from the subject, in world units. */
  distance: number
}

/**
 * Visible world height of a perspective frustum at a given distance.
 * fov is VERTICAL, matching THREE.PerspectiveCamera.
 */
function frustumHeight(distance: number, fovDeg: number): number {
  return 2 * distance * Math.tan((fovDeg * Math.PI) / 360)
}

/**
 * On-screen diameter, in CSS px, of something `worldDiameter` across sitting
 * `distance` from the camera.
 *
 * Linear in both worldDiameter and viewportH, and strictly decreasing in
 * distance — all three are pinned by assertion, because a sign or reciprocal
 * slip here would make the bounces grow the wrong way.
 */
export function projectedPx(
  worldDiameter: number,
  distance: number,
  viewportH: number,
  fovDeg: number,
): number {
  return viewportH * (worldDiameter / frustumHeight(distance, fovDeg))
}

/**
 * The distance at which `worldDiameter` renders as exactly `targetPx`.
 *
 * Inverts projectedPx analytically rather than iterating — an iterative solver
 * can half-converge and leave a fraction of a pixel behind, which is precisely
 * the error this module exists to eliminate.
 */
export function solveHandoff(
  targetPx: number,
  worldDiameter: number,
  viewportH: number,
  fovDeg: number,
): PerspectiveSolution {
  const wantedFrustumH = (worldDiameter * viewportH) / targetPx
  const distance = wantedFrustumH / (2 * Math.tan((fovDeg * Math.PI) / 360))
  return { fovDeg, distance }
}
