import type * as THREE from 'three'

/**
 * Default tuning for the electrical wireframe ignition.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3, §4.6
 *
 * Frozen. Live values come from the `hero-effects` Payload global and are
 * merged over these by resolveIgnition(); the dev bench at
 * /[locale]/dev/ignition keeps its own mutable copy for tuning and can write
 * approved values back to that global.
 *
 * Phase boundaries are FRACTIONS of IGNITION_MS, never absolute milliseconds:
 * one duration retimes the whole sequence, and the phases cannot be driven
 * into an inconsistent state the way three independent ms values could.
 */
export type IgnitionConfig = {
  ENABLED: boolean
  IGNITION_MS: number
  SEED_END: number
  FRONT_END: number
  CUE_FRAC: number
  SEED_OFFSET_X: number
  SEED_OFFSET_Y: number
  SEED_OFFSET_Z: number
  FRONT_SOFTNESS: number
  WAKE_LAG: number
  CAGE_DENSITY: number
  CAGE_DENSITY_MOBILE: number
  CAGE_OPACITY: number
  CAGE_SEED: number
  COLD_COLOR: number
  WARM_COLOR: number
  HOT_COLOR: number
  CREST_COLOR: number
  CORE_STRENGTH: number
  CORE_RADIUS: number
  DARK_MASS_OPACITY: number
  GLOW_DECAY: number
  // --- morph cage overlay (spec §2b) ---
  OVERLAY_ENABLED: boolean
  OVERLAY_LEAD_MS: number
  SPHERE_SCALE: number
  BLOOM_SCALE: number
  POLY_SIDES: number
  BLOOM_START: number
  BLOOM_END: number
  MORPH_START: number
  // --- hold pulses (spec §2b.3) ---
  PULSE_ENABLED: boolean
  PULSE_MS: number
  // --- living cage: writhing wires and random sparks (spec §2c) ---
  WIRE_JITTER: number
  WIRE_SPEED: number
  SPARK_STAGGER: number
  SPARK_RATE: number
  SPARK_DENSITY: number
  SPARK_IDLE: number
  // --- ember particles (spec §2c) ---
  EMBER_ENABLED: boolean
  EMBER_DENSITY: number
  EMBER_SIZE: number
  EMBER_TWINKLE: number
  EMBER_OPACITY: number
}

export const DEFAULT_IGNITION: Readonly<IgnitionConfig> = Object.freeze({
  ENABLED: true,
  /** total duration of the bridge, ms. The single pacing control. */
  IGNITION_MS: 2000,
  /** fraction at which the seed bloom ends and the front starts expanding */
  SEED_END: 0.12,
  /** fraction at which the charge front finishes crossing the geometry */
  FRONT_END: 0.78,
  /**
   * Fraction at which `cue` fires — LogoStage's onLive, which drives the
   * orbiting satellites' entrance (HeroBlock's stageLive, threaded into
   * SatelliteField's `active` prop). Lands just as the front finishes, so the
   * energy disperses INTO the orbiting bodies. The since-removed
   * ConstellationField's entrance used to key off the same signal.
   */
  CUE_FRAC: 0.73,
  /** seed position offset from the logo's centre, as fractions of logo height */
  SEED_OFFSET_X: 0,
  SEED_OFFSET_Y: 0,
  SEED_OFFSET_Z: 0,
  /** crest half-width, as a fraction of logo height */
  FRONT_SOFTNESS: 0.18,
  /** how far behind the crest the skin materializes, as a fraction of logo height */
  WAKE_LAG: 0.1,
  /**
   * Fraction of wireframe segments kept. A PARTIAL wireframe reads as scribble
   * where a complete one reads as CAD.
   *
   * This is a LOOK control, not a budget control. THREE.WireframeGeometry
   * deduplicates shared edges, so the whole logo is only 29,557 segments
   * (19,704 tris, closed manifold => ~3T/2) — measured, not estimated. Even at
   * density 1 that is one cheap draw call, so density buys appearance only.
   *
   * Owner-tuned 2026-08-09 on the bench: 0.3 (~8.9k segments), down from the
   * provisional 0.55 — pulling toward the reference's delicate web rather than
   * the heavy black mass the higher value produced.
   */
  CAGE_DENSITY: 0.3,
  /** same, below 640px */
  CAGE_DENSITY_MOBILE: 0.3,
  /** owner-tuned: 0.26, well down from 0.9 — the cage reads as a whisper, not ink */
  CAGE_OPACITY: 0.26,
  /** mulberry32 seed, so the subsample is identical on every load */
  CAGE_SEED: 1337,
  /** cold cage — identical to the ghost wireframe ink and to the video's pencil */
  COLD_COLOR: 0x2b2a27,
  /** red-pencil token */
  WARM_COLOR: 0x8e1114,
  HOT_COLOR: 0xc8341a,
  /** already the SHINE_BRIGHT token. Kept small and brief. */
  CREST_COLOR: 0xfff8e0,
  CORE_STRENGTH: 1,
  /** hot-core radius as a fraction of logo height */
  CORE_RADIUS: 0.22,
  /**
   * Inner-body surface opacity DURING IGNITION ONLY. A 1px red line on
   * #F6F1E7 paper reads as a line, not as glow — glow needs contrast the paper
   * does not provide. OPTIMIND's struts read against soft dark mesh behind
   * them; this is that dark mass. See spec §3.3.
   */
  DARK_MASS_OPACITY: 0.12,
  /** exponential decay rate for residual glow during settle; higher = faster */
  GLOW_DECAY: 2.4,

  /**
   * The cage is ONE continuous object across the whole hero: it appears as a
   * sphere over the still-extruding sketch, blooms to a polygon, morphs home
   * into the logo's wireframe, then runs the charge and fades. Off → the
   * ignition simply starts at the video cut, as originally built.
   */
  OVERLAY_ENABLED: true,
  /** how long before the video ends the sphere appears */
  OVERLAY_LEAD_MS: 1000,
  /** starting sphere radius as a multiple of the logo's radius */
  SPHERE_SCALE: 1,
  /**
   * The cage's TOTAL extent when fully bloomed, as a multiple of the logo's
   * radius — measured corner to corner, so this is literally "how much bigger
   * than the mark does the cage ever get".
   *
   * Owner 2026-08-09: expressed against the LOGO, not against the sphere. Both
   * scales now share one reference, so the total is the number you set instead
   * of the product of two sliders.
   */
  BLOOM_SCALE: 1.1,
  /** silhouette of the bloomed shape. 8 = octagon; 6 reproduces the reference. */
  POLY_SIDES: 8,
  BLOOM_START: 0.15,
  BLOOM_END: 0.6,
  /** fraction of the overlay where the polygon starts collapsing into the logo */
  MORPH_START: 0.6,

  /** re-ignite while the logo is held and its skin is shedding */
  PULSE_ENABLED: true,
  /**
   * Length of one charge-only pulse, and the interval between them.
   * Owner 2026-08-10: 0.8s read as too insistent while holding. Settled on 2.5s,
   * which lets each pulse finish and clear well before the next begins.
   */
  PULSE_MS: 2500,

  /**
   * The cage is never still. Each vertex gets its own phase and drift axis from
   * a hash of its own position, so the web writhes and breathes rather than
   * translating. Endpoints that share a position hash identically, so the mesh
   * deforms coherently instead of tearing apart.
   *
   * Amplitude as a fraction of the logo's radius. The reference writhes subtly —
   * a slow breath, not a jitter.
   */
  WIRE_JITTER: 0.07,
  /**
   * Owner-tuned to 6, which is the CMS/bench maximum. Worth widening the range
   * if it ever wants to go faster — a value sitting exactly on its cap usually
   * means the cap is the constraint, not the preference.
   */
  WIRE_SPEED: 6,
  /**
   * Random per-segment offset applied to the charge front, as a fraction of the
   * logo's radius. Without it the front is a clean expanding ring; with it the
   * edge is broken and ragged, which is what the reference actually shows.
   */
  SPARK_STAGGER: 0.215,
  /** how often a given segment flares, cycles per second */
  SPARK_RATE: 2.3,
  /** fraction of each cycle a segment spends flaring — effectively how many are lit at once */
  SPARK_DENSITY: 0.19,
  /** spark level while the cage is cold (sphere/bloom), so it is alive before it ignites */
  SPARK_IDLE: 0.25,

  /**
   * Glowing dots at the cage's vertices — the most recognisable part of the
   * reference after the wires themselves. They follow the same morph and the
   * same colour ramp, and their opacity scales with local heat, so they cluster
   * around the charge rather than covering the whole cage.
   */
  EMBER_ENABLED: true,
  /** fraction of cage vertices that become embers */
  EMBER_DENSITY: 0.39,
  /** base point size in px, before perspective attenuation */
  EMBER_SIZE: 5,
  EMBER_TWINKLE: 2.5,
  EMBER_OPACITY: 0.95,
})

/** Discrete transitions. The continuous progress value is pulled via getProgress(). */
export type IgnitionEvent = 'seed' | 'cue' | 'done'

export type IgnitionUniforms = {
  /** current front radius, in logo-local units */
  uFront: { value: number }
  uSeed: { value: THREE.Vector3 }
  uSoftness: { value: number }
  uCoreRadius: { value: number }
  uCoreStrength: { value: number }
  /** 1 while the core is alive, decaying to 0 through settle */
  uCoreLive: { value: number }
  /** whole-cage fade, 1 through seed+front, 0 by the end of settle */
  uGlobalFade: { value: number }
  uWakeLag: { value: number }
  /** 1 while ignition owns the skin's alpha, 0 once it is handed back */
  uWakeActive: { value: number }
  uCold: { value: THREE.Color }
  uWarm: { value: THREE.Color }
  uHot: { value: THREE.Color }
  uCrest: { value: THREE.Color }
  uCageOpacity: { value: number }
  // --- morph cage (spec §2b.2) ---
  /** logo-local centre the sphere and polygon are built around */
  uCentre: { value: THREE.Vector3 }
  /** 0 = sphere, 1 = bloomed polygon */
  uBloom: { value: number }
  /** 0 = shaped (sphere/polygon), 1 = true logo position */
  uMorph: { value: number }
  uSphereR: { value: number }
  uBloomR: { value: number }
  uPolySides: { value: number }
  // --- living cage (spec §2c) ---
  uTime: { value: number }
  /** writhe amplitude in world units */
  uJitter: { value: number }
  uJitSpeed: { value: number }
  /** per-segment random offset of the charge front, world units */
  uSparkStagger: { value: number }
  uSparkRate: { value: number }
  uSparkDensity: { value: number }
  /** 0..1 master gate on random flares — low while cold, full once charged */
  uSparkLevel: { value: number }
  uEmberSize: { value: number }
  uEmberTwinkle: { value: number }
  uEmberOpacity: { value: number }
  /** camera distance to the logo, so EMBER_SIZE reads as pixels at that depth */
  uPointRef: { value: number }
}
