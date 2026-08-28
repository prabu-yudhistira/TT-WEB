import { DEFAULT_MASCOT, type MascotConfig } from './types'

/**
 * Mascot's slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 *
 * TILT / TILT_SIDEWAY / PERSPECTIVE / ORBIT_DIR / ORBIT_SPEED are deliberately
 * absent: the mascot shares the satellites' orbital plane, read from
 * resolveSatellites(), and must not be desyncable by editing the mascot alone.
 */
export type HeroEffectsMascotInput = {
  mascotEnabled?: boolean | null
  mascotLabelText?: string | null
  mascotOrbit?: {
    radius?: number | null
    mobileRadius?: number | null
    height?: number | null
    tiltOffset?: number | null
    phase?: number | null
    speedScale?: number | null
  } | null
  mascotLook?: {
    size?: number | null
    mobileSize?: number | null
    depthScale?: number | null
    opacity?: number | null
    envIntensity?: number | null
    lightIntensity?: number | null
  } | null
  mascotSpin?: {
    spinSpeed?: number | null
    spinTilt?: number | null
    bobPx?: number | null
    bobSeconds?: number | null
  } | null
  mascotTrail?: {
    enabled?: boolean | null
    seconds?: number | null
    density?: number | null
    size?: number | null
    spread?: number | null
    drift?: number | null
    glow?: number | null
    twinkle?: number | null
    opacity?: number | null
    additive?: boolean | null
    color?: string | null
    coreColor?: string | null
  } | null
  mascotLabel?: {
    enabled?: boolean | null
    size?: number | null
    color?: string | null
    offset?: number | null
    halo?: number | null
  } | null
  mascotHold?: {
    freeze?: boolean | null
    shakePx?: number | null
    shakeSpeed?: number | null
  } | null
  mascotBehaviour?: {
    entranceMs?: number | null
    scrollFadeVh?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: boolean | null | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

const hex = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v : fallback

const text = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && v.trim().length > 0 ? v : fallback

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveMascot(cms: HeroEffectsMascotInput | null | undefined): MascotConfig {
  const d = DEFAULT_MASCOT
  const o = cms?.mascotOrbit ?? {}
  const k = cms?.mascotLook ?? {}
  const s = cms?.mascotSpin ?? {}
  const t = cms?.mascotTrail ?? {}
  const l = cms?.mascotLabel ?? {}
  const h = cms?.mascotHold ?? {}
  const b = cms?.mascotBehaviour ?? {}

  return {
    ENABLED: bool(cms?.mascotEnabled, d.ENABLED),

    RADIUS: num(o.radius, d.RADIUS),
    MOBILE_RADIUS: num(o.mobileRadius, d.MOBILE_RADIUS),
    HEIGHT: num(o.height, d.HEIGHT),
    TILT_OFFSET: num(o.tiltOffset, d.TILT_OFFSET),
    PHASE: num(o.phase, d.PHASE),
    SPEED_SCALE: num(o.speedScale, d.SPEED_SCALE),

    SIZE: num(k.size, d.SIZE),
    MOBILE_SIZE: num(k.mobileSize, d.MOBILE_SIZE),
    DEPTH_SCALE: num(k.depthScale, d.DEPTH_SCALE),
    OPACITY: clamp01(num(k.opacity, d.OPACITY)),
    ENV_INTENSITY: num(k.envIntensity, d.ENV_INTENSITY),
    LIGHT_INTENSITY: num(k.lightIntensity, d.LIGHT_INTENSITY),

    SPIN_SPEED: num(s.spinSpeed, d.SPIN_SPEED),
    SPIN_TILT: num(s.spinTilt, d.SPIN_TILT),
    BOB_PX: num(s.bobPx, d.BOB_PX),
    BOB_SECONDS: num(s.bobSeconds, d.BOB_SECONDS),

    TRAIL_ENABLED: bool(t.enabled, d.TRAIL_ENABLED),
    TRAIL_SECONDS: num(t.seconds, d.TRAIL_SECONDS),
    TRAIL_DENSITY: num(t.density, d.TRAIL_DENSITY),
    TRAIL_SIZE: num(t.size, d.TRAIL_SIZE),
    TRAIL_SPREAD: num(t.spread, d.TRAIL_SPREAD),
    TRAIL_DRIFT: num(t.drift, d.TRAIL_DRIFT),
    TRAIL_GLOW: clamp01(num(t.glow, d.TRAIL_GLOW)),
    TRAIL_CORE_COLOR: hex(t.coreColor, d.TRAIL_CORE_COLOR),
    TRAIL_COLOR: hex(t.color, d.TRAIL_COLOR),
    TRAIL_OPACITY: clamp01(num(t.opacity, d.TRAIL_OPACITY)),
    TRAIL_TWINKLE: clamp01(num(t.twinkle, d.TRAIL_TWINKLE)),
    TRAIL_ADDITIVE: bool(t.additive, d.TRAIL_ADDITIVE),

    LABEL_ENABLED: bool(l.enabled, d.LABEL_ENABLED),
    LABEL_TEXT: text(cms?.mascotLabelText, d.LABEL_TEXT),
    LABEL_SIZE: num(l.size, d.LABEL_SIZE),
    LABEL_COLOR: hex(l.color, d.LABEL_COLOR),
    LABEL_OFFSET: num(l.offset, d.LABEL_OFFSET),
    LABEL_HALO: num(l.halo, d.LABEL_HALO),

    HOLD_FREEZE: bool(h.freeze, d.HOLD_FREEZE),
    HOLD_SHAKE_PX: num(h.shakePx, d.HOLD_SHAKE_PX),
    HOLD_SHAKE_SPEED: num(h.shakeSpeed, d.HOLD_SHAKE_SPEED),

    ENTRANCE_MS: num(b.entranceMs, d.ENTRANCE_MS),
    SCROLL_FADE_VH: num(b.scrollFadeVh, d.SCROLL_FADE_VH),
  }
}

/**
 * Inverse of resolveMascot, for the dev bench's save-to-CMS button. Returns the
 * nested groups AND the top-level mascotEnabled / mascotLabelText scalars, so
 * resolveMascot(toMascotPayload(x)) fully reconstructs x.
 */
export function toMascotPayload(c: MascotConfig): HeroEffectsMascotInput {
  return {
    mascotEnabled: c.ENABLED,
    mascotLabelText: c.LABEL_TEXT,
    mascotOrbit: {
      radius: c.RADIUS,
      mobileRadius: c.MOBILE_RADIUS,
      height: c.HEIGHT,
      tiltOffset: c.TILT_OFFSET,
      phase: c.PHASE,
      speedScale: c.SPEED_SCALE,
    },
    mascotLook: {
      size: c.SIZE,
      mobileSize: c.MOBILE_SIZE,
      depthScale: c.DEPTH_SCALE,
      opacity: c.OPACITY,
      envIntensity: c.ENV_INTENSITY,
      lightIntensity: c.LIGHT_INTENSITY,
    },
    mascotSpin: {
      spinSpeed: c.SPIN_SPEED,
      spinTilt: c.SPIN_TILT,
      bobPx: c.BOB_PX,
      bobSeconds: c.BOB_SECONDS,
    },
    mascotTrail: {
      enabled: c.TRAIL_ENABLED,
      seconds: c.TRAIL_SECONDS,
      density: c.TRAIL_DENSITY,
      size: c.TRAIL_SIZE,
      spread: c.TRAIL_SPREAD,
      drift: c.TRAIL_DRIFT,
      glow: c.TRAIL_GLOW,
      twinkle: c.TRAIL_TWINKLE,
      opacity: c.TRAIL_OPACITY,
      additive: c.TRAIL_ADDITIVE,
      color: c.TRAIL_COLOR,
      coreColor: c.TRAIL_CORE_COLOR,
    },
    mascotLabel: {
      enabled: c.LABEL_ENABLED,
      size: c.LABEL_SIZE,
      color: c.LABEL_COLOR,
      offset: c.LABEL_OFFSET,
      halo: c.LABEL_HALO,
    },
    mascotHold: {
      freeze: c.HOLD_FREEZE,
      shakePx: c.HOLD_SHAKE_PX,
      shakeSpeed: c.HOLD_SHAKE_SPEED,
    },
    mascotBehaviour: {
      entranceMs: c.ENTRANCE_MS,
      scrollFadeVh: c.SCROLL_FADE_VH,
    },
  }
}
