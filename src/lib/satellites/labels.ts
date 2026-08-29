/**
 * Where each satellite's word may be drawn.
 *
 * Pure geometry, deliberately free of DOM and canvas, because two bugs already
 * hid in this logic when it lived inside the render loop: satellites inherited a
 * cached label width of 0 on re-seed (a zero-width box never collides, silently
 * defeating suppression), and the box height was assumed to equal the font size
 * when it is really the element's line-height, ~1.35x larger, which let labels
 * one line apart pass the overlap test while visibly colliding.
 */

/** Distance from a frame edge over which a label fades out entirely. */
export const EDGE_FADE_PX = 48

export type LabelCandidate = {
  index: number
  /** Label box, in container pixels. */
  x: number
  y: number
  w: number
  h: number
  /** Depth; lower is nearer the viewer. */
  z: number
  /** Opacity before placement rules are applied. */
  alpha: number
}

export type LabelPlacement = { index: number; opacity: number }

/** A label box in container pixels. */
export type LabelBox = { l: number; r: number; t: number; b: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Applies two rules, in order:
 *
 * 1. Fade out over the last `edgeFadePx` before any frame edge. A sphere
 *    leaving frame reads as depth; half a word reads as a rendering bug.
 * 2. Nearest-first collision suppression. When two words overlap the one in
 *    front keeps its label — physically right, and it is the difference between
 *    a readable hero and an unreadable pile. Without it, twelve always-on labels
 *    average 5.9 overlapping pairs on a 390px frame.
 *
 * Every candidate is returned, so a caller driving DOM nodes never has to
 * handle a missing entry.
 *
 * `reserved` holds boxes already occupied by labels this pass does not own —
 * in practice the mascot's word, which is placed by a different engine on a
 * different layer and therefore cannot take part in the sort above. Reserved
 * boxes always win: there are a dozen hero words but only one mascot, so the
 * mascot keeps its name and a colliding satellite yields. Measured before this
 * existed: the mascot's word overlapped a satellite word in 13.3% of frames at
 * 1440x900.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  viewW: number,
  viewH: number,
  edgeFadePx: number = EDGE_FADE_PX,
  reserved: LabelBox[] = [],
): LabelPlacement[] {
  const out: LabelPlacement[] = []
  const taken: LabelBox[] = [...reserved]
  const fade = Math.max(1, edgeFadePx)

  // Nearest first. Sorting a copy keeps the caller's array order intact.
  const order = [...candidates].sort((a, b) => a.z - b.z)

  for (const c of order) {
    let opacity = clamp01(c.alpha)

    const room = Math.min(
      c.x - fade,
      viewW - (c.x + c.w) - fade,
      c.y - fade,
      viewH - (c.y + c.h) - fade,
    )
    if (room < 0) opacity *= clamp01(1 + room / fade)

    // An already-invisible label must not reserve space and hide a visible one.
    if (opacity > 0.05) {
      const box = { l: c.x, r: c.x + c.w, t: c.y, b: c.y + c.h }
      const hit = taken.some((o) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b)
      if (hit) opacity = 0
      else taken.push(box)
    }

    out.push({ index: c.index, opacity })
  }

  return out
}
