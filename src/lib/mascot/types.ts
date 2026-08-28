/**
 * Hero orbiting mascot — configuration.
 *
 * The numbers in DEFAULT_MASCOT are owner-tuned on screen at /dev/mascot and
 * signed off (2026-08-28); the spec — docs/superpowers/specs/2026-08-28-hero-
 * mascot-design.md — is written around them, the same inversion that made the
 * satellites work and whose absence sank the 2026-08-10 orbs attempt. The
 * engine and CMS around this config are still prototype pending that build.
 *
 * Note what is NOT here: TILT, TILT_SIDEWAY and PERSPECTIVE. Those define the
 * belt itself and are read from the satellite config, so the mascot cannot be
 * desynced from the satellites by editing it alone. Only the mascot's own
 * radius, size, speed, spin and trail belong to the mascot.
 */

export type MascotConfig = {
  ENABLED: boolean

  // ── orbit ─────────────────────────────────────────────────────────
  /**
   * Orbit radius as a fraction of the satellites' OUTER_RADIUS. The satellite
   * band runs 0.5–0.8, so anything above 0.8 sits outside the belt — which is
   * the brief. Above ~1.0 the mascot starts leaving frame at the widest point
   * of its orbit; that may well be wanted for something this size, but it is a
   * decision to make on screen, not a bug.
   */
  RADIUS: number
  MOBILE_RADIUS: number
  /** Offset out of the belt plane, px. Lets it ride above or below the beads. */
  HEIGHT: number
  /** Its own inclination offset from the belt plane, degrees. */
  TILT_OFFSET: number
  /** Where it starts on the orbit, degrees — used to park it away from a satellite. */
  PHASE: number
  /** Orbit speed as a multiple of the satellites' ORBIT_SPEED. */
  SPEED_SCALE: number

  // ── look ──────────────────────────────────────────────────────────
  /** On-screen diameter in CSS px at zero depth. Literal pixels, not a multiplier. */
  SIZE: number
  MOBILE_SIZE: number
  /**
   * Extra near/far size falloff beyond the perspective divide. Mirrors the
   * satellites' SAT_DEPTH_SCALE so the two read as sharing one depth cue.
   */
  DEPTH_SCALE: number
  OPACITY: number
  /** Environment reflection strength. Brass is fully metallic — at 0 it goes black. */
  ENV_INTENSITY: number
  /** Key light strength, over the hero's own directional light. */
  LIGHT_INTENSITY: number

  // ── spin ──────────────────────────────────────────────────────────
  /** Its own rotation, degrees per second. Independent of the orbit. */
  SPIN_SPEED: number
  /** Spin axis tilt away from vertical, degrees. */
  SPIN_TILT: number
  /** Bob amplitude in px, a slow float on top of the orbit. */
  BOB_PX: number
  BOB_SECONDS: number

  // ── trail: glowing gold dust ──────────────────────────────────────
  TRAIL_ENABLED: boolean
  /** How long each mote lives, seconds. */
  TRAIL_SECONDS: number
  /** Motes emitted per second. */
  TRAIL_DENSITY: number
  /** Mote diameter in px at birth. Literal pixels — the camera is orthographic. */
  TRAIL_SIZE: number
  /** Random scatter at the moment of emission, px. */
  TRAIL_SPREAD: number
  /** How fast motes drift away from the path, px/sec. */
  TRAIL_DRIFT: number
  /**
   * Hot-core strength, 0–1. The bright centre inside each mote. Together with
   * additive blending this is what makes the grain read as light rather than
   * as speckle — a steep, tiny core reads as a hard dot and loses the glow.
   */
  TRAIL_GLOW: number
  /** The bright centre of each mote. */
  TRAIL_CORE_COLOR: string
  /** The saturated body of each mote. */
  TRAIL_COLOR: string
  TRAIL_OPACITY: number
  /** Per-mote brightness flicker, 0–1. */
  TRAIL_TWINKLE: number
  /**
   * Additive blending.
   *
   * ⚠️ This was predicted to fail. The reasoning was that #F6F1E7 paper leaves
   * almost no headroom to add into, so additive would clip toward white instead
   * of reading as gold — the same shape as the 2026-08-08 lesson that trionn's
   * sheer skin works on #0C0C0C and disappears on our paper. Built both, put
   * them side by side on the running hero, and the difference was modest, not
   * fatal: additive is slightly paler and loses a little amber.
   *
   * The owner compared both live and chose ADDITIVE, paired with a brighter,
   * more saturated dust colour (#fdb721, up from #C37D04) that compensates for
   * exactly that paling. Recorded as an informed decision — do not "fix" it
   * back to normal blending, and do not re-derive the prediction above as if it
   * had been confirmed.
   */
  TRAIL_ADDITIVE: boolean

  // ── label ─────────────────────────────────────────────────────────
  LABEL_ENABLED: boolean
  /**
   * The mascot's own word.
   *
   * ⚠️ Deliberately NOT drawn from the hero's `floatingWords` list. That array
   * is localized and its length drives the satellite count, so taking a word
   * from it would either remove a bead or make the mascot's name change with
   * the language. The mascot is one fixed object; its name is its own field.
   */
  LABEL_TEXT: string
  LABEL_SIZE: number
  LABEL_COLOR: string
  /** Gap between the mascot's edge and its word, px. */
  LABEL_OFFSET: number
  /**
   * Paper-coloured halo behind the word, in px. 0 = none.
   *
   * The mascot's orbit crosses the mark, and graphite text over the red-pencil
   * stroke is close to illegible — measured on screen: of "SAMSARA" over the
   * logo's red bar, only the letters hanging off onto paper stayed readable.
   * The satellites never hit this because they dim to 0.15 when behind the mark
   * and near its centre; the mascot passes IN FRONT of it too, where dimming
   * would be wrong.
   */
  LABEL_HALO: number

  // ── hold coupling ─────────────────────────────────────────────────
  /** Freeze and tremble while the mark is held, exactly as the satellites do. */
  HOLD_FREEZE: boolean
  HOLD_SHAKE_PX: number
  HOLD_SHAKE_SPEED: number

  // ── behaviour ─────────────────────────────────────────────────────
  ENTRANCE_MS: number
  /** Field dissolves over this many viewport heights of scroll. 0 = never. */
  SCROLL_FADE_VH: number
}

/**
 * Owner-tuned at /dev/mascot and handed back 2026-08-28. Everything outside the
 * trail group is their approved reading: a small, fast-spinning bead riding
 * ABOVE the belt plane rather than a large body outside it.
 *
 * ⚠️ HEIGHT is load-bearing, not decorative. A positive height shifts the
 * mascot's depth by -HEIGHT*sin(TILT) — about -46px here — which biases it
 * consistently toward the viewer. That is the only reason the mascot never
 * sorts wrongly against a satellite bead despite orbiting INSIDE the bead band
 * (0.5–0.8) rather than outside it: measured 0.0% wrong-sorting over 420
 * samples at three viewports, with up to 13.6% of frames overlapping a bead.
 * Drop HEIGHT toward 0 or negative and that guarantee goes with it.
 *
 * The trail was re-tuned separately after the ribbon was replaced by this
 * gold-dust field at the owner's request, and these are their approved dust
 * values. The earlier ribbon numbers (WIDTH 0.67, OPACITY 0.12) are gone and
 * are not comparable to anything here.
 */
export const DEFAULT_MASCOT: Readonly<MascotConfig> = Object.freeze({
  ENABLED: true,

  RADIUS: 0.71,
  MOBILE_RADIUS: 0.55,
  HEIGHT: 136,
  TILT_OFFSET: 0,
  PHASE: 88,
  SPEED_SCALE: 0.52,

  SIZE: 28,
  MOBILE_SIZE: 18,
  // NOT the satellites' 0.9. That value is tuned for 4px beads, where the
  // resulting ~4.5x swing at closest approach reads as depth. Applied to a
  // body of any real size the same number is overwhelming — an 84px mascot
  // became ~380px for a third of every orbit, measured, not guessed.
  DEPTH_SCALE: 0.3,
  OPACITY: 1,
  ENV_INTENSITY: 1,
  LIGHT_INTENSITY: 1.5,

  SPIN_SPEED: 113,
  SPIN_TILT: 12,
  BOB_PX: 0,
  BOB_SECONDS: 8.8,

  TRAIL_ENABLED: true,
  TRAIL_SECONDS: 1.4,
  TRAIL_DENSITY: 130,
  TRAIL_SIZE: 10,
  TRAIL_SPREAD: 6.5,
  TRAIL_DRIFT: 25,
  TRAIL_GLOW: 0.95,
  TRAIL_CORE_COLOR: '#FFFCD6',
  // Brighter and more saturated than the first pass's #C37D04 — chosen with
  // additive blending on, where a duller gold pales out against the paper.
  TRAIL_COLOR: '#FDB721',
  TRAIL_OPACITY: 0.75,
  TRAIL_TWINKLE: 0.45,
  TRAIL_ADDITIVE: true,

  LABEL_ENABLED: true,
  LABEL_TEXT: 'SAMSARA',
  // The satellites' own label values, so the mascot's word reads as part of the
  // same family rather than as a second, competing typographic voice.
  LABEL_SIZE: 12,
  LABEL_COLOR: '#2B2A27',
  LABEL_OFFSET: 14,
  // Off by default: this is a legibility fix with a typographic cost, and the
  // site's pencil-sketch character may not want a halo at all. Tune it on
  // screen rather than assuming.
  LABEL_HALO: 0,

  HOLD_FREEZE: true,
  HOLD_SHAKE_PX: 1.5,
  HOLD_SHAKE_SPEED: 1,

  ENTRANCE_MS: 1600,
  SCROLL_FADE_VH: 0.6,
})
