/**
 * Hero mascot — the tunable surface of the animated LED face display.
 *
 * ⚠️ THROWAWAY, like eyes.ts itself. This exists so the owner can tune the eyes
 * on screen at /dev/mascot BEFORE a spec is written, the same inversion that
 * produced the satellites and the mascot. The approved numbers come back out of
 * here as JSON and become the spec; the shipped implementation is then written
 * against that spec, and this file goes away.
 *
 * ── Why this is NOT part of MascotConfig ──────────────────────────────
 * MascotConfig / DEFAULT_MASCOT is the frozen, owner-approved orbit + look
 * configuration, pinned field by field by types.check.ts and mapped to 33 CMS
 * columns. Adding eye fields there would disturb a config that is already
 * settled and already asserted, and would commit the CMS shape before the spec
 * has decided what it should be. Keeping the eye surface separate leaves all of
 * that untouched and lets the spec choose the eventual grouping freely.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────
 * Inspect-mode values (park angle, blown-up size). Those are a way of LOOKING at
 * the mascot, not values the mascot ships with — mixing them in would put
 * bench-only numbers into the JSON that becomes the spec. They live on the
 * engine's setInspect() instead.
 */

import { EXPRESSIONS, type EyeShape } from './eyes'

/** Stable order for the bench's expression picker. */
export const EXPRESSION_ORDER = Object.keys(EXPRESSIONS)

export type TunedExpression = {
  left: EyeShape
  /** null = mirror `left`, which is what all but `wink` do today. */
  right: EyeShape | null
}

export type EyeTuning = {
  // ── look ────────────────────────────────────────────────────────────
  /** Body of the lit blob. Amber, not the reference video's cyan — see eyes.ts. */
  COLOR: string
  /** Hot centre of the blob. */
  CORE: string
  /** Darkening laid over the cap so the PAINTED amber ovals do not show through. */
  SOCKET: string
  GLOW: number
  /** Half-distance between the two eyes, in display units. */
  GAP: number
  /** How far past the display radius the socket darkening reaches. */
  SOCKET_SPAN: number
  /**
   * ⚠️ MEASURED, not taste: the mascot's smooth front cap ends at 0.50 model
   * units and the ornamental bezel relief begins. Exposed so the mask can be
   * checked on screen, but moving it off 0.50 means the display either stops
   * short of the face or bleeds onto the bezel.
   */
  FACE_RADIUS: number

  // ── scanlines ───────────────────────────────────────────────────────
  /** Line count at full strength. */
  SCANLINE_MAX: number
  /** Body diameter (px) below which scanlines are off — 7 lines over an 18px eye is moire. */
  SCANLINE_MIN_PX: number
  /** px of body diameter per additional line, above the gate. */
  SCANLINE_RAMP: number

  // ── the beat ────────────────────────────────────────────────────────
  /** How long one glance takes, start to resolved. */
  GLANCE_SECONDS: number
  /** Where in the glance the expression peaks, 0..1. */
  GLANCE_PEAK: number
  /** cos(spin) above which the face counts as turned toward the viewer. */
  FACING_THRESHOLD: number
  /** Charge at which the press-and-hold reaction crosses from wide to squeezed shut. */
  CHARGE_CROSSOVER: number
  /** Never play the same expression two passes running. */
  NO_REPEAT: boolean

  // ── per expression ──────────────────────────────────────────────────
  shapes: Record<string, TunedExpression>
  /** Relative frequency in the glance pool. 0 removes it from the pool entirely. */
  weights: Record<string, number>
}

/**
 * The values currently on screen, so switching the bench on changes nothing.
 * Every number here is a PROTOTYPE value, not owner-approved — that is the whole
 * point of the exercise this file serves.
 *
 * Shapes are read straight out of EXPRESSIONS; the uniforms mirror
 * MascotEngine's own eyeUniforms; the beat mirrors updateEyes()'s constants; the
 * weights reproduce the old duplicate-entry GLANCE_POOL (blink and happy twice,
 * everything else once, neutral and wide never — neutral is the rest state and
 * wide belongs to the charge reaction).
 */
export const DEFAULT_EYE_TUNING: EyeTuning = {
  COLOR: '#F2A81C',
  CORE: '#FFF0BE',
  SOCKET: '#06080B',
  GLOW: 0.55,
  GAP: 0.38,
  SOCKET_SPAN: 1.34,
  FACE_RADIUS: 0.5,

  SCANLINE_MAX: 9,
  SCANLINE_MIN_PX: 44,
  SCANLINE_RAMP: 12,

  GLANCE_SECONDS: 0.6,
  GLANCE_PEAK: 0.45,
  FACING_THRESHOLD: 0.3,
  CHARGE_CROSSOVER: 0.7,
  NO_REPEAT: false,

  shapes: Object.fromEntries(
    EXPRESSION_ORDER.map((k) => [
      k,
      { left: { ...EXPRESSIONS[k].left }, right: EXPRESSIONS[k].right ? { ...EXPRESSIONS[k].right } : null },
    ]),
  ),
  weights: {
    neutral: 0,
    blink: 2,
    squint: 1,
    happy: 2,
    wide: 0,
    lookLeft: 1,
    lookRight: 1,
    lookUp: 1,
    lookDown: 1,
    lookUpLeft: 1,
    lookUpRight: 1,
    lookDownLeft: 1,
    lookDownRight: 1,
    wink: 1,
  },
}

/** A deep-enough clone that editing one expression cannot alias another. */
export const cloneEyeTuning = (t: EyeTuning): EyeTuning => ({
  ...t,
  shapes: Object.fromEntries(
    Object.entries(t.shapes).map(([k, v]) => [
      k,
      { left: { ...v.left }, right: v.right ? { ...v.right } : null },
    ]),
  ),
  weights: { ...t.weights },
})

/**
 * Picks an expression by weight.
 *
 * `avoid` implements NO_REPEAT: it is dropped from the running total rather
 * than re-rolled, so a pool whose only positive weight IS the avoided entry
 * still returns something instead of spinning. Returns null when nothing is
 * eligible, which the caller reads as "play no glance this pass" — a pool the
 * owner has zeroed out entirely should leave the face at rest, not fall back to
 * an expression they removed on purpose.
 */
export function pickWeighted(
  weights: Record<string, number>,
  rand: number,
  avoid?: string | null,
): string | null {
  let total = 0
  for (const k of EXPRESSION_ORDER) {
    if (k === avoid) continue
    total += Math.max(0, weights[k] ?? 0)
  }
  if (total <= 0) return null
  let r = rand * total
  for (const k of EXPRESSION_ORDER) {
    if (k === avoid) continue
    r -= Math.max(0, weights[k] ?? 0)
    if (r <= 0) return k
  }
  return null
}
