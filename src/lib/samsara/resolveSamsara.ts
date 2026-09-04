import {
  DEFAULT_SEQUENCE,
  type OrbRotConfig,
  type ShaftSlotConfig,
  type OrbSlotConfig,
  type SequenceConfig,
} from './types'

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
    extent?: number | null
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
  emitters?: {
    sizeFrac?: number | null
    mobileSizeFrac?: number | null
    near?: OrbSlotCms
    far?: OrbSlotCms
    mobileNear?: OrbSlotCms
    mobileFar?: OrbSlotCms
    portX?: number | null
    portY?: number | null
    portZ?: number | null
    lensX?: number | null
    lensY?: number | null
    lensZ?: number | null
    showPorts?: boolean | null
    nearRot?: OrbRotCms
    farRot?: OrbRotCms
    entryMs?: number | null
    entryStaggerMs?: number | null
    bobAmp?: number | null
    bobMs?: number | null
    thrustRate?: number | null
    thrustSpread?: number | null
    plumeOut?: number | null
    plumeY?: number | null
    puffSize?: number | null
    puffLifeMs?: number | null
    puffColor?: string | null
    puffOpacity?: number | null
  } | null
  exhaust?: {
    enabled?: boolean | null
    portX?: number | null
    portY?: number | null
    portZ?: number | null
    dirX?: number | null
    dirY?: number | null
    dirZ?: number | null
    rate?: number | null
    spread?: number | null
    puffSize?: number | null
    puffLifeMs?: number | null
    puffColor?: string | null
    puffOpacity?: number | null
  } | null
  hologram?: {
    wFrac?: number | null
    panelAspect?: number | null
    xFrac?: number | null
    yFrac?: number | null
    mobileWFrac?: number | null
    mobileXFrac?: number | null
    mobileYFrac?: number | null
    formMs?: number | null
    flickerMs?: number | null
    flickerDurMs?: number | null
    flickerDepth?: number | null
    glassColor?: string | null
    glassOpacity?: number | null
    shaftColor?: string | null
    shaftOpacity?: number | null
    shaftSpread?: number | null
    shaftHalfDeg?: number | null
    shaftGuide?: boolean | null
    shaftReach?: number | null
    shaftRays?: number | null
    shaftSpeed?: number | null
    shaftFade?: number | null
    shaftContrast?: number | null
    shaftBound?: number | null
    shaftCore?: number | null
    shaftTip?: number | null
    shaftCoreColor?: string | null
    shaftCoreSpan?: number | null
    nearShaft?: ShaftSlotCms
    farShaft?: ShaftSlotCms
  } | null
  exitMs?: number | null
}

type OrbRotCms = { xDeg?: number | null; yDeg?: number | null; zDeg?: number | null } | null
type ShaftSlotCms = {
  dx?: number | null
  dy?: number | null
  angleDeg?: number | null
  spread?: number | null
  reach?: number | null
} | null

type OrbSlotCms = {
  xFrac?: number | null
  yFrac?: number | null
  depthFrac?: number | null
} | null

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
  const em = cms?.emitters ?? {}
  const ex = cms?.exhaust ?? {}
  const ho = cms?.hologram ?? {}
  const w = ie?.weights ?? {}

  /** One orb slot, falling back field-by-field like every other group here. */
  const slot = (v: OrbSlotCms | undefined, d0: OrbSlotConfig): OrbSlotConfig => ({
    X_FRAC: num(v?.xFrac, d0.X_FRAC),
    Y_FRAC: num(v?.yFrac, d0.Y_FRAC),
    DEPTH_FRAC: num(v?.depthFrac, d0.DEPTH_FRAC),
  })

  /** One orb's parked orientation. Degrees, falling back field by field. */
  const shaftSlot = (v: ShaftSlotCms | undefined, d0: ShaftSlotConfig): ShaftSlotConfig => ({
    DX: num(v?.dx, d0.DX),
    DY: num(v?.dy, d0.DY),
    ANGLE_DEG: num(v?.angleDeg, d0.ANGLE_DEG),
    SPREAD: num(v?.spread, d0.SPREAD),
    REACH: num(v?.reach, d0.REACH),
  })

  const rot = (v: OrbRotCms | undefined, d0: OrbRotConfig): OrbRotConfig => ({
    X_DEG: num(v?.xDeg, d0.X_DEG),
    Y_DEG: num(v?.yDeg, d0.Y_DEG),
    Z_DEG: num(v?.zDeg, d0.Z_DEG),
  })

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
      EXTENT: num(r.extent, d.ROOM.EXTENT),
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

    EMITTERS: {
      SIZE_FRAC: num(em.sizeFrac, d.EMITTERS.SIZE_FRAC),
      MOBILE_SIZE_FRAC: num(em.mobileSizeFrac, d.EMITTERS.MOBILE_SIZE_FRAC),
      NEAR: slot(em.near, d.EMITTERS.NEAR),
      FAR: slot(em.far, d.EMITTERS.FAR),
      MOBILE_NEAR: slot(em.mobileNear, d.EMITTERS.MOBILE_NEAR),
      MOBILE_FAR: slot(em.mobileFar, d.EMITTERS.MOBILE_FAR),
      PORT_X: num(em.portX, d.EMITTERS.PORT_X),
      PORT_Y: num(em.portY, d.EMITTERS.PORT_Y),
      PORT_Z: num(em.portZ, d.EMITTERS.PORT_Z),
      LENS_X: num(em.lensX, d.EMITTERS.LENS_X),
      LENS_Y: num(em.lensY, d.EMITTERS.LENS_Y),
      LENS_Z: num(em.lensZ, d.EMITTERS.LENS_Z),
      SHOW_PORTS: bool(em.showPorts, d.EMITTERS.SHOW_PORTS),
      NEAR_ROT: rot(em.nearRot, d.EMITTERS.NEAR_ROT),
      FAR_ROT: rot(em.farRot, d.EMITTERS.FAR_ROT),
      ENTRY_MS: num(em.entryMs, d.EMITTERS.ENTRY_MS),
      ENTRY_STAGGER_MS: num(em.entryStaggerMs, d.EMITTERS.ENTRY_STAGGER_MS),
      BOB_AMP: num(em.bobAmp, d.EMITTERS.BOB_AMP),
      BOB_MS: num(em.bobMs, d.EMITTERS.BOB_MS),
      THRUST_RATE: num(em.thrustRate, d.EMITTERS.THRUST_RATE),
      THRUST_SPREAD: num(em.thrustSpread, d.EMITTERS.THRUST_SPREAD),
      PLUME_OUT: num(em.plumeOut, d.EMITTERS.PLUME_OUT),
      PLUME_Y: num(em.plumeY, d.EMITTERS.PLUME_Y),
      PUFF_SIZE: num(em.puffSize, d.EMITTERS.PUFF_SIZE),
      PUFF_LIFE_MS: num(em.puffLifeMs, d.EMITTERS.PUFF_LIFE_MS),
      PUFF_COLOR: hex(em.puffColor, d.EMITTERS.PUFF_COLOR),
      PUFF_OPACITY: num(em.puffOpacity, d.EMITTERS.PUFF_OPACITY),
    },

    EXHAUST: {
      ENABLED: bool(ex.enabled, d.EXHAUST.ENABLED),
      PORT_X: num(ex.portX, d.EXHAUST.PORT_X),
      PORT_Y: num(ex.portY, d.EXHAUST.PORT_Y),
      PORT_Z: num(ex.portZ, d.EXHAUST.PORT_Z),
      DIR_X: num(ex.dirX, d.EXHAUST.DIR_X),
      DIR_Y: num(ex.dirY, d.EXHAUST.DIR_Y),
      DIR_Z: num(ex.dirZ, d.EXHAUST.DIR_Z),
      RATE: num(ex.rate, d.EXHAUST.RATE),
      SPREAD: num(ex.spread, d.EXHAUST.SPREAD),
      PUFF_SIZE: num(ex.puffSize, d.EXHAUST.PUFF_SIZE),
      PUFF_LIFE_MS: num(ex.puffLifeMs, d.EXHAUST.PUFF_LIFE_MS),
      PUFF_COLOR: hex(ex.puffColor, d.EXHAUST.PUFF_COLOR),
      PUFF_OPACITY: num(ex.puffOpacity, d.EXHAUST.PUFF_OPACITY),
    },

    HOLOGRAM: {
      W_FRAC: num(ho.wFrac, d.HOLOGRAM.W_FRAC),
      PANEL_ASPECT: num(ho.panelAspect, d.HOLOGRAM.PANEL_ASPECT),
      X_FRAC: num(ho.xFrac, d.HOLOGRAM.X_FRAC),
      Y_FRAC: num(ho.yFrac, d.HOLOGRAM.Y_FRAC),
      MOBILE_W_FRAC: num(ho.mobileWFrac, d.HOLOGRAM.MOBILE_W_FRAC),
      MOBILE_X_FRAC: num(ho.mobileXFrac, d.HOLOGRAM.MOBILE_X_FRAC),
      MOBILE_Y_FRAC: num(ho.mobileYFrac, d.HOLOGRAM.MOBILE_Y_FRAC),
      FORM_MS: num(ho.formMs, d.HOLOGRAM.FORM_MS),
      FLICKER_MS: num(ho.flickerMs, d.HOLOGRAM.FLICKER_MS),
      FLICKER_DUR_MS: num(ho.flickerDurMs, d.HOLOGRAM.FLICKER_DUR_MS),
      FLICKER_DEPTH: num(ho.flickerDepth, d.HOLOGRAM.FLICKER_DEPTH),
      GLASS_COLOR: hex(ho.glassColor, d.HOLOGRAM.GLASS_COLOR),
      GLASS_OPACITY: num(ho.glassOpacity, d.HOLOGRAM.GLASS_OPACITY),
      SHAFT_COLOR: hex(ho.shaftColor, d.HOLOGRAM.SHAFT_COLOR),
      SHAFT_OPACITY: num(ho.shaftOpacity, d.HOLOGRAM.SHAFT_OPACITY),
      SHAFT_SPREAD: num(ho.shaftSpread, d.HOLOGRAM.SHAFT_SPREAD),
      SHAFT_HALF_DEG: num(ho.shaftHalfDeg, d.HOLOGRAM.SHAFT_HALF_DEG),
      SHAFT_GUIDE: bool(ho.shaftGuide, d.HOLOGRAM.SHAFT_GUIDE),
      SHAFT_REACH: num(ho.shaftReach, d.HOLOGRAM.SHAFT_REACH),
      SHAFT_RAYS: num(ho.shaftRays, d.HOLOGRAM.SHAFT_RAYS),
      SHAFT_SPEED: num(ho.shaftSpeed, d.HOLOGRAM.SHAFT_SPEED),
      SHAFT_FADE: num(ho.shaftFade, d.HOLOGRAM.SHAFT_FADE),
      SHAFT_CONTRAST: num(ho.shaftContrast, d.HOLOGRAM.SHAFT_CONTRAST),
      SHAFT_BOUND: num(ho.shaftBound, d.HOLOGRAM.SHAFT_BOUND),
      SHAFT_CORE: num(ho.shaftCore, d.HOLOGRAM.SHAFT_CORE),
      SHAFT_TIP: num(ho.shaftTip, d.HOLOGRAM.SHAFT_TIP),
      SHAFT_CORE_COLOR: hex(ho.shaftCoreColor, d.HOLOGRAM.SHAFT_CORE_COLOR),
      SHAFT_CORE_SPAN: num(ho.shaftCoreSpan, d.HOLOGRAM.SHAFT_CORE_SPAN),
      NEAR_SHAFT: shaftSlot(ho.nearShaft, d.HOLOGRAM.NEAR_SHAFT),
      FAR_SHAFT: shaftSlot(ho.farShaft, d.HOLOGRAM.FAR_SHAFT),
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
      extent: c.ROOM.EXTENT,
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
    emitters: {
      sizeFrac: c.EMITTERS.SIZE_FRAC,
      mobileSizeFrac: c.EMITTERS.MOBILE_SIZE_FRAC,
      near: { xFrac: c.EMITTERS.NEAR.X_FRAC, yFrac: c.EMITTERS.NEAR.Y_FRAC, depthFrac: c.EMITTERS.NEAR.DEPTH_FRAC },
      far: { xFrac: c.EMITTERS.FAR.X_FRAC, yFrac: c.EMITTERS.FAR.Y_FRAC, depthFrac: c.EMITTERS.FAR.DEPTH_FRAC },
      mobileNear: { xFrac: c.EMITTERS.MOBILE_NEAR.X_FRAC, yFrac: c.EMITTERS.MOBILE_NEAR.Y_FRAC, depthFrac: c.EMITTERS.MOBILE_NEAR.DEPTH_FRAC },
      mobileFar: { xFrac: c.EMITTERS.MOBILE_FAR.X_FRAC, yFrac: c.EMITTERS.MOBILE_FAR.Y_FRAC, depthFrac: c.EMITTERS.MOBILE_FAR.DEPTH_FRAC },
      portX: c.EMITTERS.PORT_X,
      portY: c.EMITTERS.PORT_Y,
      portZ: c.EMITTERS.PORT_Z,
      lensX: c.EMITTERS.LENS_X,
      lensY: c.EMITTERS.LENS_Y,
      lensZ: c.EMITTERS.LENS_Z,
      showPorts: c.EMITTERS.SHOW_PORTS,
      nearRot: { xDeg: c.EMITTERS.NEAR_ROT.X_DEG, yDeg: c.EMITTERS.NEAR_ROT.Y_DEG, zDeg: c.EMITTERS.NEAR_ROT.Z_DEG },
      farRot: { xDeg: c.EMITTERS.FAR_ROT.X_DEG, yDeg: c.EMITTERS.FAR_ROT.Y_DEG, zDeg: c.EMITTERS.FAR_ROT.Z_DEG },
      entryMs: c.EMITTERS.ENTRY_MS,
      entryStaggerMs: c.EMITTERS.ENTRY_STAGGER_MS,
      bobAmp: c.EMITTERS.BOB_AMP,
      bobMs: c.EMITTERS.BOB_MS,
      thrustRate: c.EMITTERS.THRUST_RATE,
      thrustSpread: c.EMITTERS.THRUST_SPREAD,
      plumeOut: c.EMITTERS.PLUME_OUT,
      plumeY: c.EMITTERS.PLUME_Y,
      puffSize: c.EMITTERS.PUFF_SIZE,
      puffLifeMs: c.EMITTERS.PUFF_LIFE_MS,
      puffColor: c.EMITTERS.PUFF_COLOR,
      puffOpacity: c.EMITTERS.PUFF_OPACITY,
    },
    exhaust: {
      enabled: c.EXHAUST.ENABLED,
      portX: c.EXHAUST.PORT_X,
      portY: c.EXHAUST.PORT_Y,
      portZ: c.EXHAUST.PORT_Z,
      dirX: c.EXHAUST.DIR_X,
      dirY: c.EXHAUST.DIR_Y,
      dirZ: c.EXHAUST.DIR_Z,
      rate: c.EXHAUST.RATE,
      spread: c.EXHAUST.SPREAD,
      puffSize: c.EXHAUST.PUFF_SIZE,
      puffLifeMs: c.EXHAUST.PUFF_LIFE_MS,
      puffColor: c.EXHAUST.PUFF_COLOR,
      puffOpacity: c.EXHAUST.PUFF_OPACITY,
    },
    hologram: {
      wFrac: c.HOLOGRAM.W_FRAC,
      panelAspect: c.HOLOGRAM.PANEL_ASPECT,
      xFrac: c.HOLOGRAM.X_FRAC,
      yFrac: c.HOLOGRAM.Y_FRAC,
      mobileWFrac: c.HOLOGRAM.MOBILE_W_FRAC,
      mobileXFrac: c.HOLOGRAM.MOBILE_X_FRAC,
      mobileYFrac: c.HOLOGRAM.MOBILE_Y_FRAC,
      formMs: c.HOLOGRAM.FORM_MS,
      flickerMs: c.HOLOGRAM.FLICKER_MS,
      flickerDurMs: c.HOLOGRAM.FLICKER_DUR_MS,
      flickerDepth: c.HOLOGRAM.FLICKER_DEPTH,
      glassColor: c.HOLOGRAM.GLASS_COLOR,
      glassOpacity: c.HOLOGRAM.GLASS_OPACITY,
      shaftColor: c.HOLOGRAM.SHAFT_COLOR,
      shaftOpacity: c.HOLOGRAM.SHAFT_OPACITY,
      shaftSpread: c.HOLOGRAM.SHAFT_SPREAD,
      shaftHalfDeg: c.HOLOGRAM.SHAFT_HALF_DEG,
      shaftGuide: c.HOLOGRAM.SHAFT_GUIDE,
      shaftReach: c.HOLOGRAM.SHAFT_REACH,
      shaftRays: c.HOLOGRAM.SHAFT_RAYS,
      shaftSpeed: c.HOLOGRAM.SHAFT_SPEED,
      shaftFade: c.HOLOGRAM.SHAFT_FADE,
      shaftContrast: c.HOLOGRAM.SHAFT_CONTRAST,
      shaftBound: c.HOLOGRAM.SHAFT_BOUND,
      shaftCore: c.HOLOGRAM.SHAFT_CORE,
      shaftTip: c.HOLOGRAM.SHAFT_TIP,
      shaftCoreColor: c.HOLOGRAM.SHAFT_CORE_COLOR,
      shaftCoreSpan: c.HOLOGRAM.SHAFT_CORE_SPAN,
      nearShaft: {
        dx: c.HOLOGRAM.NEAR_SHAFT.DX,
        dy: c.HOLOGRAM.NEAR_SHAFT.DY,
        angleDeg: c.HOLOGRAM.NEAR_SHAFT.ANGLE_DEG,
        spread: c.HOLOGRAM.NEAR_SHAFT.SPREAD,
        reach: c.HOLOGRAM.NEAR_SHAFT.REACH,
      },
      farShaft: {
        dx: c.HOLOGRAM.FAR_SHAFT.DX,
        dy: c.HOLOGRAM.FAR_SHAFT.DY,
        angleDeg: c.HOLOGRAM.FAR_SHAFT.ANGLE_DEG,
        spread: c.HOLOGRAM.FAR_SHAFT.SPREAD,
        reach: c.HOLOGRAM.FAR_SHAFT.REACH,
      },
    },
    exitMs: c.EXIT_MS,
  }
}
