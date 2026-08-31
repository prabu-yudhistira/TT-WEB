/**
 * SAMSARA transition — configuration.
 *
 * ⚠️ Unlike DEFAULT_MASCOT, these numbers are NOT owner-approved. They are
 * STARTING values, to be tuned live at /dev/samsara and frozen by the gate in
 * spec §9. No task downstream of that gate may treat them as approved.
 *
 * Spec: docs/superpowers/specs/2026-08-30-samsara-transition-design.md
 *
 * Note what is NOT here: TILT, TILT_SIDEWAY, PERSPECTIVE, and the mascot's own
 * RADIUS/HEIGHT/SIZE. The transit starts from wherever the SHIPPED orbit puts
 * SAMSARA, read through the same projectOrbit() the satellites use. Duplicating
 * those here would let the sequence's idea of the far point drift away from the
 * orbit's, which is precisely the defect that is obvious on screen and miserable
 * to chase in code.
 */

export type GesturesConfig = {
  /**
   * Total beats to reach the commit. 4 means three charge beats then the fall,
   * which is the owner's "scrolled down 3 times, then the 4th".
   */
  BEATS_TO_COMMIT: number
  /** Accumulated |deltaY| that constitutes one wheel gesture. */
  WHEEL_THRESHOLD: number
  /**
   * Minimum gap between beats. ⚠️ Must outlast a trackpad flick's momentum
   * tail — one flick emits 20–50 wheel events over a few hundred ms, and a
   * shorter cooldown lets a single flick fire the entire sequence.
   */
  COOLDOWN_MS: number
  /** The delta stream must be silent this long before the next beat can arm. */
  QUIET_MS: number
  /** Accumulated |deltaY| over touchmove that constitutes one swipe. */
  TOUCH_THRESHOLD: number
}

export type FreezeConfig = {
  /** Rigid page-shake amplitude in px, one entry per charge beat. */
  SHAKE_PX_PER_BEAT: number[]
  /** Shake frequency, Hz. */
  SHAKE_HZ: number
  /** Logo separation charge (0..1), one entry per charge beat. */
  CHARGE_PER_BEAT: number[]
}

export type TransitConfig = {
  /**
   * Time to ease from wherever SAMSARA is to the far point. FIXED, deliberately:
   * a duration that varied with the start angle would make every downstream beat
   * non-deterministic and untestable.
   */
  HALF_ORBIT_MS: number
  /**
   * The drop, from the far point to the first floor contact. Must remain the
   * longest phase of the transit, or the arc reads as a stutter rather than a
   * fall.
   */
  FALL_MS: number
  BOUNCE_COUNT: number
  /** Energy kept per bounce. Apex heights go h, e·h, e²·h. */
  RESTITUTION: number
  /** One duration per bounce, shortening. */
  BOUNCE_MS: number[]
  /** Rise from the last contact into the hover. */
  SETTLE_MS: number
}

export type LandingConfig = {
  /** Landed on-screen height as a fraction of viewport height. */
  SIZE_FRAC: number
  MOBILE_SIZE_FRAC: number
  /** Landed centre, as fractions of viewport width/height. */
  X_FRAC: number
  Y_FRAC: number
  /** Portrait: SAMSARA above, chatbox below it. */
  MOBILE_X_FRAC: number
  MOBILE_Y_FRAC: number
  /** Idle float once landed. */
  HOVER_BOB_PX: number
  HOVER_BOB_MS: number

  /**
   * The parked orientation in the room, in degrees — pitch, yaw, roll.
   *
   * Owner requirement: "samsara has to be parked on certain position that
   * suits the eyes of visitor/user." In the hero the orientation is whatever
   * SPIN_SPEED's clock happens to reach, which is fine for a body sweeping past
   * at 12.6-70px and useless for one parked at 40% of viewport height with a
   * face that is supposed to meet the visitor.
   *
   * 0/0/0 is frontal and level: the face is +Z in model space and only the yaw
   * turns it, so yaw 0 IS facing the viewer. Note this drops the orbit's
   * SPIN_TILT 12-degree roll at the landing, deliberately — the room's pose is
   * an explicit decision now, not an inheritance.
   */
  ROT_X_DEG: number
  ROT_Y_DEG: number
  ROT_Z_DEG: number
}

/**
 * Click-hold-drag to turn SAMSARA. Owner request.
 *
 * Two jobs at once, which is why it is config rather than a bench-only handle:
 * it is how the owner inspects the whole surface while tuning, AND it is a real
 * visitor interaction in the room, in the same spirit as the hero's
 * drag-to-spin on the mark.
 *
 * ⚠️ Landed only. Dragging a body that is still mid-bounce would fight the
 * scripted pose, and the transit is uninterruptible by design (spec §5.1).
 */
export type DragConfig = {
  ENABLED: boolean
  /** Degrees turned per pixel of pointer travel. */
  SENSITIVITY_DEG_PER_PX: number
  /**
   * How far off the parked pitch a drag may go, degrees. Clamped rather than
   * free: past vertical the yaw axis flips and the body reads as tumbling
   * rather than turning.
   */
  MAX_PITCH_DEG: number
  /**
   * Fraction of the flick's velocity still left one second after release.
   * 0 stops dead; the spin-down is what makes a flick feel like it has mass.
   */
  DAMPING: number
  /**
   * Stillness after release before it eases back to the parked pose.
   *
   * ⚠️ 0 means STAY WHERE PUT, which is the setting for inspecting a surface.
   * Non-zero is the setting for a live visitor, where the composition and the
   * eye contact have to reassert themselves after someone lets go.
   */
  RETURN_DELAY_MS: number
  RETURN_MS: number
}

export type RoomConfig = {
  BG_COLOR: string
  FLOOR_COLOR: string
  WALL_COLOR: string
  KEY_LIGHT_COLOR: string
  KEY_LIGHT_INTENSITY: number
  AMBIENT_INTENSITY: number
  FOG_DENSITY: number
  CAMERA_FOV_DEG: number
  /** Room depth in world units — how far back SAMSARA falls. */
  DEPTH: number

  /**
   * SAMSARA's own material, as it renders in the ROOM only (spec §6.3b's
   * follow-on). The hero's material is untouched at any strength here —
   * gated on mode !== 'orbit' in the engine — because at 12.6-70px it was
   * already validated and is "genuinely invisible" at that scale (§6.3b);
   * this problem is specific to rendering the same one-material mesh at
   * 360px, where it reads as polished chrome rather than the reference's
   * warm patinated brass with verdigris.
   *
   * ⚠️ Lighting alone cannot fix this. KEY_LIGHT_COLOR can push the colour
   * TEMPERATURE of what the material reflects, but the material's own
   * roughness/metalness — baked into the model's one shared texture, per
   * §6.3b — is what makes a hard specular highlight read as chrome instead
   * of the softer, more diffuse look of oxidised metal, and no light can
   * add a green-blue patina tint that is not in the surface colour at all.
   * This is a genuine material control, not another light.
   *
   * STARTING at a no-op (STRENGTH 0), deliberately, unlike most of this
   * file's other starting values: this is a NEW capability that did not
   * exist before, and its default must not silently reshade an
   * already-approved-elsewhere material out from under a session that
   * never asked for it. The owner turns it on.
   */
  MASCOT_TINT_COLOR: string
  /** 0 = the material's own baked colour, 1 = fully MASCOT_TINT_COLOR. */
  MASCOT_TINT_STRENGTH: number
  /** Added to the material's own baked roughness, clamped to [0, 1]. */
  MASCOT_ROUGHNESS_BOOST: number
}

export type IdleEyesConfig = {
  /**
   * Expression weights for the room's timed idle loop. Keys are expression
   * names from lib/mascot/eyes.ts. Spec §6.5: in the room SAMSARA is stationary
   * and front-facing, so expressions are scheduled on a clock rather than fired
   * as the face sweeps past the viewer.
   */
  WEIGHTS: Record<string, number>
  INTERVAL_MS: number
  /** Owner: "when smiling, samsara will be shaking up and down." */
  SMILE_SHAKE_PX: number
  SMILE_SHAKE_MS: number
}

export type ChatboxConfig = {
  /** From the start of the commit. Overlaps the settle. */
  DELAY_MS: number
  ENTER_MS: number
}

export type SequenceConfig = {
  ENABLED: boolean
  GESTURES: GesturesConfig
  FREEZE: FreezeConfig
  TRANSIT: TransitConfig
  LANDING: LandingConfig
  ROOM: RoomConfig
  DRAG: DragConfig
  IDLE_EYES: IdleEyesConfig
  CHATBOX: ChatboxConfig
  /** Scroll-up from the room: a quick exit, NOT a rewind of the fall. */
  EXIT_MS: number
}

export const DEFAULT_SEQUENCE: SequenceConfig = {
  ENABLED: true,

  GESTURES: {
    BEATS_TO_COMMIT: 4,
    WHEEL_THRESHOLD: 120,
    COOLDOWN_MS: 380,
    QUIET_MS: 120,
    TOUCH_THRESHOLD: 60,
  },

  FREEZE: {
    SHAKE_PX_PER_BEAT: [2, 3, 4],
    SHAKE_HZ: 14,
    CHARGE_PER_BEAT: [0.4, 0.7, 1],
  },

  TRANSIT: {
    HALF_ORBIT_MS: 600,
    // 1100 rather than the 800 first drafted. The original justification (that
    // SAMSARA had to descend ~400px behind the mark before the layer could be
    // promoted) was measured and found false, so this is now simply a starting
    // value for the bench like every other number here.
    FALL_MS: 1100,
    BOUNCE_COUNT: 3,
    RESTITUTION: 0.45,
    BOUNCE_MS: [500, 350, 250],
    SETTLE_MS: 500,
  },

  LANDING: {
    SIZE_FRAC: 0.4,
    MOBILE_SIZE_FRAC: 0.4,
    X_FRAC: 0.72,
    Y_FRAC: 0.52,
    MOBILE_X_FRAC: 0.5,
    MOBILE_Y_FRAC: 0.3,
    HOVER_BOB_PX: 8,
    HOVER_BOB_MS: 3200,

    // Frontal and level. The owner parks it for real at the bench.
    ROT_X_DEG: 0,
    ROT_Y_DEG: 0,
    ROT_Z_DEG: 0,
  },

  ROOM: {
    // Graphite on black — the Atelier drawing language inverted, so the dark
    // room belongs to a brand that deliberately dropped its dark appearance.
    // UPPERCASE hex throughout: the admin colour swatch writes back uppercase,
    // and a lowercase value here marks the form dirty just from loading it.
    BG_COLOR: '#08080A',
    FLOOR_COLOR: '#141416',
    WALL_COLOR: '#0E0E11',
    KEY_LIGHT_COLOR: '#FFF3D6',
    KEY_LIGHT_INTENSITY: 2.2,
    AMBIENT_INTENSITY: 0.25,
    FOG_DENSITY: 0.035,
    CAMERA_FOV_DEG: 45,
    DEPTH: 26,

    // Warm bronze-brass, picked to be in the right neighbourhood once
    // STRENGTH is raised — not tuned, since STRENGTH 0 makes it inert. Owner
    // reference: matte warm brass with green-blue verdigris in the recesses.
    MASCOT_TINT_COLOR: '#8A6A3A',
    MASCOT_TINT_STRENGTH: 0,
    MASCOT_ROUGHNESS_BOOST: 0,
  },

  DRAG: {
    ENABLED: true,
    SENSITIVITY_DEG_PER_PX: 0.5,
    MAX_PITCH_DEG: 75,
    DAMPING: 0.02,
    // Non-zero, because the shipped default is the VISITOR's setting: the room
    // is composed around a face that meets you, and it has to come back to that
    // on its own. Set to 0 at the bench to inspect the far side.
    RETURN_DELAY_MS: 2500,
    RETURN_MS: 900,
  },

  IDLE_EYES: {
    // Owner: "The eyes is normal then blink, sometimes smile."
    WEIGHTS: { neutral: 6, blink: 3, happy: 2 },
    INTERVAL_MS: 2400,
    SMILE_SHAKE_PX: 10,
    SMILE_SHAKE_MS: 620,
  },

  CHATBOX: {
    DELAY_MS: 2600,
    ENTER_MS: 400,
  },

  EXIT_MS: 800,
}
