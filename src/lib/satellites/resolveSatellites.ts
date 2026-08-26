import { DEFAULT_SATELLITES, type LabelMode, type SatelliteConfig } from './types'

/**
 * Satellites' slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 */
export type HeroEffectsSatellitesInput = {
  satellitesEnabled?: boolean | null
  satelliteField?: {
    innerRadius?: number | null
    outerRadius?: number | null
    mobileInnerRadius?: number | null
    mobileOuterRadius?: number | null
    tilt?: number | null
    tiltSideway?: number | null
    perspective?: number | null
  } | null
  satelliteMotion?: {
    orbitSpeed?: number | null
    orbitCcw?: boolean | null
    speedScale?: number | null
    trail?: number | null
  } | null
  satelliteLook?: {
    size?: number | null
    alpha?: number | null
    shade?: number | null
    depthScale?: number | null
    streak?: number | null
    ring?: number | null
    bandInner?: number | null
    bandOuter?: number | null
    tiltSpread?: number | null
    baseColor?: string | null
  } | null
  satelliteColors?: ({ color?: string | null } | null)[] | null
  satelliteLabels?: {
    mode?: LabelMode | null
    size?: number | null
    color?: string | null
    offset?: number | null
    hoverRadius?: number | null
  } | null
  satelliteHold?: {
    freeze?: boolean | null
    shakePx?: number | null
    shakeSpeed?: number | null
  } | null
  satelliteBehaviour?: {
    entranceMs?: number | null
    scrollFadeVh?: number | null
    seed?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: boolean | null | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

const hex = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v : fallback

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

const LABEL_MODES: LabelMode[] = ['hover', 'always', 'none']

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveSatellites(
  cms: HeroEffectsSatellitesInput | null | undefined,
): SatelliteConfig {
  const d = DEFAULT_SATELLITES
  const f = cms?.satelliteField ?? {}
  const m = cms?.satelliteMotion ?? {}
  const k = cms?.satelliteLook ?? {}
  const l = cms?.satelliteLabels ?? {}
  const h = cms?.satelliteHold ?? {}
  const b = cms?.satelliteBehaviour ?? {}

  // The band must come back ordered: seed() spreads satellites from min to max,
  // and an inverted pair would place them backwards. Payload's min/max guards
  // the admin UI, but the REST API can be written to directly.
  const rawInner = num(k.bandInner, d.SAT_RADIUS_MIN)
  const rawOuter = num(k.bandOuter, d.SAT_RADIUS_MAX)
  const bandInner = Math.min(rawInner, rawOuter)
  const bandOuter = Math.max(rawInner, rawOuter)

  // Only rows that are really a hex colour survive; an empty or entirely
  // invalid list falls back rather than leaving every satellite on the base
  // colour, which would look like the feature had broken.
  const colors = (cms?.satelliteColors ?? [])
    .map((row) => row?.color)
    .filter((c): c is string => typeof c === 'string' && HEX.test(c))

  const mode = l.mode && LABEL_MODES.includes(l.mode) ? l.mode : d.LABEL_MODE

  return {
    ...d,
    INNER_RADIUS: num(f.innerRadius, d.INNER_RADIUS),
    OUTER_RADIUS: num(f.outerRadius, d.OUTER_RADIUS),
    MOBILE_INNER_RADIUS: num(f.mobileInnerRadius, d.MOBILE_INNER_RADIUS),
    MOBILE_OUTER_RADIUS: num(f.mobileOuterRadius, d.MOBILE_OUTER_RADIUS),
    TILT: num(f.tilt, d.TILT),
    TILT_SIDEWAY: num(f.tiltSideway, d.TILT_SIDEWAY),
    PERSPECTIVE: num(f.perspective, d.PERSPECTIVE),

    ORBIT_SPEED: num(m.orbitSpeed, d.ORBIT_SPEED),
    ORBIT_DIR: bool(m.orbitCcw, d.ORBIT_DIR < 0) ? -1 : 1,
    SAT_SPEED_SCALE: num(m.speedScale, d.SAT_SPEED_SCALE),
    TRAIL: num(m.trail, d.TRAIL),

    SAT_ENABLED: bool(cms?.satellitesEnabled, d.SAT_ENABLED),
    SAT_SIZE: num(k.size, d.SAT_SIZE),
    SAT_ALPHA: clamp01(num(k.alpha, d.SAT_ALPHA)),
    SAT_SHADE: clamp01(num(k.shade, d.SAT_SHADE)),
    SAT_DEPTH_SCALE: num(k.depthScale, d.SAT_DEPTH_SCALE),
    SAT_STREAK: clamp01(num(k.streak, d.SAT_STREAK)),
    SAT_RING: num(k.ring, d.SAT_RING),
    SAT_RADIUS_MIN: bandInner,
    SAT_RADIUS_MAX: bandOuter,
    SAT_TILT_SPREAD: num(k.tiltSpread, d.SAT_TILT_SPREAD),
    SAT_COLOR: hex(k.baseColor, d.SAT_COLOR),
    SAT_COLORS: colors.length ? colors : [...d.SAT_COLORS],

    LABEL_MODE: mode,
    LABEL_SIZE: num(l.size, d.LABEL_SIZE),
    LABEL_COLOR: hex(l.color, d.LABEL_COLOR),
    LABEL_OFFSET: num(l.offset, d.LABEL_OFFSET),
    LABEL_HOVER_RADIUS: num(l.hoverRadius, d.LABEL_HOVER_RADIUS),

    HOLD_FREEZE: bool(h.freeze, d.HOLD_FREEZE),
    HOLD_SHAKE_PX: num(h.shakePx, d.HOLD_SHAKE_PX),
    HOLD_SHAKE_SPEED: num(h.shakeSpeed, d.HOLD_SHAKE_SPEED),

    ENTRANCE_MS: num(b.entranceMs, d.ENTRANCE_MS),
    SCROLL_FADE_VH: num(b.scrollFadeVh, d.SCROLL_FADE_VH),
    SEED: num(b.seed, d.SEED),
  }
}

/** Inverse of resolveSatellites, for the dev bench's save-to-CMS button. */
export function toSatellitesPayload(c: SatelliteConfig): HeroEffectsSatellitesInput {
  return {
    satellitesEnabled: c.SAT_ENABLED,
    satelliteField: {
      innerRadius: c.INNER_RADIUS,
      outerRadius: c.OUTER_RADIUS,
      mobileInnerRadius: c.MOBILE_INNER_RADIUS,
      mobileOuterRadius: c.MOBILE_OUTER_RADIUS,
      tilt: c.TILT,
      tiltSideway: c.TILT_SIDEWAY,
      perspective: c.PERSPECTIVE,
    },
    satelliteMotion: {
      orbitSpeed: c.ORBIT_SPEED,
      orbitCcw: c.ORBIT_DIR < 0,
      speedScale: c.SAT_SPEED_SCALE,
      trail: c.TRAIL,
    },
    satelliteLook: {
      size: c.SAT_SIZE,
      alpha: c.SAT_ALPHA,
      shade: c.SAT_SHADE,
      depthScale: c.SAT_DEPTH_SCALE,
      streak: c.SAT_STREAK,
      ring: c.SAT_RING,
      bandInner: c.SAT_RADIUS_MIN,
      bandOuter: c.SAT_RADIUS_MAX,
      tiltSpread: c.SAT_TILT_SPREAD,
      baseColor: c.SAT_COLOR,
    },
    satelliteColors: c.SAT_COLORS.map((color) => ({ color })),
    satelliteLabels: {
      mode: c.LABEL_MODE,
      size: c.LABEL_SIZE,
      color: c.LABEL_COLOR,
      offset: c.LABEL_OFFSET,
      hoverRadius: c.LABEL_HOVER_RADIUS,
    },
    satelliteHold: {
      freeze: c.HOLD_FREEZE,
      shakePx: c.HOLD_SHAKE_PX,
      shakeSpeed: c.HOLD_SHAKE_SPEED,
    },
    satelliteBehaviour: {
      entranceMs: c.ENTRANCE_MS,
      scrollFadeVh: c.SCROLL_FADE_VH,
      seed: c.SEED,
    },
  }
}
