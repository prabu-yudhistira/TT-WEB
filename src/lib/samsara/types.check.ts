/**
 * Pins DEFAULT_SEQUENCE — owner-approved 2026-08-31, frozen at plan Task 13.
 *
 * These are no longer starting values. Anything here that names an exact number
 * is naming a decision someone made at the bench with the thing on screen, so a
 * later edit has to be deliberate and has to come back through the owner.
 * Run: npm run verify:config
 */
import { DEFAULT_SEQUENCE } from './types'
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
// ⚠️ TWO, not the four the spec's state machine diagram draws: one charge beat,
// then the commit. Owner-tuned, with WHEEL_THRESHOLD raised 120 -> 205 so each
// beat still takes a deliberate scroll rather than a nudge.
check('one charge beat then a commit', DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT === 2)
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

// ── chatbox and exit ────────────────────────────────────────────────
check('chatbox enters after the bounces begin', DEFAULT_SEQUENCE.CHATBOX.DELAY_MS > DEFAULT_SEQUENCE.TRANSIT.FALL_MS)
check('chatbox entrance is positive', DEFAULT_SEQUENCE.CHATBOX.ENTER_MS > 0)
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
check('mascot tint is the approved strength', DEFAULT_SEQUENCE.ROOM.MASCOT_TINT_STRENGTH === 0.41)
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

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll sequence config checks passed.')
process.exit(failures ? 1 : 0)
