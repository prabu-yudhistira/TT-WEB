/**
 * Hero mascot — the CMS-editable surface of the LED face display.
 *
 * Design: docs/superpowers/specs/2026-08-28-mascot-eyes-design.md
 *
 * ── What is deliberately NOT here ─────────────────────────────────────
 * The 14 expression SHAPES. They live frozen in ./eyes.ts and are pinned by
 * eyes.check.ts (spec §7.1). Editing `lookDownLeft.gaze` in a Payload form
 * with no mascot on screen is not a workflow anyone can succeed at — those
 * shapes took a live bench and three tuning rounds, and they are the design of
 * the character rather than content. Changing one is a code change; the bench
 * at /dev/mascot is the tool for it.
 *
 * FACE_RADIUS is here but NOT exposed to the CMS: it is a MEASURED property of
 * the model (the smooth front cap ends at 0.50 model units, where the
 * ornamental bezel relief begins), and a field inviting someone to move it
 * could only ever break the display mask.
 */

export type MascotEyesConfig = {
  /**
   * Kill switch. False must leave the mascot exactly as it was before this
   * feature existed — painted eyes visible, no socket darkening, no display.
   */
  ENABLED: boolean

  // ── look ────────────────────────────────────────────────────────────
  /**
   * Body of the lit blob. Amber, not the reference video's cyan, so the hero
   * keeps ONE warm accent rather than gaining a second, cold one.
   */
  COLOR: string
  /** Hot centre of the blob. */
  CORE: string
  /**
   * Darkening laid over the cap so the mascot's PAINTED amber ovals do not
   * show through and ring the new eyes with the old ones.
   */
  SOCKET: string
  GLOW: number
  /** Half-distance between the two eye home positions, in display units. */
  GAP: number
  /**
   * How far past the display radius the socket darkening reaches.
   *
   * ⚠️ The shader HARD-RETURNS past this — there is no fade, so anything
   * beyond it is cut with a sharp edge. At the approved 1.34 there is no
   * headroom left: lookUpLeft already reaches 1.35. Raising this is the
   * release valve if any gaze or dy is ever pushed further. Spec §6.
   */
  SOCKET_SPAN: number
  /**
   * The socket's VERTICAL span. The opening is an oval, not a circle.
   *
   * ⚠️ Added 2026-09-01 because the circular cover was blacking out modelled
   * relief. A circle wide enough to cover where the eyes travel horizontally
   * also reaches far enough up and down to swallow the monogram plaque above
   * the face and the ornamental chin band below it — invisible at the hero's
   * 12.6-70px, obvious the moment the room shows the body at 400px+.
   *
   * Kept SEPARATE from SOCKET_SPAN rather than derived from it: how much room
   * the plaque and chin need is a property of the model, not a ratio anyone
   * should infer.
   */
  SOCKET_SPAN_Y: number
  /** ⚠️ MEASURED, not taste. Not a CMS field. See the file header. */
  FACE_RADIUS: number

  // ── scanlines ───────────────────────────────────────────────────────
  /** Line count at full strength. */
  SCANLINE_MAX: number
  /**
   * Body diameter (px) below which scanlines are off — 7 lines over an 18px
   * eye is moire, not texture. Above the 28px base size on purpose, so they
   * appear only over the nearer part of the orbit.
   */
  SCANLINE_MIN_PX: number
  /** px of body diameter per additional line, above the gate. */
  SCANLINE_RAMP: number

  // ── the beat ────────────────────────────────────────────────────────
  /**
   * How long one glance takes, start to resolved. Kept a little shorter than
   * the face-forward window so it lands and resolves while it can be seen.
   */
  GLANCE_SECONDS: number
  /** Where in the glance the expression peaks, 0..1. */
  GLANCE_PEAK: number
  /** cos(spin) above which the face counts as turned toward the viewer. */
  FACING_THRESHOLD: number
  /** Charge at which the press-and-hold reaction crosses from wide to shut. */
  CHARGE_CROSSOVER: number
  /** Never play the same expression two passes running. */
  NO_REPEAT: boolean

  /**
   * Relative frequency in the glance pool, per expression name.
   * 0 removes it from the beat entirely.
   */
  WEIGHTS: Readonly<Record<string, number>>
}

/**
 * Owner-approved on screen 2026-08-28 across three live tuning rounds at
 * /dev/mascot. Frozen, and pinned field-by-field by eyeTypes.check.ts so a
 * later edit is a deliberate act with the owner in the loop, not a silent diff.
 */
export const DEFAULT_MASCOT_EYES: MascotEyesConfig = Object.freeze({
  ENABLED: true,

  COLOR: '#F2A81C',
  CORE: '#FFF0BE',
  SOCKET: '#000000',
  GLOW: 0.55,
  GAP: 0.38,
  SOCKET_SPAN: 1.34,
  SOCKET_SPAN_Y: 0.95,
  FACE_RADIUS: 0.5,

  SCANLINE_MAX: 9,
  SCANLINE_MIN_PX: 44,
  SCANLINE_RAMP: 12,

  GLANCE_SECONDS: 0.6,
  GLANCE_PEAK: 0.45,
  FACING_THRESHOLD: 0.3,
  CHARGE_CROSSOVER: 0.7,
  NO_REPEAT: false,

  WEIGHTS: Object.freeze({
    neutral: 0,
    blink: 2,
    squint: 1,
    wide: 0,
    happy: 1,
    lookLeft: 1,
    lookRight: 1,
    lookUp: 1,
    lookDown: 1,
    lookUpLeft: 1,
    lookUpRight: 1,
    lookDownLeft: 1,
    lookDownRight: 1,
    wink: 1,
  }),
})
