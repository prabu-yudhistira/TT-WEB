import { DEFAULT_SEQUENCE, type SequenceConfig } from './types'

/**
 * The `samsara-sequence` global's shape, written by hand rather than imported
 * from payload-types so this module compiles before the fields exist and does
 * not break if the generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for anything never saved.
 *
 * ── What is deliberately NOT here ───────────────────────────────────
 *
 * `MASCOT_STRETCH_X/Y`. They are MEASURED properties of the mesh — the body is
 * not modelled as a sphere, and 1.12 on Y is what makes the silhouette match
 * what the modeller built — exactly like `FACE_RADIUS` and `SOCKET_SPAN_Y` on
 * the eyes. A form field inviting someone to change them could only ever
 * distort SAMSARA, and would do it on a page where the bench is not open to
 * see the result. They are tuned at /dev/samsara and frozen into types.ts.
 *
 * The room's vertex positions and camera matrices are absent for the same
 * reason (spec §7.4): tuning geometry blind in an admin form is not a workflow
 * anyone succeeds at.
 */
export type SamsaraSequenceInput = {
  sequenceEnabled?: boolean | null
  gestures?: {
    beatsToCommit?: number | null
    wheelThreshold?: number | null
    cooldownMs?: number | null
    quietMs?: number | null
    touchThreshold?: number | null
  } | null
  freeze?: {
    shakeHz?: number | null
    shakePxPerBeat?: Row[] | null
    chargePerBeat?: Row[] | null
  } | null
  transit?: {
    halfOrbitMs?: number | null
    fallMs?: number | null
    bounceCount?: number | null
    restitution?: number | null
    bounceMs?: Row[] | null
    settleMs?: number | null
  } | null
  landing?: {
    sizeFrac?: number | null
    mobileSizeFrac?: number | null
    xFrac?: number | null
    yFrac?: number | null
    mobileXFrac?: number | null
    mobileYFrac?: number | null
    hoverBobPx?: number | null
    hoverBobMs?: number | null
    rotXDeg?: number | null
    rotYDeg?: number | null
    rotZDeg?: number | null
  } | null
  room?: {
    bgColor?: string | null
    floorColor?: string | null
    wallColor?: string | null
    keyLightColor?: string | null
    keyLightIntensity?: number | null
    ambientIntensity?: number | null
    fogDensity?: number | null
    cameraFovDeg?: number | null
    depth?: number | null
    mascotTintColor?: string | null
    mascotTintStrength?: number | null
    mascotRoughnessBoost?: number | null
    envColor?: string | null
    envIntensity?: number | null
  } | null
  drag?: {
    enabled?: boolean | null
    sensitivityDegPerPx?: number | null
    maxPitchDeg?: number | null
    damping?: number | null
    returnDelayMs?: number | null
    returnMs?: number | null
  } | null
  idleEyes?: {
    intervalMs?: number | null
    smileShakePx?: number | null
    smileShakeMs?: number | null
    holdExpression?: string | null
    weights?: Record<string, number | null | undefined> | null
  } | null
  burst?: {
    enabled?: boolean | null
    intervalMs?: number | null
    count?: number | null
    seconds?: number | null
    speed?: number | null
    growth?: number | null
    swirl?: number | null
    drag?: number | null
    rise?: number | null
    spread?: number | null
    backOffset?: number | null
    size?: number | null
    opacity?: number | null
    glow?: number | null
    color?: string | null
    coreColor?: string | null
  } | null
  chatbox?: { delayMs?: number | null; enterMs?: number | null } | null
  exitMs?: number | null
}

/** Payload stores a list of numbers as rows, not as a bare array. */
type Row = { value?: number | null } | null

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: boolean | null | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

const hex = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v : fallback

/**
 * Rows -> numbers, always at the DEFAULT's length.
 *
 * ⚠️ The length is not negotiable and that is the point. The engine indexes
 * these per beat (`SHAKE_PX_PER_BEAT[i]`, `CHARGE_PER_BEAT[i]`) and per bounce
 * (`BOUNCE_MS[i]`); an editor who deletes a row in /admin would otherwise hand
 * it `undefined`, which multiplies into a NaN position and makes SAMSARA
 * disappear with nothing logged. A short list falls back per missing entry, a
 * long one is truncated.
 */
const rows = (v: Row[] | null | undefined, fallback: readonly number[]): number[] =>
  fallback.map((f, i) => num(Array.isArray(v) ? v[i]?.value : undefined, f))

export function resolveSamsara(
  cms: SamsaraSequenceInput | null | undefined,
): SequenceConfig {
  const d = DEFAULT_SEQUENCE
  const g = cms?.gestures ?? {}
  const f = cms?.freeze ?? {}
  const t = cms?.transit ?? {}
  const l = cms?.landing ?? {}
  const r = cms?.room ?? {}
  const dr = cms?.drag ?? {}
  const ie = cms?.idleEyes ?? {}
  const bu = cms?.burst ?? {}
  const c = cms?.chatbox ?? {}
  const w = ie?.weights ?? {}

  // A missing weight falls back to its default rather than to 0 — 0 would
  // silently drop that expression out of the room's idle loop, which reads as
  // a face that has stopped reacting rather than as a config mistake.
  const weights: Record<string, number> = {}
  for (const k of Object.keys(d.IDLE_EYES.WEIGHTS)) {
    weights[k] = Math.max(0, num(w?.[k], d.IDLE_EYES.WEIGHTS[k] ?? 0))
  }

  return {
    ENABLED: bool(cms?.sequenceEnabled, d.ENABLED),

    GESTURES: {
      // Rounded and floored at 1: the controller counts beats with `>=`, and a
      // fractional or zero threshold commits on the first notch, skipping the
      // freeze the whole sequence is built around.
      BEATS_TO_COMMIT: Math.max(1, Math.round(num(g.beatsToCommit, d.GESTURES.BEATS_TO_COMMIT))),
      WHEEL_THRESHOLD: num(g.wheelThreshold, d.GESTURES.WHEEL_THRESHOLD),
      COOLDOWN_MS: num(g.cooldownMs, d.GESTURES.COOLDOWN_MS),
      QUIET_MS: num(g.quietMs, d.GESTURES.QUIET_MS),
      TOUCH_THRESHOLD: num(g.touchThreshold, d.GESTURES.TOUCH_THRESHOLD),
    },

    FREEZE: {
      SHAKE_PX_PER_BEAT: rows(f.shakePxPerBeat, d.FREEZE.SHAKE_PX_PER_BEAT),
      SHAKE_HZ: num(f.shakeHz, d.FREEZE.SHAKE_HZ),
      CHARGE_PER_BEAT: rows(f.chargePerBeat, d.FREEZE.CHARGE_PER_BEAT),
    },

    TRANSIT: {
      HALF_ORBIT_MS: num(t.halfOrbitMs, d.TRANSIT.HALF_ORBIT_MS),
      FALL_MS: num(t.fallMs, d.TRANSIT.FALL_MS),
      BOUNCE_COUNT: Math.max(0, Math.round(num(t.bounceCount, d.TRANSIT.BOUNCE_COUNT))),
      RESTITUTION: num(t.restitution, d.TRANSIT.RESTITUTION),
      BOUNCE_MS: rows(t.bounceMs, d.TRANSIT.BOUNCE_MS),
      SETTLE_MS: num(t.settleMs, d.TRANSIT.SETTLE_MS),
    },

    LANDING: {
      SIZE_FRAC: num(l.sizeFrac, d.LANDING.SIZE_FRAC),
      MOBILE_SIZE_FRAC: num(l.mobileSizeFrac, d.LANDING.MOBILE_SIZE_FRAC),
      X_FRAC: num(l.xFrac, d.LANDING.X_FRAC),
      Y_FRAC: num(l.yFrac, d.LANDING.Y_FRAC),
      MOBILE_X_FRAC: num(l.mobileXFrac, d.LANDING.MOBILE_X_FRAC),
      MOBILE_Y_FRAC: num(l.mobileYFrac, d.LANDING.MOBILE_Y_FRAC),
      HOVER_BOB_PX: num(l.hoverBobPx, d.LANDING.HOVER_BOB_PX),
      HOVER_BOB_MS: num(l.hoverBobMs, d.LANDING.HOVER_BOB_MS),
      ROT_X_DEG: num(l.rotXDeg, d.LANDING.ROT_X_DEG),
      ROT_Y_DEG: num(l.rotYDeg, d.LANDING.ROT_Y_DEG),
      ROT_Z_DEG: num(l.rotZDeg, d.LANDING.ROT_Z_DEG),
    },

    ROOM: {
      BG_COLOR: hex(r.bgColor, d.ROOM.BG_COLOR),
      FLOOR_COLOR: hex(r.floorColor, d.ROOM.FLOOR_COLOR),
      WALL_COLOR: hex(r.wallColor, d.ROOM.WALL_COLOR),
      KEY_LIGHT_COLOR: hex(r.keyLightColor, d.ROOM.KEY_LIGHT_COLOR),
      KEY_LIGHT_INTENSITY: num(r.keyLightIntensity, d.ROOM.KEY_LIGHT_INTENSITY),
      AMBIENT_INTENSITY: num(r.ambientIntensity, d.ROOM.AMBIENT_INTENSITY),
      FOG_DENSITY: num(r.fogDensity, d.ROOM.FOG_DENSITY),
      CAMERA_FOV_DEG: num(r.cameraFovDeg, d.ROOM.CAMERA_FOV_DEG),
      DEPTH: num(r.depth, d.ROOM.DEPTH),
      MASCOT_TINT_COLOR: hex(r.mascotTintColor, d.ROOM.MASCOT_TINT_COLOR),
      MASCOT_TINT_STRENGTH: num(r.mascotTintStrength, d.ROOM.MASCOT_TINT_STRENGTH),
      MASCOT_ROUGHNESS_BOOST: num(r.mascotRoughnessBoost, d.ROOM.MASCOT_ROUGHNESS_BOOST),
      ENV_COLOR: hex(r.envColor, d.ROOM.ENV_COLOR),
      ENV_INTENSITY: num(r.envIntensity, d.ROOM.ENV_INTENSITY),
      // Never CMS-mapped. See the header: measured from the mesh, not taste.
      MASCOT_STRETCH_X: d.ROOM.MASCOT_STRETCH_X,
      MASCOT_STRETCH_Y: d.ROOM.MASCOT_STRETCH_Y,
    },

    DRAG: {
      ENABLED: bool(dr.enabled, d.DRAG.ENABLED),
      SENSITIVITY_DEG_PER_PX: num(dr.sensitivityDegPerPx, d.DRAG.SENSITIVITY_DEG_PER_PX),
      MAX_PITCH_DEG: num(dr.maxPitchDeg, d.DRAG.MAX_PITCH_DEG),
      DAMPING: num(dr.damping, d.DRAG.DAMPING),
      RETURN_DELAY_MS: num(dr.returnDelayMs, d.DRAG.RETURN_DELAY_MS),
      RETURN_MS: num(dr.returnMs, d.DRAG.RETURN_MS),
    },

    IDLE_EYES: {
      WEIGHTS: weights,
      INTERVAL_MS: num(ie.intervalMs, d.IDLE_EYES.INTERVAL_MS),
      SMILE_SHAKE_PX: num(ie.smileShakePx, d.IDLE_EYES.SMILE_SHAKE_PX),
      SMILE_SHAKE_MS: num(ie.smileShakeMs, d.IDLE_EYES.SMILE_SHAKE_MS),
      HOLD_EXPRESSION:
        typeof ie.holdExpression === 'string' && ie.holdExpression
          ? ie.holdExpression
          : d.IDLE_EYES.HOLD_EXPRESSION,
    },

    BURST: {
      ENABLED: bool(bu.enabled, d.BURST.ENABLED),
      // Floored well above 0: the interval is a divisor for the schedule, and
      // a 0 here would fire a burst every frame and flood the pool.
      INTERVAL_MS: Math.max(50, num(bu.intervalMs, d.BURST.INTERVAL_MS)),
      COUNT: Math.max(0, Math.round(num(bu.count, d.BURST.COUNT))),
      SECONDS: Math.max(0.05, num(bu.seconds, d.BURST.SECONDS)),
      SPEED: num(bu.speed, d.BURST.SPEED),
      DRAG: num(bu.drag, d.BURST.DRAG),
      RISE: num(bu.rise, d.BURST.RISE),
      GROWTH: num(bu.growth, d.BURST.GROWTH),
      SWIRL: num(bu.swirl, d.BURST.SWIRL),
      SPREAD: num(bu.spread, d.BURST.SPREAD),
      BACK_OFFSET: num(bu.backOffset, d.BURST.BACK_OFFSET),
      SIZE: num(bu.size, d.BURST.SIZE),
      OPACITY: num(bu.opacity, d.BURST.OPACITY),
      GLOW: num(bu.glow, d.BURST.GLOW),
      COLOR: hex(bu.color, d.BURST.COLOR),
      CORE_COLOR: hex(bu.coreColor, d.BURST.CORE_COLOR),
    },

    CHATBOX: {
      DELAY_MS: num(c.delayMs, d.CHATBOX.DELAY_MS),
      ENTER_MS: num(c.enterMs, d.CHATBOX.ENTER_MS),
    },

    EXIT_MS: num(cms?.exitMs, d.EXIT_MS),
  }
}

/** The inverse, for the seed and for the round-trip check. */
export function toSamsaraPayload(c: SequenceConfig): SamsaraSequenceInput {
  const list = (a: readonly number[]) => a.map((value) => ({ value }))
  return {
    sequenceEnabled: c.ENABLED,
    gestures: {
      beatsToCommit: c.GESTURES.BEATS_TO_COMMIT,
      wheelThreshold: c.GESTURES.WHEEL_THRESHOLD,
      cooldownMs: c.GESTURES.COOLDOWN_MS,
      quietMs: c.GESTURES.QUIET_MS,
      touchThreshold: c.GESTURES.TOUCH_THRESHOLD,
    },
    freeze: {
      shakeHz: c.FREEZE.SHAKE_HZ,
      shakePxPerBeat: list(c.FREEZE.SHAKE_PX_PER_BEAT),
      chargePerBeat: list(c.FREEZE.CHARGE_PER_BEAT),
    },
    transit: {
      halfOrbitMs: c.TRANSIT.HALF_ORBIT_MS,
      fallMs: c.TRANSIT.FALL_MS,
      bounceCount: c.TRANSIT.BOUNCE_COUNT,
      restitution: c.TRANSIT.RESTITUTION,
      bounceMs: list(c.TRANSIT.BOUNCE_MS),
      settleMs: c.TRANSIT.SETTLE_MS,
    },
    landing: {
      sizeFrac: c.LANDING.SIZE_FRAC,
      mobileSizeFrac: c.LANDING.MOBILE_SIZE_FRAC,
      xFrac: c.LANDING.X_FRAC,
      yFrac: c.LANDING.Y_FRAC,
      mobileXFrac: c.LANDING.MOBILE_X_FRAC,
      mobileYFrac: c.LANDING.MOBILE_Y_FRAC,
      hoverBobPx: c.LANDING.HOVER_BOB_PX,
      hoverBobMs: c.LANDING.HOVER_BOB_MS,
      rotXDeg: c.LANDING.ROT_X_DEG,
      rotYDeg: c.LANDING.ROT_Y_DEG,
      rotZDeg: c.LANDING.ROT_Z_DEG,
    },
    room: {
      bgColor: c.ROOM.BG_COLOR,
      floorColor: c.ROOM.FLOOR_COLOR,
      wallColor: c.ROOM.WALL_COLOR,
      keyLightColor: c.ROOM.KEY_LIGHT_COLOR,
      keyLightIntensity: c.ROOM.KEY_LIGHT_INTENSITY,
      ambientIntensity: c.ROOM.AMBIENT_INTENSITY,
      fogDensity: c.ROOM.FOG_DENSITY,
      cameraFovDeg: c.ROOM.CAMERA_FOV_DEG,
      depth: c.ROOM.DEPTH,
      mascotTintColor: c.ROOM.MASCOT_TINT_COLOR,
      mascotTintStrength: c.ROOM.MASCOT_TINT_STRENGTH,
      mascotRoughnessBoost: c.ROOM.MASCOT_ROUGHNESS_BOOST,
      envColor: c.ROOM.ENV_COLOR,
      envIntensity: c.ROOM.ENV_INTENSITY,
    },
    drag: {
      enabled: c.DRAG.ENABLED,
      sensitivityDegPerPx: c.DRAG.SENSITIVITY_DEG_PER_PX,
      maxPitchDeg: c.DRAG.MAX_PITCH_DEG,
      damping: c.DRAG.DAMPING,
      returnDelayMs: c.DRAG.RETURN_DELAY_MS,
      returnMs: c.DRAG.RETURN_MS,
    },
    idleEyes: {
      intervalMs: c.IDLE_EYES.INTERVAL_MS,
      smileShakePx: c.IDLE_EYES.SMILE_SHAKE_PX,
      smileShakeMs: c.IDLE_EYES.SMILE_SHAKE_MS,
      holdExpression: c.IDLE_EYES.HOLD_EXPRESSION,
      weights: { ...c.IDLE_EYES.WEIGHTS },
    },
    burst: {
      enabled: c.BURST.ENABLED,
      intervalMs: c.BURST.INTERVAL_MS,
      count: c.BURST.COUNT,
      seconds: c.BURST.SECONDS,
      speed: c.BURST.SPEED,
      growth: c.BURST.GROWTH,
      swirl: c.BURST.SWIRL,
      drag: c.BURST.DRAG,
      rise: c.BURST.RISE,
      spread: c.BURST.SPREAD,
      backOffset: c.BURST.BACK_OFFSET,
      size: c.BURST.SIZE,
      opacity: c.BURST.OPACITY,
      glow: c.BURST.GLOW,
      color: c.BURST.COLOR,
      coreColor: c.BURST.CORE_COLOR,
    },
    chatbox: { delayMs: c.CHATBOX.DELAY_MS, enterMs: c.CHATBOX.ENTER_MS },
    exitMs: c.EXIT_MS,
  }
}
