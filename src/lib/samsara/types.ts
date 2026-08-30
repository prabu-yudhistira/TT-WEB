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
   * The drop. ⚠️ Spec §5.6 — the far point is ~213px ABOVE the mark, and the
   * layer promotion may not fire until SAMSARA's box has cleared the logo's,
   * roughly 400px of descent. Too short a fall tries to promote while it is
   * still behind the mark and pops it in front in a single frame.
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
    // 1100, not the 800 first drafted: that value predated the far-point
    // geometry being worked out and is too short to clear the mark. See §5.6.
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
