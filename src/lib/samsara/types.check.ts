/**
 * Pins DEFAULT_SEQUENCE — owner-approved 2026-08-31, frozen at plan Task 13.
 *
 * These are no longer starting values. Anything here that names an exact number
 * is naming a decision someone made at the bench with the thing on screen, so a
 * later edit has to be deliberate and has to come back through the owner.
 * Run: npm run verify:config
 */
import { DEFAULT_SEQUENCE, PORT_OFFSETS } from './types'
import { EXPRESSION_ORDER } from '../mascot/eyes'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// ── gestures ────────────────────────────────────────────────────────
// ⚠️ THREE, not the four the spec's state machine diagram draws: two charge
// beats, then the commit. Owner-tuned across four passes (4 -> 2 -> 3), with
// WHEEL_THRESHOLD at 230 so each beat still takes a deliberate scroll rather
// than a nudge.
check('two charge beats then a commit', DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT === 3)
check('wheel threshold is positive', DEFAULT_SEQUENCE.GESTURES.WHEEL_THRESHOLD > 0)
// A trackpad flick's momentum tail runs a few hundred ms. A cooldown shorter
// than that lets one flick fire the whole sequence.
check('cooldown outlasts trackpad momentum', DEFAULT_SEQUENCE.GESTURES.COOLDOWN_MS >= 300)
check('quiet window is positive', DEFAULT_SEQUENCE.GESTURES.QUIET_MS > 0)
check('touch threshold is positive', DEFAULT_SEQUENCE.GESTURES.TOUCH_THRESHOLD > 0)

// ── freeze ──────────────────────────────────────────────────────────
// >=, not ===, and the direction matters. Too FEW entries is the real hazard:
// a beat with no amplitude falls back to `?? 0` and simply does not shake. Spare
// entries are inert, and keeping them means raising BEATS_TO_COMMIT back up does
// not silently produce a beat with no ramp behind it.
check(
  'every charge beat has a shake amplitude',
  DEFAULT_SEQUENCE.FREEZE.SHAKE_PX_PER_BEAT.length >= DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT - 1,
)
check(
  'shake ramps up across the beats',
  DEFAULT_SEQUENCE.FREEZE.SHAKE_PX_PER_BEAT.every((v, i, a) => i === 0 || v > a[i - 1]),
)
check(
  'every charge beat has a charge level',
  DEFAULT_SEQUENCE.FREEZE.CHARGE_PER_BEAT.length >= DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT - 1,
)
check(
  'charge ramps and tops out at full',
  DEFAULT_SEQUENCE.FREEZE.CHARGE_PER_BEAT.every((v, i, a) => i === 0 || v > a[i - 1]) &&
    DEFAULT_SEQUENCE.FREEZE.CHARGE_PER_BEAT.at(-1) === 1,
)

// ── transit ─────────────────────────────────────────────────────────
check('three bounces', DEFAULT_SEQUENCE.TRANSIT.BOUNCE_COUNT === 3)
check(
  'restitution loses energy',
  DEFAULT_SEQUENCE.TRANSIT.RESTITUTION > 0 && DEFAULT_SEQUENCE.TRANSIT.RESTITUTION < 1,
)
check(
  'one duration per bounce',
  DEFAULT_SEQUENCE.TRANSIT.BOUNCE_MS.length === DEFAULT_SEQUENCE.TRANSIT.BOUNCE_COUNT,
)
check(
  'bounce durations shorten',
  DEFAULT_SEQUENCE.TRANSIT.BOUNCE_MS.every((d, i, a) => i === 0 || d < a[i - 1]),
)
check('half-orbit is positive', DEFAULT_SEQUENCE.TRANSIT.HALF_ORBIT_MS > 0)
check('settle is positive', DEFAULT_SEQUENCE.TRANSIT.SETTLE_MS > 0)

// Structural, not taste: the initial drop must be the longest phase of the
// transit. If a bounce ever outlasts the fall the arc reads as a stutter rather
// than a fall, whatever the absolute durations are tuned to.
//
// (An earlier version asserted FALL_MS >= 900 on the grounds that SAMSARA had
// to descend ~400px behind the mark before the layer could be promoted. That
// premise was measured and found false — see transitScript.ts — so the
// assertion went with it rather than being quietly kept for a reason that no
// longer holds.)
check(
  'the initial fall is the longest phase',
  DEFAULT_SEQUENCE.TRANSIT.BOUNCE_MS.every((d) => d < DEFAULT_SEQUENCE.TRANSIT.FALL_MS) &&
    DEFAULT_SEQUENCE.TRANSIT.SETTLE_MS < DEFAULT_SEQUENCE.TRANSIT.FALL_MS,
)

// ── landing ─────────────────────────────────────────────────────────
check('landed size is the approved 45.5% of viewport height', DEFAULT_SEQUENCE.LANDING.SIZE_FRAC === 0.455)
check('mobile lands smaller than desktop', DEFAULT_SEQUENCE.LANDING.MOBILE_SIZE_FRAC === 0.35)
check(
  'mobile landed size is set independently',
  typeof DEFAULT_SEQUENCE.LANDING.MOBILE_SIZE_FRAC === 'number',
)
// Owner's composition: desktop right, mobile upper.
check('desktop lands right of centre', DEFAULT_SEQUENCE.LANDING.X_FRAC > 0.5)
check('mobile lands in the upper area', DEFAULT_SEQUENCE.LANDING.MOBILE_Y_FRAC < 0.5)
check('hover bob is a gentle float', DEFAULT_SEQUENCE.LANDING.HOVER_BOB_PX > 0 && DEFAULT_SEQUENCE.LANDING.HOVER_BOB_PX < 40)

// ── exit ────────────────────────────────────────────────────────────
check('exit is quicker than the fall', DEFAULT_SEQUENCE.EXIT_MS < DEFAULT_SEQUENCE.TRANSIT.FALL_MS)

// ── room ────────────────────────────────────────────────────────────
check('room camera fov is sane', DEFAULT_SEQUENCE.ROOM.CAMERA_FOV_DEG > 10 && DEFAULT_SEQUENCE.ROOM.CAMERA_FOV_DEG < 120)
check('room has depth to fall into', DEFAULT_SEQUENCE.ROOM.DEPTH > 0)
const HEX = /^#[0-9A-F]{6}$/
// Every stored colour on this project is UPPERCASE hex — the admin colour
// swatch writes back uppercase deliberately, so a lowercase default here would
// mark the form dirty the moment it loads.
check('BG is uppercase hex', HEX.test(DEFAULT_SEQUENCE.ROOM.BG_COLOR))
check('FLOOR is uppercase hex', HEX.test(DEFAULT_SEQUENCE.ROOM.FLOOR_COLOR))
check('WALL is uppercase hex', HEX.test(DEFAULT_SEQUENCE.ROOM.WALL_COLOR))
check('KEY_LIGHT is uppercase hex', HEX.test(DEFAULT_SEQUENCE.ROOM.KEY_LIGHT_COLOR))

// ── mascot material tint, room-only ─────────────────────────────────
// Shipped OFF and turned ON by the owner at the freeze gate: the chrome-vs-brass
// correction they asked for. The values are now a look someone chose, so they
// are pinned exactly rather than as a range.
check('MASCOT_TINT is uppercase hex', HEX.test(DEFAULT_SEQUENCE.ROOM.MASCOT_TINT_COLOR))
// Pulled almost to nothing once the warm ENVIRONMENT was doing the work the
// tint had been standing in for. It is a metal: what it reflects is its colour.
check('mascot tint is the approved strength', DEFAULT_SEQUENCE.ROOM.MASCOT_TINT_STRENGTH === 0.05)
check('roughness boost is the approved amount', DEFAULT_SEQUENCE.ROOM.MASCOT_ROUGHNESS_BOOST === 0.5)
// Still room-only. If this ever stops being true the approved HERO material
// changes too, which is a different decision from the one made here.
check(
  'the tint is only ever applied outside the orbit',
  DEFAULT_SEQUENCE.ROOM.MASCOT_TINT_STRENGTH > 0,
)
check(
  'tint strength is a fraction, not a percentage',
  DEFAULT_SEQUENCE.ROOM.MASCOT_TINT_STRENGTH >= 0 && DEFAULT_SEQUENCE.ROOM.MASCOT_TINT_STRENGTH <= 1,
)

// ── body shape ──────────────────────────────────────────────────────
// ⚠️ NOT a correction. The renderer was measured against the source before this
// control existed: face-on the silhouette renders 785x745 (1.0537) against the
// mesh's own 2.00 x 1.91 (1.0471) — within 0.6%, the residual being eye glow
// bleeding sideways. The body simply IS ~4.7% wider than tall, and STRETCH is
// the owner overriding that on purpose rather than the engine distorting it.
check('approved body stretch', DEFAULT_SEQUENCE.ROOM.MASCOT_STRETCH_X === 1)
// Revised 2026-09-04: 1.12 -> 1.01, i.e. the owner has pulled the deliberate
// vertical stretch almost all the way out. The measurement above still stands —
// the mesh really is ~4.7% wider than tall — so this is the owner choosing to
// let the body render close to as modelled rather than a correction being
// undone by accident.
check('approved body stretch Y', DEFAULT_SEQUENCE.ROOM.MASCOT_STRETCH_Y === 1.01)
// A stretch of 0 collapses the body to a plane and a negative one turns it
// inside out; neither is a look anyone is reaching for with a slider.
check(
  'stretch stays positive on both axes',
  DEFAULT_SEQUENCE.ROOM.MASCOT_STRETCH_X > 0 && DEFAULT_SEQUENCE.ROOM.MASCOT_STRETCH_Y > 0,
)

// ── parked orientation and drag ─────────────────────────────────────
// Owner requirement: SAMSARA has to be parked where its eyes meet the visitor,
// so the room's orientation is an explicit decision rather than whatever the
// orbit's spin clock happened to reach.
const DEG = (v: number) => v >= -360 && v <= 360
check('parked pitch is a sane angle', DEG(DEFAULT_SEQUENCE.LANDING.ROT_X_DEG))
check('parked yaw is a sane angle', DEG(DEFAULT_SEQUENCE.LANDING.ROT_Y_DEG))
check('parked roll is a sane angle', DEG(DEFAULT_SEQUENCE.LANDING.ROT_Z_DEG))

check('drag turns something per pixel', DEFAULT_SEQUENCE.DRAG.SENSITIVITY_DEG_PER_PX > 0)
check(
  'pitch is clamped short of a flip — past vertical the yaw axis inverts',
  DEFAULT_SEQUENCE.DRAG.MAX_PITCH_DEG > 0 && DEFAULT_SEQUENCE.DRAG.MAX_PITCH_DEG <= 180,
)
check(
  'damping is a per-SECOND survival fraction, not a per-frame multiplier',
  DEFAULT_SEQUENCE.DRAG.DAMPING >= 0 && DEFAULT_SEQUENCE.DRAG.DAMPING < 1,
)
check('the return is quicker than the delay that triggers it', DEFAULT_SEQUENCE.DRAG.RETURN_MS > 0)
// The SHIPPED default is the visitor's, not the bench's: a room composed around
// a face that meets you has to reassert that after someone lets go. 0 (stay put)
// is the inspection setting and lives on the bench, not here.
check(
  'the shipped default springs back to the parked pose',
  DEFAULT_SEQUENCE.DRAG.RETURN_DELAY_MS > 0,
)

// ── idle eyes ───────────────────────────────────────────────────────
// Spec §6.5: in the room SAMSARA is stationary and front-facing, so the eyes
// are driven by a timed loop rather than by the face sweeping past.
check('idle eye weights are non-empty', Object.keys(DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS).length > 0)
check(
  'idle eye weights are non-negative',
  Object.values(DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS).every((w) => w >= 0),
)
check(
  'at least one idle expression can actually be picked',
  Object.values(DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS).some((w) => w > 0),
)
check('idle interval is positive', DEFAULT_SEQUENCE.IDLE_EYES.INTERVAL_MS > 0)
check('smile shake is a vertical bob', DEFAULT_SEQUENCE.IDLE_EYES.SMILE_SHAKE_PX > 0)

// ⚠️ Every weight key must name a REAL expression. A typo here does not throw —
// pickWeighted would simply never select it, and SAMSARA would sit on one
// expression forever with nothing in the console to say why.
for (const name of Object.keys(DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS)) {
  check(`idle weight "${name}" is a real expression`, EXPRESSION_ORDER.includes(name))
}
// ⚠️ Every expression must be PRESENT as a key. Not non-zero — PRESENT.
//
// The distinction is the whole point. A weight of 0 is a decision the owner made
// and pickWeighted honours it by design ("an owner who zeroes the pool wants the
// face at rest"). A MISSING key is a typo, and it is invisible: nothing throws,
// the expression is simply never chosen, and the bench has no slider to reveal
// the gap. So the assertion guards the silent failure and leaves the decision
// alone.
//
// (An earlier version of this required every weight > 0, written from the
// owner's "use all the expressions". They then tuned the room down to a calm
// resting face — see WEIGHTS — so that assertion was pinning an instruction
// which had been superseded rather than a property that had to hold.)
for (const name of EXPRESSION_ORDER) {
  check(
    `"${name}" has a weight key, so it is tunable rather than missing`,
    name in DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS,
  )
}
check(
  'no weight names an expression that does not exist',
  Object.keys(DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS).every((k) => EXPRESSION_ORDER.includes(k)),
)

// ── press and hold ──────────────────────────────────────────────────
// Owner: "click&hold will make it laugh/smile until click is released."
check(
  'the hold expression is a real expression, or empty to disable',
  DEFAULT_SEQUENCE.IDLE_EYES.HOLD_EXPRESSION === '' ||
    EXPRESSION_ORDER.includes(DEFAULT_SEQUENCE.IDLE_EYES.HOLD_EXPRESSION),
)
// The smile is a REWARD for holding, so it must not also fire on its own — that
// is why `happy` is 0 in the idle pool. If both were live the interaction would
// stop being discoverable, because SAMSARA would already be doing it.
check(
  'the held expression is not also in the random idle pool',
  DEFAULT_SEQUENCE.IDLE_EYES.HOLD_EXPRESSION === '' ||
    (DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS[DEFAULT_SEQUENCE.IDLE_EYES.HOLD_EXPRESSION] ?? 0) === 0,
)

check('kill switch defaults on', DEFAULT_SEQUENCE.ENABLED === true)

// Below 1 the surfaces would end INSIDE the framed volume and their edges
// would be visible in shot, which is the opposite of what this control is for.
check('room extent never crops inside the frame', DEFAULT_SEQUENCE.ROOM.EXTENT >= 1)

// ── emitters ────────────────────────────────────────────────────────
//
// ⚠️ RELATIONSHIPS ONLY, never magnitudes — unlike everything above, which
// pins owner-approved decisions. EMITTERS and HOLOGRAM are STARTING VALUES
// (spec §9): the owner tunes them at /dev/samsara and freezes them there.
// Pinning a number here would misrepresent a guess as a decision.
check('orb size is a sane fraction of the viewport',
  DEFAULT_SEQUENCE.EMITTERS.SIZE_FRAC > 0 && DEFAULT_SEQUENCE.EMITTERS.SIZE_FRAC < 0.5)
check('mobile orb is not larger than desktop',
  DEFAULT_SEQUENCE.EMITTERS.MOBILE_SIZE_FRAC <= DEFAULT_SEQUENCE.EMITTERS.SIZE_FRAC)
check('the near orb is nearer the camera than the far orb',
  DEFAULT_SEQUENCE.EMITTERS.NEAR.DEPTH_FRAC < DEFAULT_SEQUENCE.EMITTERS.FAR.DEPTH_FRAC)
check('entry has a positive duration', DEFAULT_SEQUENCE.EMITTERS.ENTRY_MS > 0)
check('the stagger is shorter than the entry it offsets',
  DEFAULT_SEQUENCE.EMITTERS.ENTRY_STAGGER_MS < DEFAULT_SEQUENCE.EMITTERS.ENTRY_MS)
// A puff outliving its interval means the cadence never reads as separate
// bursts — it becomes a continuous plume, which is the thrust, not the cadence.
// ⚠️ Lifetimes are randomised up to 1.25x, so the headroom is real, not spare.
check('a cadenced puff dies before the next burst',
  DEFAULT_SEQUENCE.EMITTERS.PUFF_LIFE_MS * 1.25 < DEFAULT_SEQUENCE.EMITTERS.CADENCE_MS)
check('thrust emits at a positive rate', DEFAULT_SEQUENCE.EMITTERS.THRUST_RATE > 0)
check('there are four ports', PORT_OFFSETS.length === 4)

// ── hologram ────────────────────────────────────────────────────────
check('the screen has positive extent',
  DEFAULT_SEQUENCE.HOLOGRAM.W_FRAC > 0 && DEFAULT_SEQUENCE.HOLOGRAM.H_FRAC > 0)
check('forming has a positive duration', DEFAULT_SEQUENCE.HOLOGRAM.FORM_MS > 0)
check('the flicker is briefer than its own interval',
  DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_DUR_MS < DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_MS)
check('the flicker dips rather than extinguishing',
  DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_DEPTH > 0 && DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_DEPTH < 1)
// Landscape: the screen sits LEFT of SAMSARA, which parks at X_FRAC 0.75.
check('the screen clears SAMSARA horizontally in landscape',
  DEFAULT_SEQUENCE.HOLOGRAM.X_FRAC + DEFAULT_SEQUENCE.HOLOGRAM.W_FRAC / 2
    < DEFAULT_SEQUENCE.LANDING.X_FRAC)
// Portrait: the screen sits BELOW SAMSARA, which parks at MOBILE_Y_FRAC 0.3.
check('the screen clears SAMSARA vertically in portrait',
  DEFAULT_SEQUENCE.HOLOGRAM.MOBILE_Y_FRAC - DEFAULT_SEQUENCE.HOLOGRAM.MOBILE_H_FRAC / 2
    > DEFAULT_SEQUENCE.LANDING.MOBILE_Y_FRAC)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll sequence config checks passed.')
process.exit(failures ? 1 : 0)
