/**
 * SAMSARA transition — configuration.
 *
 * Owner-approved on screen at /dev/samsara and frozen here from that session's
 * `copy json` — 2026-08-31, revised 2026-09-04 (room, landing and burst). Pinned value-by-value by types.check.ts, so a
 * later edit is a deliberate act with the owner in the loop rather than a
 * silent diff — the same treatment DEFAULT_MASCOT and DEFAULT_MASCOT_EYES get.
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
  /** Portrait: SAMSARA sits high; Section 2 content goes below it. */
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
   * How far the floor and walls extend past the framed volume. 1 = they end
   * exactly at the frame edge; larger pushes them out of shot.
   *
   * ⚠️ This exists because DEPTH cannot do it. The camera is solved so that
   * `DEPTH * ROOM_HEIGHT_FACTOR` exactly fills the viewport height, so scaling
   * DEPTH pulls the camera back by the same factor and the image is
   * PIXEL-IDENTICAL. DEPTH is the world-unit scale, not the apparent size, and
   * the slider looks like it should widen the room but cannot.
   *
   * ⚠️ It also deliberately does NOT touch ROOM_HEIGHT_FACTOR, which is the
   * camera's framing reference — raising that reframes the whole composition
   * instead of enlarging the surfaces inside it. Separating "how the camera
   * frames the space" from "how big the surfaces are" is the entire point of
   * this value.
   *
   * The key light's reach is unchanged, so at a large extent the surfaces fall
   * off into darkness well before their edges — which is what produces
   * unbounded space rather than a visibly bigger box.
   */
  EXTENT: number

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

  /**
   * The environment SAMSARA REFLECTS in the room, and its strength.
   *
   * ⚠️ For this model this is the dominant control on how the metal reads, and
   * it is not a light. The material is `metallic: 1` and a pure metal has no
   * diffuse term — what you see is almost entirely what it reflects. three.js's
   * default studio environment is neutral white, so a copper body lit by it
   * comes back GREY and reads as polished chrome. No light intensity fixes
   * that; the reflected COLOUR has to change.
   *
   * Room-only. The hero's orbit keeps the neutral environment it was approved
   * under, where the body is 12.6-70px and its hue is not the point.
   */
  ENV_COLOR: string
  ENV_INTENSITY: number

  /**
   * Non-uniform scale on SAMSARA's body in the room. 1/1 is the mesh as
   * modelled.
   *
   * ⚠️ The renderer is NOT distorting the model, and this exists to override
   * the mesh rather than to correct a bug. MEASURED face-on: the silhouette
   * renders 785x745 (1.0537) against the source mesh's own 2.00 x 1.91
   * (1.0471) — within 0.6%, which is the eye glow bleeding horizontally. The
   * body simply IS about 4.7% wider than it is tall.
   *
   * So `STRETCH_X` 0.955 makes it a true circle. Left at 1 by default, because
   * "as modelled" is the honest starting point and squashing the mesh is a
   * decision, not a fix.
   *
   * Room-only, like the rest of the mascot material block: at the hero's
   * 12.6-70px nobody is measuring its roundness.
   */
  MASCOT_STRETCH_X: number
  MASCOT_STRETCH_Y: number
}

export type IdleEyesConfig = {
  /**
   * Expression weights for the room's timed idle loop. Keys are expression
   * names from lib/mascot/eyes.ts. Spec §6.5: in the room SAMSARA is stationary
   * and front-facing, so expressions are scheduled on a clock rather than fired
   * as the face sweeps past the viewer.
   *
   * ⚠️ That clock is not a nicety. The orbit fires a glance on the RISING EDGE
   * of the face turning toward the viewer — and once the spin is parked that
   * edge never comes again, so a parked SAMSARA plays exactly one expression
   * and then rests on neutral forever. The room needs its own scheduler or it
   * has no expressions at all.
   */
  WEIGHTS: Record<string, number>
  INTERVAL_MS: number
  /**
   * Owner: "when smiling, samsara will be shaking up and down."
   *
   * Governs BOTH bobs, which are two different shapes of the same motion: a
   * decaying one when a smile comes up on its own, and a continuous loop of the
   * same amplitude and period while a visitor is holding it. SMILE_SHAKE_MS is
   * the decay length in the first case and the loop period in the second.
   */
  SMILE_SHAKE_PX: number
  SMILE_SHAKE_MS: number

  /**
   * Expression held while a visitor presses and holds SAMSARA in the room.
   * Owner: "click&hold will make it laugh/smile until click is released."
   *
   * Empty string disables it, which is the setting for inspecting the resting
   * face — otherwise SAMSARA grins at you the entire time you are turning it.
   *
   * ⚠️ Deliberately does NOT wait for a press-vs-drag threshold the way the
   * mark's hold-to-separate does. Two reasons: the owner asked for hold, not for
   * hold-without-moving; and a smile that appeared only if your hand was steady
   * enough would read as a bug rather than as a rule. So SAMSARA is happy for as
   * long as you are touching it, whether or not you also turn it.
   */
  HOLD_EXPRESSION: string
}

/**
 * Golden SMOKE, puffed from behind the parked mascot on a timer.
 *
 * Owner requirement 2026-09-02: bursts from behind SAMSARA every 4 seconds,
 * revised the same day from dust to smoke.
 *
 * ⚠️ Smoke and dust are not a colour change, they are different physics, and
 * the defaults below encode that. Dust is many small hard grains that fly out
 * and SHRINK; smoke is a few large soft puffs that drift slowly, EXPAND as they
 * dissipate, curl on the way, and read as volume only because they are faint
 * enough to layer over one another. Turning SIZE up on a dust preset gives big
 * hard discs, not smoke — GROWTH, SWIRL and a low OPACITY are what carry it.
 *
 * ⚠️ Distances are in BODY RADII, not pixels and not world units. The room
 * scales SAMSARA by LANDING.SIZE_FRAC of the viewport, so a burst measured in
 * pixels would be a halo on a laptop and a speck on a large display. See
 * ./roomBurst.ts.
 */
export type BurstConfig = {
  ENABLED: boolean
  /** Between bursts. The owner asked for 4 seconds. */
  INTERVAL_MS: number
  /** Motes per burst. */
  COUNT: number
  /** How long one mote lives, before the per-mote 0.7-1.3 spread. */
  SECONDS: number
  /** Outward speed, in body radii per second. */
  SPEED: number
  /**
   * Final size as a multiple of birth size. >1 expands as it fades, which is
   * the single strongest smoke cue; 1 holds a constant disc, <1 shrinks to a
   * grain and reads as dust again.
   */
  GROWTH: number
  /**
   * Lateral curl, in body radii per second. Each puff drifts on its own slow
   * sine, so the cloud folds instead of expanding as a clean sphere.
   */
  SWIRL: number
  /** How much a mote slows per second. 0 lets them fly on forever. */
  DRAG: number
  /** Vertical drift, body radii per second. Positive rises; negative sinks. */
  RISE: number
  /** Extra spawn radius past the surface, in body radii. */
  SPREAD: number
  /** How far behind the centre the disc sits. Larger hides the birth better. */
  BACK_OFFSET: number
  /** Base mote size. Scaled by distance, so this is its size AT the body. */
  SIZE: number
  OPACITY: number
  GLOW: number
  COLOR: string
  CORE_COLOR: string
}

/** One orb's parked orientation, in degrees. Applied in THREE's XYZ order. */
export type OrbRotConfig = {
  X_DEG: number
  Y_DEG: number
  Z_DEG: number
}

/** One orb's parked position. Fractions of the viewport and of room depth. */
export type OrbSlotConfig = {
  X_FRAC: number
  Y_FRAC: number
  /** 0 = at the camera plane, 1 = at the back wall. Drives apparent size. */
  DEPTH_FRAC: number
}

/**
 * SAMSARA's own two exhausts — the brass tubes on its upper rear.
 *
 * ⚠️ The port is TUNABLE rather than a hand-measured constant, unlike the orb's
 * PORT_OFFSETS, and that is a deliberate correction. The orb's offsets are
 * baked into code and a model re-export silently invalidates them, which the
 * spec ranks as the sub-project's first risk. Here the owner nudges the plume
 * onto the actual tube mouth while watching it, and a re-export is a slider
 * move rather than a code hunt.
 *
 * ⚠️ ONE port, MIRRORED on X. The two tubes are symmetric on the model, so a
 * second set of coordinates could only ever drift out of symmetry — and would
 * double the sliders to express something the mesh does not offer.
 */
export type ExhaustConfig = {
  ENABLED: boolean
  /** Port position in BODY RADII, right-hand side. Mirrored to the left. */
  PORT_X: number
  PORT_Y: number
  PORT_Z: number
  /** Plume direction, body radii per second. DIR_X mirrors with the port. */
  DIR_X: number
  DIR_Y: number
  DIR_Z: number
  /** Puffs per second PER PORT. Continuous, not a cadence — an engine idles. */
  RATE: number
  SPREAD: number
  /** Puff size in PIXELS at the body's depth, matching BURST.SIZE's units. */
  PUFF_SIZE: number
  PUFF_LIFE_MS: number
  PUFF_COLOR: string
  PUFF_OPACITY: number
}

export type EmittersConfig = {
  /**
   * ⚠️ ONE size for BOTH orbs, and that is not an omission.
   *
   * The two orbs in the owner's mockup are the SAME object at different
   * depths — a ~2.6x depth ratio under the room's perspective camera, not two
   * different sizes. Two size values would drift apart the first time either
   * was tuned, and the mockup's own proportions would stop being reproducible.
   * Apparent size comes from DEPTH_FRAC.
   */
  SIZE_FRAC: number
  MOBILE_SIZE_FRAC: number

  NEAR: OrbSlotConfig
  FAR: OrbSlotConfig
  MOBILE_NEAR: OrbSlotConfig
  MOBILE_FAR: OrbSlotConfig

  /** Entry flight, per orb. */
  ENTRY_MS: number
  /** The far orb lags the near one by this, so they do not read as one body. */
  ENTRY_STAGGER_MS: number

  /**
   * Parked orientation per orb, in degrees — pitch, yaw, roll.
   *
   * Shared between landscape and portrait deliberately: which way a machine
   * faces is a property of the machine, not of the viewport, and doubling this
   * to four groups would put twelve sliders on the bench for a distinction
   * nobody makes.
   *
   * ⚠️ This rotates the AFTERBURNERS with the body. PORT_OFFSETS and
   * LENS_OFFSET are in orb LOCAL space, so anything reading them must apply the
   * same rotation the mesh gets — see the warning on portWorld().
   */
  NEAR_ROT: OrbRotConfig
  FAR_ROT: OrbRotConfig

  /**
   * The four steam ports, in ORB RADII. Mirrored on X and Z — see portOffsets.
   *
   * ⚠️ Config rather than constants since 2026-09-04. A model re-export used to
   * invalidate them silently; now it is a slider move, and SHOW_PORTS makes the
   * placement visible while you do it.
   */
  PORT_X: number
  PORT_Y: number
  PORT_Z: number

  /** The domed projector lens on top, where the shafts originate. Orb radii. */
  LENS_X: number
  LENS_Y: number
  LENS_Z: number

  /**
   * Draw a marker at each port and at the lens.
   *
   * A tuning aid, and the reason the ports stopped being guesswork: without it
   * a port is invisible until smoke happens to come out of it, and "the plume
   * is a bit off" is a slow way to find out where a point actually is. Ships
   * OFF.
   */
  SHOW_PORTS: boolean

  /** Idle float once parked, in ORB RADII. */
  BOB_AMP: number
  BOB_MS: number

  /**
   * The afterburner plume. CONTINUOUS, from the moment the orbs appear until
   * the room closes.
   *
   * ⚠️ There was a second behaviour here until 2026-09-04 — a repeating burst
   * once parked, per the owner's original brief — with its own CADENCE_MS and
   * CADENCE_PUFFS. Superseded: the emission is constant, and those two went
   * rather than staying as config nothing reads.
   */
  THRUST_RATE: number
  THRUST_SPREAD: number
  /**
   * How far each afterburner's plume leans AWAY from the orb's axis, as a
   * multiple of that nozzle's own offset.
   *
   * ⚠️ This and PLUME_Y were hardcoded at 0.3 and -0.7 until 2026-09-04, which
   * is why the four plumes read as one bunched flame: the nozzles sit at
   * ±0.55 and ±0.45 radii, so the lean was ±0.16 against an axial 0.7 and all
   * four jets left within about 13 degrees of straight down. SAMSARA's exhaust
   * had DIR_X/Y/Z from the start; the orbs never got the equivalent, so the
   * one thing that actually looked wrong was the one thing not on the bench.
   */
  PLUME_OUT: number
  /** Along the orb's own Y, in radii per second. Negative vents downward. */
  PLUME_Y: number

  /** Shared by both behaviours. Sizes are in ORB RADII. */
  PUFF_SIZE: number
  PUFF_LIFE_MS: number
  PUFF_COLOR: string
  PUFF_OPACITY: number
}

/**
 * Press and hold an orb: the pair shakes, then the screen and its rays flicker.
 *
 * ⚠️ TOP LEVEL, not inside HOLOGRAM or EMITTERS, because it spans both — the
 * shake belongs to the orbs and the flicker to the screen. Filing it under
 * either would leave half of it in the wrong place.
 */
export type PokeConfig = {
  ENABLED: boolean
  /**
   * How long the hold has to last before the flicker fires, and the time the
   * shake takes to build to full.
   */
  SHAKE_MS: number
  /** Peak wobble, in ORB RADII, so it holds at any orb size. */
  SHAKE_AMP: number
  SHAKE_HZ: number
  /** How long the shake takes to settle after the pointer lifts. */
  RELEASE_MS: number
  FLICKER_MS: number
  FLICKER_DEPTH: number
  /**
   * Extra pixels around each orb that still count as a press.
   *
   * ⚠️ Not optional on touch. The orbs are roughly 120px across on a desktop
   * viewport and much smaller on a phone; without slop the press is a game of
   * darts.
   */
  HIT_SLOP: number
}

export type HologramConfig = {
  /** Screen extent and centre, as fractions of the viewport. */
  W_FRAC: number
  /**
   * The artwork's own width divided by its height.
   *
   * ⚠️ Not a free number — it has to match public/hud/panel.png or the drawing
   * distorts. The build script prints the source aspect every run.
   */
  PANEL_ASPECT: number
  X_FRAC: number
  Y_FRAC: number
  MOBILE_W_FRAC: number
  MOBILE_X_FRAC: number
  MOBILE_Y_FRAC: number

  /** Flicker-then-resolve. Not a clean fade — the owner asked for instability. */
  FORM_MS: number

  /**
   * ⚠️ The flicker belongs to the GLASS ONLY. The published rect and the `live`
   * state must stay steady through it, because this screen will later carry
   * SUBTITLES — text that flickers on a 5s cycle defeats the accessibility
   * feature it exists to provide.
   */
  FLICKER_MS: number
  FLICKER_DUR_MS: number
  FLICKER_DEPTH: number

  GLASS_COLOR: string
  GLASS_OPACITY: number
  SHAFT_COLOR: string
  SHAFT_OPACITY: number
  /**
   * Fan half-width, as the exponent `pow(cos, 1 / SHAFT_SPREAD)`.
   *
   * ⚠️ THE UNITS CHANGED on 2026-09-04. This used to be a radius multiplier on
   * a cone mesh, where 1.05 meant "a bit wider than the orb". The shafts are a
   * screen-space ray fan now, so it is an angular falloff: larger is wider,
   * and past about 2 the fan is nearly a full half-disc. The owner's cone-era
   * value is NOT meaningful here and was re-tuned rather than carried over.
   */
  SHAFT_SPREAD: number
  /**
   * The fan's half-angle in degrees — where it actually ends.
   *
   * ⚠️ NOT the same knob as SHAFT_SPREAD, which only shapes brightness inside
   * the fan. pow(cos, n) reaches zero at exactly 90 degrees whatever n is, so
   * without this the fan always throws a faint tail out horizontally however
   * tightly it is tuned. Turn on SHAFT_GUIDE to see where this sits.
   */
  SHAFT_HALF_DEG: number
  /** TUNING AID — draws the fan's two edges in green. Never on for visitors. */
  SHAFT_GUIDE: boolean
  /**
   * How far the rays travel, as a multiple of the frame's diagonal at the
   * orb's own depth. At 1 the fan always covers the frame, so its edge is
   * never on screen; below 1 the edge comes into view.
   */
  SHAFT_REACH: number
  /**
   * Ray density. Multiplies the striation frequency, so 2 is roughly twice as
   * many distinct rays across the fan.
   *
   * ⚠️ The rays are banded on the ANGLE, not on arc length, so they are not
   * evenly spaced: cos changes slowly near the axis and quickly at the rim, so
   * the fan is naturally sparse in the middle and dense at its edges. That is
   * the reference's look, not a bug to correct.
   */
  SHAFT_RAYS: number
  /** Shimmer speed. 0 freezes the fan. */
  SHAFT_SPEED: number
  /**
   * Falloff shape along a ray. 1 is linear over the full reach; below 1 the
   * ray holds its strength most of the way and gives out near the end.
   */
  SHAFT_FADE: number
  /**
   * How dark the gaps between rays get. 1 leaves a soft wash; higher narrows
   * each ray and opens real darkness between them.
   */
  SHAFT_CONTRAST: number
  /**
   * How strongly the screen's own left and right edges bound the fan.
   * 1 keeps the light inside the panel; 0 lets it run across the room.
   */
  SHAFT_BOUND: number
  /** A hot bloom where the rays leave the lens. 0 is off. */
  SHAFT_CORE: number
  /**
   * How sharply each ray closes to a point at its far end. 1 leaves the
   * natural wedge, which ends blunt; higher tapers it to a spike.
   */
  SHAFT_TIP: number
  /** The colour at the throat of the beam, before it cools to SHAFT_COLOR. */
  SHAFT_CORE_COLOR: string
  /** How far the hot colour carries, 0..1 of the reach. */
  SHAFT_CORE_SPAN: number
  NEAR_SHAFT: ShaftSlotConfig
  FAR_SHAFT: ShaftSlotConfig
}

/**
 * Where one orb's fan sits and which way it points.
 *
 * ⚠️ ON SCREEN, not in the room, and that is the point rather than a
 * shortcut. The fan is drawn on a plane turned to face the camera, so its
 * whole geometry is two-dimensional; expressing its placement in world x/y/z
 * would make three sliders that move it in ways the eye cannot predict, two
 * of which do nearly the same thing from this camera.
 *
 * ⚠️ NOT a second lens position. EMITTERS.LENS_* is where the projector sits
 * on the MODEL — geometry, shared by both orbs because they are the same
 * mesh. This is composition: how far this particular fan is nudged off that
 * point, in orb radii so it holds at any orb size.
 */
export type ShaftSlotConfig = {
  /** Nudge across the screen from the lens, in orb radii. Right is positive. */
  DX: number
  /** Nudge up the screen from the lens, in orb radii. Up is positive. */
  DY: number
  /**
   * Turns the fan's axis on screen, degrees, anticlockwise.
   *
   * ⚠️ RELATIVE to the aim at the screen's centre, not an absolute heading.
   * At 0 the fan points where it always did, so this is inert until moved —
   * and the fan keeps following the screen if the screen is moved.
   */
  ANGLE_DEG: number
  /**
   * Multiplies SHAFT_HALF_DEG for this fan only.
   *
   * ⚠️ A TRIM, not a second master. The two orbs sit at very different depths
   * and aim across different distances, so one of them is always wrong when
   * both share an angle — but two independent absolutes would leave the global
   * slider doing nothing, which is the config-nothing-reads failure this
   * project has already paid for once.
   *
   * ⚠️ It multiplies the HALF-ANGLE, not SHAFT_SPREAD, since 2026-09-04. A
   * slider called "spread" has to change how wide the fan looks; the interior
   * falloff is the one thing it visibly does not.
   */
  SPREAD: number
  /**
   * Multiplies SHAFT_REACH for this fan only.
   *
   * ⚠️ A TRIM, like SPREAD, and for the same reason: the two orbs sit at very
   * different distances from the camera, so the reach that suits one overshoots
   * the other. The global stays the master.
   */
  REACH: number
}

/**
 * Builds the four steam ports from config, in ORB RADII, orb local space.
 *
 * ⚠️ THREE numbers for FOUR ports, mirrored on X and Z. The nozzles sit in a
 * square on the underside, so four independent coordinates could only ever
 * drift out of that square — and would put twelve sliders on the bench to
 * express something the mesh does not offer.
 *
 * ⚠️ These were hand-measured constants until 2026-09-04, which the spec ranked
 * as this sub-project's first risk: `emitter_orb.glb` has NO NAMED NODES, so a
 * re-export silently moved every plume and nothing threw. They are config now,
 * and `EMITTERS.SHOW_PORTS` draws a marker at each one so placing them is a
 * matter of looking rather than of guessing.
 *
 * ⚠️ And they cannot be found by measuring the mesh the way SAMSARA's exhausts
 * were. Those are TUBES — the furthest protrusions, so an outlier search finds
 * them exactly. These are RECESSED nozzles, holes in the hull; the same search
 * run against this model returns one bulb and nothing else.
 */
/**
 * Which way each afterburner vents, in ORB RADII PER SECOND, orb local space.
 *
 * ⚠️ Paired with `portOffsets` and in the same order. The lean is taken from
 * each nozzle's own x/z, so the four plumes splay apart instead of running
 * parallel — at PLUME_OUT 0 they are four copies of the same jet, which is
 * exactly the bug this replaced.
 */
export function portDirs(cfg: EmittersConfig): [number, number, number][] {
  return portOffsets(cfg).map(
    (o) => [o[0] * cfg.PLUME_OUT, cfg.PLUME_Y, o[2] * cfg.PLUME_OUT] as [number, number, number],
  )
}

export function portOffsets(cfg: EmittersConfig): [number, number, number][] {
  const { PORT_X: x, PORT_Y: y, PORT_Z: z } = cfg
  return [
    [x, y, z],
    [-x, y, z],
    [x, y, -z],
    [-x, y, -z],
  ]
}

/** The domed lens on top, where the shafts originate. Orb radii. */
export function lensOffset(cfg: EmittersConfig): [number, number, number] {
  return [cfg.LENS_X, cfg.LENS_Y, cfg.LENS_Z]
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
  BURST: BurstConfig
  EMITTERS: EmittersConfig
  EXHAUST: ExhaustConfig
  HOLOGRAM: HologramConfig
  /** Scroll-up from the room: a quick exit, NOT a rewind of the fall. */
  POKE: PokeConfig
  EXIT_MS: number
}

export const DEFAULT_SEQUENCE: SequenceConfig = {
  ENABLED: true,

  GESTURES: {
    BEATS_TO_COMMIT: 3,
    WHEEL_THRESHOLD: 145,
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
    FALL_MS: 950,
    BOUNCE_COUNT: 3,
    RESTITUTION: 0.81,
    BOUNCE_MS: [520, 430, 360],
    SETTLE_MS: 300,
  },

  LANDING: {
    SIZE_FRAC: 0.455,
    MOBILE_SIZE_FRAC: 0.35,
    X_FRAC: 0.82,
    Y_FRAC: 0.555,
    MOBILE_X_FRAC: 0.5,
    MOBILE_Y_FRAC: 0.3,
    HOVER_BOB_PX: 8,
    HOVER_BOB_MS: 2500,

    // Frontal and level. The owner parks it for real at the bench.
    ROT_X_DEG: -5,
    ROT_Y_DEG: -34,
    ROT_Z_DEG: -7,
  },

  ROOM: {
    // Graphite on black — the Atelier drawing language inverted, so the dark
    // room belongs to a brand that deliberately dropped its dark appearance.
    // UPPERCASE hex throughout: the admin colour swatch writes back uppercase,
    // and a lowercase value here marks the form dirty just from loading it.
    BG_COLOR: '#000000',
    FLOOR_COLOR: '#000000',
    WALL_COLOR: '#0E0E11',
    KEY_LIGHT_COLOR: '#FBF0D5',
    KEY_LIGHT_INTENSITY: 2.2,
    AMBIENT_INTENSITY: 0.78,
    FOG_DENSITY: 0.035,
    CAMERA_FOV_DEG: 20,
    DEPTH: 90,
    EXTENT: 12,

    // Warm bronze-brass, picked to be in the right neighbourhood once
    // STRENGTH is raised — not tuned, since STRENGTH 0 makes it inert. Owner
    // reference: matte warm brass with green-blue verdigris in the recesses.
    MASCOT_TINT_COLOR: '#8A6A3A',
    MASCOT_TINT_STRENGTH: 0.05,
    MASCOT_ROUGHNESS_BOOST: 0.5,

    // Warm, so the metal reflects brass rather than steel. See ENV_COLOR.
    ENV_COLOR: '#140C00',
    ENV_INTENSITY: 1,

    // As modelled. 0.955 on X would make the silhouette a true circle.
    MASCOT_STRETCH_X: 1,
    MASCOT_STRETCH_Y: 1.01,
  },

  DRAG: {
    ENABLED: true,
    SENSITIVITY_DEG_PER_PX: 0.75,
    MAX_PITCH_DEG: 125,
    DAMPING: 0.29,
    // Non-zero, because the shipped default is the VISITOR's setting: the room
    // is composed around a face that meets you, and it has to come back to that
    // on its own. Set to 0 at the bench to inspect the far side.
    RETURN_DELAY_MS: 1800,
    RETURN_MS: 1200,
  },

  IDLE_EYES: {
    /**
     * Owner 2026-08-31: "use all the expressions when parked and floating, for
     * the rest of the scene."
     *
     * neutral/blink/happy carry the owner's own tuned numbers from the bench.
     * The other eleven are seeded at 2 — present, but not enough to displace
     * the resting behaviour that was actually dialled in. Collectively they take
     * roughly 45% of picks, so something other than a blink or a smile happens
     * about every other beat; individually each is ~4%, which reads as variety
     * rather than as a tic. All fourteen have their own slider on the bench.
     *
     * ⚠️ Every key must name a real expression from eyes.ts. A typo does NOT
     * throw — pickWeighted simply never selects it, and SAMSARA would sit on one
     * face forever with nothing in the console to say why. types.check.ts pins
     * each key against EXPRESSION_ORDER for exactly that reason.
     */
    WEIGHTS: { neutral: 15, blink: 5, squint: 3, happy: 0, wide: 0, wink: 0, lookLeft: 0, lookRight: 0, lookUp: 0, lookDown: 0, lookUpLeft: 0, lookUpRight: 0, lookDownLeft: 0, lookDownRight: 0 },
    INTERVAL_MS: 4200,
    SMILE_SHAKE_PX: 9,
    SMILE_SHAKE_MS: 160,
    HOLD_EXPRESSION: 'happy',
  },

  BURST: {
    ENABLED: true,
    // The owner asked for every 4 seconds.
    INTERVAL_MS: 8200,
    // ⚠️ Count is NOT what separates smoke from dust — an earlier pass here
    // assumed it was and went down to 34, which just gave fewer, more obviously
    // separate orbs. The SHAPE does that (see the fragment shader). Given
    // eroded, noisy sprites, the count's only job is to make the mass
    // CONNECTED, and that wants more of them, not fewer.
    COUNT: 80,
    SECONDS: 1.4,
    // ⚠️ Fast enough to ESCAPE, then slowed. The first smoke pass used SPEED
    // 0.45 against DRAG 1.6, which stops a puff after roughly v/drag = 0.19
    // radii — so almost the entire burst stayed hidden behind the silhouette
    // it was born behind, and only three or four puffs ever reached the screen.
    // These give about 2 radii of travel: out past the body, then hanging.
    SPEED: 1,
    DRAG: 0.7,
    RISE: -1.4,
    GROWTH: 2.3,
    SWIRL: 0.35,
    SPREAD: 0.35,
    BACK_OFFSET: 0,
    // Large, and larger than it looks: the noise erodes most of each sprite
    // away, so the drawn wisp is much smaller than the point it is cut from.
    SIZE: 68,
    // LOW, and that is what makes it volumetric: single puffs are barely
    // there and the density comes from several overlapping. A high value here
    // gives distinct discs with visible edges.
    OPACITY: 0.11,
    // Low. Much higher puts a bright centre back in each puff, and a bright
    // centre in a round sprite is exactly the ember look being escaped.
    GLOW: 0.3,
    // The hero's own dust, so the room reads as the same material rather
    // than as a second gold. Matches MascotConfig.TRAIL_COLOR / _CORE_COLOR.
    COLOR: '#FDB721',
    CORE_COLOR: '#FFFCD6',
  },

  /**
   * ⚠️ STARTING POINTS, NOT FROZEN VALUES — unlike everything above them.
   *
   * Every other group in this object names a decision the owner made at the
   * bench with the thing on screen, and `types.check.ts` pins each one by
   * value. These two are guesses that look plausible, so `types.check.ts`
   * asserts only the RELATIONSHIPS between them. They are frozen when the
   * owner tunes them at /dev/samsara and presses `copy json`.
   */
  EMITTERS: {
    SIZE_FRAC: 0.14,
    // ⚠️ Kept BELOW the landscape value, not merely different. The fraction is
    // of ROOM.DEPTH, which is the same in both orientations, so an equal value
    // gives an equal world radius — and a portrait viewport is narrower, so
    // the same orb eats far more of the width. The owner's 2026-09-04 bench
    // moved landscape 0.14 -> 0.13 on a desktop; this follows by the same
    // ratio, because the bench cannot show what portrait is doing.
    MOBILE_SIZE_FRAC: 0.12,
    NEAR: { X_FRAC: 0.12, Y_FRAC: 0.85, DEPTH_FRAC: 0.05 },
    FAR: { X_FRAC: 0.57, Y_FRAC: 0.92, DEPTH_FRAC: 1.4 },
    MOBILE_NEAR: { X_FRAC: 0.16, Y_FRAC: 0.86, DEPTH_FRAC: 0.3 },
    MOBILE_FAR: { X_FRAC: 0.84, Y_FRAC: 0.86, DEPTH_FRAC: 0.3 },
    // Starting points read off an underside render, NOT measured — the ports are
    // recessed, so the outlier search that found SAMSARA's tubes cannot see
    // them. Turn SHOW_PORTS on and place them properly.
    PORT_X: 0.55,
    PORT_Y: -0.6,
    PORT_Z: 0.45,
    LENS_X: 0,
    LENS_Y: 0.9,
    LENS_Z: 0,
    SHOW_PORTS: false,
    NEAR_ROT: { X_DEG: 13, Y_DEG: 161, Z_DEG: 23 },
    FAR_ROT: { X_DEG: 31, Y_DEG: -21, Z_DEG: 7 },
    ENTRY_MS: 1600,
    ENTRY_STAGGER_MS: 200,
    BOB_AMP: 0.08,
    BOB_MS: 3400,
    THRUST_RATE: 26,
    THRUST_SPREAD: 0.5,
    PLUME_OUT: 0.3,
    PLUME_Y: -0.7,
    PUFF_SIZE: 1.11,
    PUFF_LIFE_MS: 1000,
    PUFF_COLOR: '#F0E6D1',
    PUFF_OPACITY: 0.25,
  },

  // Starting points, measured off the turntable rather than tuned — the owner
  // moves them onto the real tube mouths at the bench.
  EXHAUST: {
    ENABLED: true,
    // MEASURED off the mesh by scripts/_find-exhausts.mjs, not eyeballed. It
    // found exactly two protrusion clusters, symmetric to 0.003 across X at
    // 116 and 115 verts — nothing else on the hull reaches that far out.
    PORT_X: 0.76,
    PORT_Y: 0.77,
    PORT_Z: -0.29,
    // Radially outward through the tip, which for a tube protruding from a
    // spheroid IS its axis.
    DIR_X: 0.35,
    DIR_Y: 1.95,
    DIR_Z: -0.3,
    RATE: 10,
    SPREAD: 0.73,
    PUFF_SIZE: 81,
    PUFF_LIFE_MS: 925,
    PUFF_COLOR: '#F7ECD9',
    PUFF_OPACITY: 0.18,
  },

  HOLOGRAM: {
    W_FRAC: 0.615,
    PANEL_ASPECT: 1.651,
    X_FRAC: 0.3,
    Y_FRAC: 0.38,
    MOBILE_W_FRAC: 0.78,
    MOBILE_X_FRAC: 0.5,
    MOBILE_Y_FRAC: 0.66,
    FORM_MS: 1875,
    FLICKER_MS: 5900,
    FLICKER_DUR_MS: 360,
    FLICKER_DEPTH: 0.49,
    // ⚠️ WHITE, and white is the identity. It MULTIPLIES the artwork now
    // rather than replacing it — panel2 carries its own amber — so anything
    // else here shifts a colour the owner already chose.
    GLASS_COLOR: '#FFFFFF',
    // ⚠️ RE-TUNED with the shader, like SHAFT_OPACITY before it. The owner's
    // 0.44 scaled an `ink * 1.9` term plus a separate haze; it now scales a
    // field that peaks at 1, so the same number is about half the brightness.
    GLASS_OPACITY: 0.6,
    SHAFT_COLOR: '#FFC547',
    // ⚠️ RE-TUNED with the shader, like SHAFT_SPREAD. The owner's 0.15 was set
    // against a solid wedge where every fragment was fully lit; the fan
    // multiplies this by the striation and the cone falloff, so the same
    // number reads as almost nothing.
    SHAFT_OPACITY: 0.46,
    SHAFT_SPREAD: 2.52,
    // The owner's annotated target: edges up and out, not out sideways.
    SHAFT_HALF_DEG: 64,
    SHAFT_GUIDE: false,
    SHAFT_REACH: 0.4,
    SHAFT_RAYS: 3.3,
    SHAFT_SPEED: 3.35,
    SHAFT_FADE: 1.35,
    SHAFT_CONTRAST: 2.2,
    SHAFT_BOUND: 1,
    SHAFT_CORE: 0.7,
    SHAFT_TIP: 4.6,
    SHAFT_CORE_COLOR: '#FFF3D0',
    SHAFT_CORE_SPAN: 0.5,
    // Both zero, so the slot config changes nothing until a slider moves.
    NEAR_SHAFT: { DX: 0.05, DY: -0.2, ANGLE_DEG: 11, SPREAD: 0.85, REACH: 0.75 },
    FAR_SHAFT: { DX: 0.1, DY: -0.6, ANGLE_DEG: -20, SPREAD: 0.75, REACH: 0.65 },
  },

  POKE: {
    ENABLED: true,
    SHAKE_MS: 700,
    SHAKE_AMP: 0.09,
    SHAKE_HZ: 19,
    RELEASE_MS: 420,
    FLICKER_MS: 620,
    FLICKER_DEPTH: 0.8,
    HIT_SLOP: 18,
  },

  EXIT_MS: 800,
}
