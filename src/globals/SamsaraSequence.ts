import type { Field, GlobalConfig } from 'payload'
import { globalRevalidateHook } from '../lib/revalidate'
import { DEFAULT_SEQUENCE } from '../lib/samsara/types'

const d = DEFAULT_SEQUENCE

// Payload has no native colour field; validate a 6-digit hex string instead.
const hexColour = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? true
    : 'Use a 6-digit hex colour, e.g. #08080A'

/**
 * One hex colour field with the native picker rendered under the text input,
 * matching hero-effects exactly. `afterInput` rather than a replacement Field,
 * so Payload's own label / description / validation rendering stays stock.
 */
const colour = (name: string, defaultValue: string, description?: string): Field => ({
  name,
  type: 'text',
  defaultValue,
  validate: hexColour,
  admin: {
    ...(description === undefined ? {} : { description }),
    components: { afterInput: ['@/components/admin/ColourSwatch#ColourSwatch'] },
  },
})

/**
 * A list of numbers, one row per beat or per bounce.
 *
 * ⚠️ Rows are how Payload stores a list, and an editor can delete one. The
 * resolver therefore rebuilds these at the DEFAULT's length and falls back per
 * missing entry — the engine indexes them positionally, and an `undefined`
 * there multiplies into a NaN position that makes SAMSARA vanish silently.
 * Adding rows past the default length has no effect for the same reason.
 */
const numberList = (
  name: string,
  values: readonly number[],
  opts: { min: number; max: number; description: string },
): Field => ({
  name,
  type: 'array',
  label: name,
  defaultValue: values.map((value) => ({ value })),
  admin: { description: opts.description },
  fields: [{ name: 'value', type: 'number', min: opts.min, max: opts.max, required: true }],
})

/**
 * The SAMSARA transition — Section 2's behaviour. Spec §7.1.
 *
 * A NEW global rather than more columns on `hero-effects`, and the reason is
 * concrete rather than tidiness: `hero-effects` holds owner-tuned values that
 * diverge from code defaults (`satelliteColors.identity` is #8A0F44 against
 * #0f8a75 in DEFAULT_SATELLITES). That divergence is why the eyes fields had to
 * be written through the authenticated REST API rather than `npm run seed` — a
 * reseed would have overwritten owner tuning. This global has nothing to
 * overwrite and can be seeded normally.
 *
 * NOT localized: it is numbers and hex strings, identical in EN and ID.
 *
 * ⚠️ Every field may be null on an install that has not been reseeded.
 * `resolveSamsara()` falls back to `DEFAULT_SEQUENCE` for every one of them, so
 * the sequence runs correctly before anyone opens /admin.
 *
 * ⚠️ RANGES HAVE HEADROOM ABOVE THE APPROVED VALUE, and that is asserted by
 * `resolveSamsara.check.ts` rather than left to review. `wireSpeed` sat pinned
 * at its own ceiling of 6 for three sessions and was flagged three times before
 * the owner was finally asked; `reformMs` on hero-effects still ships with
 * defaultValue 2500 against max 2500. A ceiling equal to the shipped value is
 * not a range — it is a number the owner can only ever lower.
 *
 * ⚠️ The bench at /[locale]/dev/samsara is still the editing tool for anything
 * spatial. `copy json` there, pasted into `lib/samsara/types.ts`, is the
 * approval step (spec §7.4). These fields are for adjusting a frozen sequence,
 * not for composing one.
 */
export const SamsaraSequence: GlobalConfig = {
  slug: 'samsara-sequence',
  label: 'SAMSARA transition',
  access: { read: () => true },
  hooks: { afterChange: [globalRevalidateHook('samsara-sequence')] },
  fields: [
    {
      name: 'sequenceEnabled',
      type: 'checkbox',
      defaultValue: d.ENABLED,
      admin: {
        description:
          'Turning this OFF removes the whole transition from the page — no scroll listeners, no pin, no room. The hero keeps its orbiting mascot exactly as it was before Section 2 existed.',
      },
    },

    {
      name: 'gestures',
      type: 'group',
      label: 'Gestures — how the visitor enters the room',
      admin: {
        description:
          'One trackpad flick must stay ONE beat. Test any change with a flick, not a mouse wheel.',
      },
      fields: [
        {
          name: 'beatsToCommit',
          type: 'number',
          defaultValue: d.GESTURES.BEATS_TO_COMMIT,
          min: 1,
          max: 6,
          admin: {
            description:
              'Scroll gestures before SAMSARA leaves the hero. The last one commits, so 3 means two charge beats then the launch.',
          },
        },
        {
          name: 'wheelThreshold',
          type: 'number',
          defaultValue: d.GESTURES.WHEEL_THRESHOLD,
          min: 40,
          max: 600,
          admin: {
            description:
              'Wheel distance per beat. 230 is about two mouse notches, so roughly six notches to enter. Raise it if entry feels too easy; this is the first number to revisit if it feels heavy on a mouse.',
          },
        },
        {
          name: 'cooldownMs',
          type: 'number',
          defaultValue: d.GESTURES.COOLDOWN_MS,
          min: 0,
          max: 1200,
          admin: { description: 'Ignore further scrolling for this long after a beat lands.' },
        },
        {
          name: 'quietMs',
          type: 'number',
          defaultValue: d.GESTURES.QUIET_MS,
          min: 0,
          max: 600,
          admin: {
            description:
              'Stillness that ends a gesture. This is what keeps one long trackpad flick from counting as several beats.',
          },
        },
        {
          name: 'touchThreshold',
          type: 'number',
          defaultValue: d.GESTURES.TOUCH_THRESHOLD,
          min: 10,
          max: 300,
          admin: { description: 'Finger travel in px per beat on touch.' },
        },
      ],
    },

    {
      name: 'freeze',
      type: 'group',
      label: 'Freeze — the hero holding still while it charges',
      admin: {
        description:
          'Beat 1 must be unmistakable. A page that does not visibly respond to the first scroll reads as broken.',
      },
      fields: [
        numberList('shakePxPerBeat', d.FREEZE.SHAKE_PX_PER_BEAT, {
          min: 0,
          max: 40,
          description:
            'Shake amplitude in px, one row per beat. Rows past the beat count are unused; deleting rows falls back to the built-in values.',
        }),
        {
          name: 'shakeHz',
          type: 'number',
          defaultValue: d.FREEZE.SHAKE_HZ,
          min: 1,
          max: 40,
          admin: { description: 'Shake frequency.' },
        },
        numberList('chargePerBeat', d.FREEZE.CHARGE_PER_BEAT, {
          min: 0,
          max: 1,
          description:
            'How far the logo has pulled apart at each beat, 0–1. The commit takes it to 1 regardless, so the last row only matters if the beat count is raised.',
        }),
      ],
    },

    {
      name: 'transit',
      type: 'group',
      label: 'Transit — the sweep, the fall and the bounce',
      fields: [
        {
          name: 'halfOrbitMs',
          type: 'number',
          defaultValue: d.TRANSIT.HALF_ORBIT_MS,
          min: 120,
          max: 2000,
          admin: {
            description:
              'The sweep from wherever SAMSARA was to the far point of the orbit, before the camera hands over.',
          },
        },
        {
          name: 'fallMs',
          type: 'number',
          defaultValue: d.TRANSIT.FALL_MS,
          min: 200,
          max: 3000,
          admin: { description: 'The drop from the back of the room to the first contact.' },
        },
        {
          name: 'bounceCount',
          type: 'number',
          defaultValue: d.TRANSIT.BOUNCE_COUNT,
          min: 0,
          max: 6,
          admin: { description: '0 lands it dead, with no bounce at all.' },
        },
        {
          name: 'restitution',
          type: 'number',
          defaultValue: d.TRANSIT.RESTITUTION,
          min: 0,
          max: 0.95,
          admin: {
            description:
              'Energy kept per bounce. Apex heights go h, then this fraction of h, then that fraction again.',
          },
        },
        numberList('bounceMs', d.TRANSIT.BOUNCE_MS, {
          min: 60,
          max: 1500,
          description: 'One duration per bounce, shortening. Rows past the bounce count are unused.',
        }),
        {
          name: 'settleMs',
          type: 'number',
          defaultValue: d.TRANSIT.SETTLE_MS,
          min: 60,
          max: 1500,
          admin: { description: 'The rise from the last contact into the resting hover.' },
        },
      ],
    },

    {
      name: 'landing',
      type: 'group',
      label: 'Landing — where SAMSARA ends up',
      admin: {
        description:
          'Fractions of the viewport, so the composition holds at every size. Desktop and portrait are set separately because SAMSARA sits beside Section 2’s content on wide screens and above it in portrait.',
      },
      fields: [
        {
          name: 'sizeFrac',
          type: 'number',
          defaultValue: d.LANDING.SIZE_FRAC,
          min: 0.1,
          max: 0.9,
          admin: { description: 'Landed height as a fraction of viewport height, desktop.' },
        },
        {
          name: 'mobileSizeFrac',
          type: 'number',
          defaultValue: d.LANDING.MOBILE_SIZE_FRAC,
          min: 0.1,
          max: 0.9,
          admin: { description: 'The same, portrait (under 640px wide).' },
        },
        {
          name: 'xFrac',
          type: 'number',
          defaultValue: d.LANDING.X_FRAC,
          min: 0,
          max: 1,
          admin: { description: 'Landed centre across the viewport, desktop. 0.75 is right of centre.' },
        },
        {
          name: 'yFrac',
          type: 'number',
          defaultValue: d.LANDING.Y_FRAC,
          min: 0,
          max: 1,
          admin: { description: 'Landed centre down the viewport, desktop.' },
        },
        {
          name: 'mobileXFrac',
          type: 'number',
          defaultValue: d.LANDING.MOBILE_X_FRAC,
          min: 0,
          max: 1,
          admin: { description: 'Portrait: centred, sitting high in the frame.' },
        },
        {
          name: 'mobileYFrac',
          type: 'number',
          defaultValue: d.LANDING.MOBILE_Y_FRAC,
          min: 0,
          max: 1,
          admin: {
            description:
              'Portrait height. Lowering this pushes SAMSARA down into whatever Section 2 renders below it.',
          },
        },
        {
          name: 'hoverBobPx',
          type: 'number',
          defaultValue: d.LANDING.HOVER_BOB_PX,
          min: 0,
          max: 60,
          admin: { description: 'Idle float once landed. 0 parks it perfectly still.' },
        },
        {
          name: 'hoverBobMs',
          type: 'number',
          defaultValue: d.LANDING.HOVER_BOB_MS,
          min: 400,
          max: 8000,
          admin: { description: 'One full bob, up and back.' },
        },
        {
          name: 'rotXDeg',
          type: 'number',
          defaultValue: d.LANDING.ROT_X_DEG,
          min: -90,
          max: 90,
          admin: {
            description:
              'Where the face points once landed — pitch. 0/0/0 is frontal and level. Drag SAMSARA directly at /dev/samsara to find an angle, rather than guessing here.',
          },
        },
        {
          name: 'rotYDeg',
          type: 'number',
          defaultValue: d.LANDING.ROT_Y_DEG,
          min: -180,
          max: 180,
          admin: { description: 'Yaw. This is the one that turns the face toward or away from the visitor.' },
        },
        {
          name: 'rotZDeg',
          type: 'number',
          defaultValue: d.LANDING.ROT_Z_DEG,
          min: -90,
          max: 90,
          admin: { description: 'Roll — the head tilt.' },
        },
      ],
    },

    {
      name: 'room',
      type: 'group',
      label: 'Room — the dark space SAMSARA lands in',
      admin: {
        description:
          'Graphite on black: the Atelier drawing language inverted. The Section 2 block reads the background colour from here too, so the DOM behind the 3D layer always matches.',
      },
      fields: [
        colour('bgColor', d.ROOM.BG_COLOR, 'Behind everything, and the page background of Section 2.'),
        colour('floorColor', d.ROOM.FLOOR_COLOR),
        colour('wallColor', d.ROOM.WALL_COLOR),
        colour('keyLightColor', d.ROOM.KEY_LIGHT_COLOR, 'The single shadow-casting light.'),
        {
          name: 'keyLightIntensity',
          type: 'number',
          defaultValue: d.ROOM.KEY_LIGHT_INTENSITY,
          min: 0,
          max: 8,
        },
        {
          name: 'ambientIntensity',
          type: 'number',
          defaultValue: d.ROOM.AMBIENT_INTENSITY,
          min: 0,
          max: 6,
          admin: { description: 'Fill light. Too much and the room stops reading as dark.' },
        },
        {
          name: 'fogDensity',
          type: 'number',
          defaultValue: d.ROOM.FOG_DENSITY,
          min: 0,
          max: 0.2,
          admin: {
            description:
              'Depth falloff on the room geometry. The scene is SHARED with the hero orbit, so this is not scene fog — it would tint the mascot while it is still circling the mark.',
          },
        },
        {
          name: 'cameraFovDeg',
          type: 'number',
          defaultValue: d.ROOM.CAMERA_FOV_DEG,
          min: 20,
          max: 100,
          admin: {
            description:
              'Changing this moves the camera to keep the landed size identical, so it changes how deep the room LOOKS rather than how big SAMSARA is.',
          },
        },
        {
          name: 'depth',
          type: 'number',
          defaultValue: d.ROOM.DEPTH,
          min: 10,
          max: 140,
          admin: { description: 'How far back the room runs. SAMSARA enters at the far wall.' },
        },
        colour(
          'mascotTintColor',
          d.ROOM.MASCOT_TINT_COLOR,
          'Warm bronze-brass. Inert while the strength below is 0.',
        ),
        {
          name: 'mascotTintStrength',
          type: 'number',
          defaultValue: d.ROOM.MASCOT_TINT_STRENGTH,
          min: 0,
          max: 1,
          admin: { description: 'How much of the tint colour is mixed into the body in the room.' },
        },
        {
          name: 'mascotRoughnessBoost',
          type: 'number',
          defaultValue: d.ROOM.MASCOT_ROUGHNESS_BOOST,
          min: 0,
          max: 1,
          admin: {
            description:
              'Pushes the metal from polished toward matte. Independent of the tint — they were coupled once, and turning the tint off silently killed this as well.',
          },
        },
        colour(
          'envColor',
          d.ROOM.ENV_COLOR,
          'What the metal REFLECTS. On a fully metallic surface this does most of the colouring, far more than the lights do.',
        ),
        {
          name: 'envIntensity',
          type: 'number',
          defaultValue: d.ROOM.ENV_INTENSITY,
          min: 0,
          max: 4,
        },
      ],
    },

    {
      name: 'drag',
      type: 'group',
      label: 'Drag — click and hold to turn SAMSARA',
      admin: { description: 'Only while landed. The hero orbit is never draggable.' },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: d.DRAG.ENABLED },
        {
          name: 'sensitivityDegPerPx',
          type: 'number',
          defaultValue: d.DRAG.SENSITIVITY_DEG_PER_PX,
          min: 0.05,
          max: 3,
        },
        {
          name: 'maxPitchDeg',
          type: 'number',
          defaultValue: d.DRAG.MAX_PITCH_DEG,
          min: 0,
          max: 180,
          admin: { description: 'How far up and down it can be turned before it stops.' },
        },
        {
          name: 'damping',
          type: 'number',
          defaultValue: d.DRAG.DAMPING,
          min: 0.001,
          max: 1,
          admin: { description: 'Spin kept per second after release. Lower stops it sooner.' },
        },
        {
          name: 'returnDelayMs',
          type: 'number',
          defaultValue: d.DRAG.RETURN_DELAY_MS,
          min: 0,
          max: 8000,
          admin: { description: 'Stillness before it springs back to the parked orientation.' },
        },
        {
          name: 'returnMs',
          type: 'number',
          defaultValue: d.DRAG.RETURN_MS,
          min: 100,
          max: 5000,
          admin: { description: 'How long that return takes.' },
        },
      ],
    },

    {
      name: 'idleEyes',
      type: 'group',
      label: 'Idle eyes — the face while it waits',
      admin: {
        description:
          'The room shows SAMSARA still and close, so this is a slow resting face rather than the hero orbit’s glance beat.',
      },
      fields: [
        {
          name: 'intervalMs',
          type: 'number',
          defaultValue: d.IDLE_EYES.INTERVAL_MS,
          min: 300,
          max: 12000,
          admin: { description: 'Between expression changes.' },
        },
        {
          name: 'smileShakePx',
          type: 'number',
          defaultValue: d.IDLE_EYES.SMILE_SHAKE_PX,
          min: 0,
          max: 40,
          admin: { description: 'The little shake when a visitor presses and holds. 0 turns it off.' },
        },
        {
          name: 'smileShakeMs',
          type: 'number',
          defaultValue: d.IDLE_EYES.SMILE_SHAKE_MS,
          min: 40,
          max: 900,
        },
        {
          name: 'holdExpression',
          type: 'select',
          defaultValue: d.IDLE_EYES.HOLD_EXPRESSION,
          admin: { description: 'What the face does while a visitor presses and holds it.' },
          options: Object.keys(d.IDLE_EYES.WEIGHTS).map((k) => ({ label: k, value: k })),
        },
        {
          name: 'weights',
          type: 'group',
          label: 'Expression frequency',
          admin: {
            description:
              'How often each is picked in the room. 0 removes it. The owner settled on a calm resting face — mostly neutral, an occasional blink — so most of these are 0 by design, not by oversight.',
          },
          // Max 40 against a top approved value of 15: the room's weights are a
          // different scale from the hero's (which top out at 2), and a ceiling
          // near the shipped value would stop the owner emphasising anything.
          fields: Object.entries(d.IDLE_EYES.WEIGHTS).map(([k, v]) => ({
            name: k,
            type: 'number' as const,
            defaultValue: v,
            min: 0,
            max: 40,
          })),
        },
      ],
    },

    {
      name: 'burst',
      type: 'group',
      label: 'Golden smoke — the bursts from behind the parked mascot',
      admin: {
        description:
          'Puffs of golden smoke shed from BEHIND SAMSARA once it has parked, on a timer. Distances are in body radii, not pixels, so it holds its scale relative to SAMSARA on every screen. Smoke reads as smoke because the puffs are FEW, LARGE, FAINT and EXPANDING — raising the count or the opacity turns it back into dust.',
      },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: d.BURST.ENABLED },
        {
          name: 'intervalMs',
          type: 'number',
          defaultValue: d.BURST.INTERVAL_MS,
          min: 400,
          max: 20000,
          admin: {
            description:
              'Between bursts. The first one waits a full interval after landing, so it does not arrive under the bounce and the settle.',
          },
        },
        {
          name: 'count',
          type: 'number',
          defaultValue: d.BURST.COUNT,
          min: 0,
          max: 400,
          admin: { description: 'Motes per burst. 0 is another way to turn it off.' },
        },
        {
          name: 'seconds',
          type: 'number',
          defaultValue: d.BURST.SECONDS,
          min: 0.2,
          max: 5,
          admin: { description: 'How long a mote lasts, before a per-mote spread of 0.7-1.3x.' },
        },
        {
          name: 'speed',
          type: 'number',
          defaultValue: d.BURST.SPEED,
          min: 0,
          max: 4,
          admin: { description: 'Outward speed, in body radii per second.' },
        },
        {
          name: 'growth',
          type: 'number',
          defaultValue: d.BURST.GROWTH,
          min: 0.2,
          max: 6,
          admin: {
            description:
              'How much each puff expands over its life. Above 1 it billows out as it fades, which is the strongest smoke cue; 1 holds a flat disc and below 1 it shrinks to a grain and reads as dust.',
          },
        },
        {
          name: 'swirl',
          type: 'number',
          defaultValue: d.BURST.SWIRL,
          min: 0,
          max: 3,
          admin: {
            description:
              'Lateral curl. Each puff drifts on its own slow wander, so the cloud folds instead of expanding as a clean ball. 0 makes it a tidy sphere.',
          },
        },
        {
          name: 'drag',
          type: 'number',
          defaultValue: d.BURST.DRAG,
          min: 0,
          max: 6,
          admin: {
            description:
              'How quickly motes slow down. 0 lets them fly on at full speed and leave the frame.',
          },
        },
        {
          name: 'rise',
          type: 'number',
          defaultValue: d.BURST.RISE,
          min: -2,
          max: 2,
          admin: { description: 'Upward drift. Negative makes the dust fall instead.' },
        },
        {
          name: 'spread',
          type: 'number',
          defaultValue: d.BURST.SPREAD,
          min: 0,
          max: 2,
          admin: { description: 'How far past the surface motes are born.' },
        },
        {
          name: 'backOffset',
          type: 'number',
          defaultValue: d.BURST.BACK_OFFSET,
          min: 0,
          max: 3,
          admin: {
            description:
              'How far BEHIND the body the burst starts. Larger hides the moment of birth better; 0 lets motes appear level with the silhouette.',
          },
        },
        {
          name: 'size',
          type: 'number',
          defaultValue: d.BURST.SIZE,
          min: 1,
          max: 180,
          admin: {
            description:
              'Puff size in px at birth, measured at SAMSARA’s own depth. Large is correct here — these overlap to make the volume.',
          },
        },
        {
          name: 'opacity',
          type: 'number',
          defaultValue: d.BURST.OPACITY,
          min: 0,
          max: 1,
        },
        {
          name: 'glow',
          type: 'number',
          defaultValue: d.BURST.GLOW,
          min: 0,
          max: 2,
          admin: {
            description:
              'How much of each puff is hot centre rather than body colour. Keep it low: a bright middle puts a visible grain back inside every puff.',
          },
        },
        colour('color', d.BURST.COLOR, 'The hero’s own gold, so the room reads as the same material.'),
        colour('coreColor', d.BURST.CORE_COLOR, 'The warmer centre of each puff.'),
      ],
    },

    {
      name: 'exitMs',
      type: 'number',
      defaultValue: d.EXIT_MS,
      min: 100,
      max: 4000,
      admin: {
        description:
          'Scrolling up from the room returns to the hero. A quick exit, deliberately NOT a rewind of the fall.',
      },
    },
  ],
}
