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
  SAT_COLOR: string
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

  // ── behaviour ─────────────────────────────────────────────────────
  /** Entrance fade, ms. */
  ENTRANCE_MS: number
  /** Field dissolves over this many viewport heights of scroll. 0 = never. */
  SCROLL_FADE_VH: number
  SEED: number
}

/**
 * Starting point, not a proposal. Values are a first guess at translating a
 * white-on-black reference onto cream paper; the bench at /dev/satellites
 * exists precisely because these are expected to be wrong.
 */
export const DEFAULT_SATELLITES: Readonly<SatelliteConfig> = Object.freeze({
  INNER_RADIUS: 1.15,
  OUTER_RADIUS: 0.78,
  TILT: 20,
  TILT_SIDEWAY: 160,
  PERSPECTIVE: 1300,

  // Owner's call 2026-08-26, after seeing the dense version live: no dust, the
  // satellites carry the whole effect on their own. The slider is kept so the
  // field can be brought back without a code change.
  DUST_COUNT: 0,
  DUST_SIZE: 2.6,
  // Graphite, not white: the reference's glow is additive light on near-black
  // and simply cannot be reproduced as ink on #F6F1E7 paper. Density and trail
  // length have to carry the effect instead of luminance.
  DUST_COLOR: '#2B2A27',
  DUST_ALPHA: 0.34,
  DUST_THICKNESS: 16,
  DUST_CLUSTER: 2,
  ORBIT_SPEED: 4,
  PULL_SPEED: 0,
  TRAIL: 42,
  DUST_STREAK: 1,

  SAT_ENABLED: true,
  // Bigger than the dust-era default: with nothing else on screen these have to
  // carry the composition themselves, and a sphere needs pixels to read as one.
  SAT_SIZE: 11,
  SAT_COLOR: '#8E1114',
  SAT_ALPHA: 0.95,
  SAT_RADIUS_MIN: 0.5,
  SAT_RADIUS_MAX: 1,
  SAT_TILT_SPREAD: 14,
  SAT_SPEED_SCALE: 0.8,
  // Off by default now — the ring read as a bubble around a flat dot, and a
  // shaded sphere does not need the extra outline to look solid.
  SAT_RING: 0,
  SAT_SHADE: 1,
  SAT_STREAK: 1,
  SAT_DEPTH_SCALE: 0.45,

  LABEL_MODE: 'hover',
  LABEL_SIZE: 13,
  LABEL_COLOR: '#2B2A27',
  LABEL_OFFSET: 14,
  LABEL_HOVER_RADIUS: 90,

  ENTRANCE_MS: 1600,
  SCROLL_FADE_VH: 0.6,
  SEED: 20260826,
})
