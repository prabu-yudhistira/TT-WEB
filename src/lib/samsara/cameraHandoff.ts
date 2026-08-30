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
 * Screen pixels → world X/Y on the plane sitting `distance` from the camera.
 *
 * This is the gap Task 8 found and deliberately left open: `place()` positions
 * SAMSARA in ORTHOGRAPHIC screen-pixel space — X and Y in the hundreds, scale in
 * pixels — so switching to the perspective camera without converting that
 * placement puts the body far outside the frustum and renders an empty room.
 * That is exactly what happened the first time the room's dev handle swapped
 * cameras.
 *
 * Assumes the camera sits on +Z looking at the origin, which is how
 * setCameraMode() builds it.
 */
export function screenToWorld(
  xPx: number,
  yPx: number,
  distance: number,
  viewportW: number,
  viewportH: number,
  fovDeg: number,
): { x: number; y: number } {
  const fh = frustumHeight(distance, fovDeg)
  const fw = fh * (viewportH > 0 ? viewportW / viewportH : 1)
  // Screen y grows downward; world y grows upward.
  const ndcX = viewportW > 0 ? (xPx / viewportW) * 2 - 1 : 0
  const ndcY = viewportH > 0 ? 1 - (yPx / viewportH) * 2 : 0
  return { x: (ndcX * fw) / 2, y: (ndcY * fh) / 2 }
}

/**
 * World diameter that renders as `targetPx` at `distance`.
 *
 * The inverse of the size half of the problem: screenToWorld places the body,
 * this scales it. Together they replace the orthographic pixel placement.
 */
export function worldSizeFor(
  targetPx: number,
  distance: number,
  viewportH: number,
  fovDeg: number,
): number {
  return viewportH > 0 ? (targetPx / viewportH) * frustumHeight(distance, fovDeg) : 0
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
