import { EXPRESSION_ORDER } from './eyes'
import { DEFAULT_MASCOT_EYES, type MascotEyesConfig } from './eyeTypes'

/**
 * The eyes' slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 *
 * FACE_RADIUS is deliberately absent — it is a measured property of the model,
 * not a preference. See eyeTypes.ts.
 */
export type HeroEffectsEyesInput = {
  mascotEyesEnabled?: boolean | null
  mascotEyesLook?: {
    color?: string | null
    coreColor?: string | null
    socketColor?: string | null
    glow?: number | null
    gap?: number | null
    socketSpan?: number | null
  } | null
  mascotEyesScanlines?: {
    max?: number | null
    minBodyPx?: number | null
    ramp?: number | null
  } | null
  mascotEyesBeat?: {
    glanceSeconds?: number | null
    glancePeak?: number | null
    facingThreshold?: number | null
    chargeCrossover?: number | null
    noRepeat?: boolean | null
  } | null
  mascotEyesWeights?: Record<string, number | null | undefined> | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: boolean | null | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

const hex = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v : fallback

/** Keeps a fraction strictly inside 0..1 — the beat divides by these. */
const frac = (v: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(0.999, Math.max(0.001, v)) : fallback

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveMascotEyes(
  cms: HeroEffectsEyesInput | null | undefined,
): MascotEyesConfig {
  const d = DEFAULT_MASCOT_EYES
  const l = cms?.mascotEyesLook ?? {}
  const s = cms?.mascotEyesScanlines ?? {}
  const b = cms?.mascotEyesBeat ?? {}
  const w = cms?.mascotEyesWeights ?? {}

  // A missing weight falls back to its default rather than to 0 — 0 would
  // silently drop that expression out of the beat.
  const weights: Record<string, number> = {}
  for (const k of EXPRESSION_ORDER) {
    weights[k] = Math.max(0, num(w?.[k], d.WEIGHTS[k] ?? 0))
  }

  return {
    ENABLED: bool(cms?.mascotEyesEnabled, d.ENABLED),

    COLOR: hex(l.color, d.COLOR),
    CORE: hex(l.coreColor, d.CORE),
    SOCKET: hex(l.socketColor, d.SOCKET),
    GLOW: num(l.glow, d.GLOW),
    GAP: num(l.gap, d.GAP),
    SOCKET_SPAN: num(l.socketSpan, d.SOCKET_SPAN),
    // Never CMS-mapped. Measured: the smooth front cap ends at 0.50.
    FACE_RADIUS: d.FACE_RADIUS,

    SCANLINE_MAX: num(s.max, d.SCANLINE_MAX),
    SCANLINE_MIN_PX: num(s.minBodyPx, d.SCANLINE_MIN_PX),
    SCANLINE_RAMP: num(s.ramp, d.SCANLINE_RAMP),

    GLANCE_SECONDS: Math.max(0.01, num(b.glanceSeconds, d.GLANCE_SECONDS)),
    GLANCE_PEAK: frac(num(b.glancePeak, d.GLANCE_PEAK), d.GLANCE_PEAK),
    FACING_THRESHOLD: num(b.facingThreshold, d.FACING_THRESHOLD),
    CHARGE_CROSSOVER: frac(num(b.chargeCrossover, d.CHARGE_CROSSOVER), d.CHARGE_CROSSOVER),
    NO_REPEAT: bool(b.noRepeat, d.NO_REPEAT),

    WEIGHTS: weights,
  }
}

/** The inverse, for the dev bench's save-to-CMS button. */
export function toMascotEyesPayload(c: MascotEyesConfig): HeroEffectsEyesInput {
  return {
    mascotEyesEnabled: c.ENABLED,
    mascotEyesLook: {
      color: c.COLOR,
      coreColor: c.CORE,
      socketColor: c.SOCKET,
      glow: c.GLOW,
      gap: c.GAP,
      socketSpan: c.SOCKET_SPAN,
    },
    mascotEyesScanlines: {
      max: c.SCANLINE_MAX,
      minBodyPx: c.SCANLINE_MIN_PX,
      ramp: c.SCANLINE_RAMP,
    },
    mascotEyesBeat: {
      glanceSeconds: c.GLANCE_SECONDS,
      glancePeak: c.GLANCE_PEAK,
      facingThreshold: c.FACING_THRESHOLD,
      chargeCrossover: c.CHARGE_CROSSOVER,
      noRepeat: c.NO_REPEAT,
    },
    mascotEyesWeights: { ...c.WEIGHTS },
  }
}
