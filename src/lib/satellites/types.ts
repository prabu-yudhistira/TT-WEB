/**
 * PROTOTYPE — hero orbiting satellites (sub-project 3, 2026-08-26 attempt).
 *
 * THROWAWAY CODE. This exists to put the effect on screen so the owner can
 * judge how it LOOKS before anything is specced or built properly. The
 * 2026-08-10 orbiting-orbs build passed every technical gate and was rejected
 * on visual taste after 7 of 10 tasks; this pass deliberately inverts that
 * order. Nothing here is CMS-backed and nothing touches the database.
 *
 * Ported from _ASSETS/Web-components/Black Hole — Originkit.js, with the
 * central sphere removed (the 3D logo is the centre) and two particle
 * populations instead of one: DUST (many, tiny, atmospheric) and SATELLITES
 * (few, larger, each carrying one CMS word).
 */

export type LabelMode = 'hover' | 'always' | 'none'

export type SatelliteConfig = {
  // ── field geometry ────────────────────────────────────────────────
  /** Orbit floor, as a multiple of the logo's on-screen half-height. 1 = the
   *  mark's own edge, so anything below ~1 orbits *inside* the logo. */
  INNER_RADIUS: number
  /** Outermost orbit, as a fraction of half the viewport's smaller side. */
  OUTER_RADIUS: number
  /** Disk inclination (deg) — 0 is edge-on, 90 is face-on. */
  TILT: number
  /** Roll of the whole disk around the view axis (deg). */
  TILT_SIDEWAY: number
  /** Projection depth. Lower = stronger perspective. */
  PERSPECTIVE: number

  // ── dust ──────────────────────────────────────────────────────────
  DUST_COUNT: number
  DUST_SIZE: number
  DUST_COLOR: string
  DUST_ALPHA: number
  /** Vertical thickness of the disk, in px. */
  DUST_THICKNESS: number
  /** How tightly dust clusters toward the inner edge. 1 = even, 3 = very tight. */
  DUST_CLUSTER: number
  ORBIT_SPEED: number
  /** +1 clockwise on screen, -1 counter-clockwise. */
  ORBIT_DIR: number
  /** Inward drift. The reference's accretion; 0 keeps orbits stable. */
  PULL_SPEED: number
  /** 0 = no trail (clear every frame), 50 = longest streaks. */
  TRAIL: number
  /**
   * 0 = stamp a dot per frame (the reference's behaviour — reads as a beaded
   * dotted ring at our particle sizes), 1 = join each frame to the last with a
   * line, giving a continuous streak. Anything between shortens the join.
   */
  DUST_STREAK: number

  // ── satellites (word carriers) ────────────────────────────────────
  SAT_ENABLED: boolean
  SAT_SIZE: number
  /** Fallback colour, used for any satellite index SAT_COLORS does not cover. */
  SAT_COLOR: string
  /** Per-satellite colours by index. Shorter than the word list is fine. */
  SAT_COLORS: string[]
  SAT_ALPHA: number
  /** Satellite orbit band, as fractions of OUTER_RADIUS. */
  SAT_RADIUS_MIN: number
  SAT_RADIUS_MAX: number
  /** Per-satellite inclination variation (deg). 0 = coplanar with the dust. */
  SAT_TILT_SPREAD: number
  /** Satellite orbital speed as a multiple of the dust's. */
  SAT_SPEED_SCALE: number
  /** Ring drawn around each satellite, as a multiple of SAT_SIZE. 0 = none. */
  SAT_RING: number
  /**
   * 0 = flat filled disc, 1 = fully modelled sphere (offset highlight, dark
   * terminator, rim light, specular). This is the reference's own centre-sphere
   * technique applied per satellite.
   */
  SAT_SHADE: number
  /** Same as DUST_STREAK, for the satellites' own trails. */
  SAT_STREAK: number
  /**
   * Extra size falloff with depth, beyond the perspective divide. 0 = only the
   * projection scales them; higher exaggerates near/far, which is the cheapest
   * strong 3D cue when there is no dust left to carry the disk.
   */
  SAT_DEPTH_SCALE: number

  // ── labels ────────────────────────────────────────────────────────
  LABEL_MODE: LabelMode
  LABEL_SIZE: number
  LABEL_COLOR: string
  /** Gap between the satellite and its word, in px. */
  LABEL_OFFSET: number
  /** Cursor proximity that reveals a word in 'hover' mode, in px. */
  LABEL_HOVER_RADIUS: number

  // ── hold coupling ─────────────────────────────────────────────────
  /**
   * While the mark is pressed and held, freeze the orbits. The logo's own
   * separation charge drives this — LogoEngine.getCharge() rises 0→1 over
   * CHARGE_MS — so the two effects share one gesture rather than competing.
   */
  HOLD_FREEZE: boolean
  /** Shake amplitude in px at full charge. */
  HOLD_SHAKE_PX: number
  /** Radians of phase advance per frame while shaking. */
  HOLD_SHAKE_SPEED: number

  // ── behaviour ─────────────────────────────────────────────────────
  /** Entrance fade, ms. */
  ENTRANCE_MS: number
  /** Field dissolves over this many viewport heights of scroll. 0 = never. */
  SCROLL_FADE_VH: number
  SEED: number
}

/**
 * OWNER-APPROVED VALUES, tuned live at /dev/satellites and handed back
 * 2026-08-26. These are no longer a guess — they are the look that was signed
 * off, and the spec is written around them. Change them only on the owner's
 * say-so.
 *
 * Character of the approved setting: a wide, slow, sparse belt sitting well
 * clear of the mark, with small multi-coloured spheres carrying always-visible
 * words, and a restrained shake on hold.
 */
export const DEFAULT_SATELLITES: Readonly<SatelliteConfig> = Object.freeze({
  // 3x the mark's half-height: the belt clears the logo by a wide margin
  // instead of hugging it.
  INNER_RADIUS: 3,
  // At the bench slider's ceiling — see the spec's open question on whether
  // this range needs widening before it becomes a CMS field.
  OUTER_RADIUS: 1.6,
  TILT: 20,
  TILT_SIDEWAY: 160,
  PERSPECTIVE: 1300,

  // Owner's call 2026-08-26, after seeing the dense version live: no dust, the
  // satellites carry the whole effect on their own. The slider is kept so the
  // field can be brought back without a code change.
  DUST_COUNT: 0,
  DUST_SIZE: 2.6,
  DUST_COLOR: '#2B2A27',
  DUST_ALPHA: 0.34,
  DUST_THICKNESS: 16,
  DUST_CLUSTER: 2,
  ORBIT_SPEED: 2.2,
  ORBIT_DIR: -1, // counter-clockwise
  PULL_SPEED: 0,
  TRAIL: 42,
  DUST_STREAK: 1,

  SAT_ENABLED: true,
  // Small — the approved look is a scattering of beads, not the large spheres
  // the dust-free default started at.
  SAT_SIZE: 4,
  SAT_COLOR: '#8E1114',
  // Owner-picked, one per satellite. NOTE: this is a deliberate departure from
  // the site's single Atelier palette (paper / graphite / red-pencil) — see the
  // spec's palette section. Indices beyond the word list are unused; indices the
  // list overruns fall back to SAT_COLOR.
  SAT_COLORS: [
    '#000000',
    '#ffd500',
    '#f96d3e',
    '#23e126',
    '#0f8a75',
    '#04b1b4',
    '#13118d',
    '#2B2A27',
    '#b04803',
    '#145c0a',
    '#118d1f',
    '#b400cc',
    '#bd0000',
  ],
  SAT_ALPHA: 0.95,
  SAT_RADIUS_MIN: 0.74,
  // Above 1 deliberately: satellites orbit BEYOND the nominal outer radius, so
  // the widest of them leave the frame edge on a landscape window.
  SAT_RADIUS_MAX: 1.28,
  SAT_TILT_SPREAD: 15,
  SAT_SPEED_SCALE: 0.8,
  // Back on, but tight — 1.1x the sphere reads as a thin outline hugging the
  // bead rather than the detached bubble that 2.4x produced.
  SAT_RING: 1.1,
  SAT_SHADE: 1,
  SAT_STREAK: 1,
  SAT_DEPTH_SCALE: 1,

  LABEL_MODE: 'always',
  LABEL_SIZE: 12,
  LABEL_COLOR: '#2B2A27',
  LABEL_OFFSET: 14,
  LABEL_HOVER_RADIUS: 90,

  HOLD_FREEZE: true,
  HOLD_SHAKE_PX: 3,
  HOLD_SHAKE_SPEED: 1.1, // matches ShatterController's own VIBRATE_PHASE_STEP

  ENTRANCE_MS: 1600,
  SCROLL_FADE_VH: 0.6,
  SEED: 20260826,
})
