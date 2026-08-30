/**
 * Pins DEFAULT_SEQUENCE.
 *
 * ⚠️ These are STARTING values, not owner-approved ones — see spec §9. When the
 * bench freeze gate (plan Task 13) lands, update BOTH the config and these
 * assertions in the same commit, so a drift cannot pass silently.
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
check('3 charge beats then a commit', DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT === 4)
check('wheel threshold is positive', DEFAULT_SEQUENCE.GESTURES.WHEEL_THRESHOLD > 0)
// A trackpad flick's momentum tail runs a few hundred ms. A cooldown shorter
// than that lets one flick fire the whole sequence.
check('cooldown outlasts trackpad momentum', DEFAULT_SEQUENCE.GESTURES.COOLDOWN_MS >= 300)
check('quiet window is positive', DEFAULT_SEQUENCE.GESTURES.QUIET_MS > 0)
check('touch threshold is positive', DEFAULT_SEQUENCE.GESTURES.TOUCH_THRESHOLD > 0)

// ── freeze ──────────────────────────────────────────────────────────
check(
  'one shake amplitude per charge beat',
  DEFAULT_SEQUENCE.FREEZE.SHAKE_PX_PER_BEAT.length === DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT - 1,
)
check(
  'shake ramps up across the beats',
  DEFAULT_SEQUENCE.FREEZE.SHAKE_PX_PER_BEAT.every((v, i, a) => i === 0 || v > a[i - 1]),
)
check(
  'one charge level per charge beat',
  DEFAULT_SEQUENCE.FREEZE.CHARGE_PER_BEAT.length === DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT - 1,
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

// Spec §5.6: the far point sits ~213px ABOVE the mark, and SAMSARA must
// descend ~400px behind it before the layer promotion may fire. A short fall
// would try to promote while it is still behind the logo, popping it in front.
check('fall is long enough to clear the mark', DEFAULT_SEQUENCE.TRANSIT.FALL_MS >= 900)

// ── landing ─────────────────────────────────────────────────────────
check('landed size is 40% of viewport height', DEFAULT_SEQUENCE.LANDING.SIZE_FRAC === 0.4)
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
// The owner asked for normal, blink and smile specifically.
for (const required of ['neutral', 'blink', 'happy']) {
  check(
    `owner-requested "${required}" is in the idle pool`,
    (DEFAULT_SEQUENCE.IDLE_EYES.WEIGHTS[required] ?? 0) > 0,
  )
}

check('kill switch defaults on', DEFAULT_SEQUENCE.ENABLED === true)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll sequence config checks passed.')
process.exit(failures ? 1 : 0)
