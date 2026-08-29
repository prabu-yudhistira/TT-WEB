import type { Field, GlobalConfig } from 'payload'
import { globalRevalidateHook } from '../lib/revalidate'

// Payload has no native colour field; validate a 6-digit hex string instead.
const hexColour = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? true
    : 'Use a 6-digit hex colour, e.g. #B4571C'

/**
 * One hex colour field, with a native colour picker rendered under the text
 * input. `afterInput` rather than a replacement `Field`, so Payload's own
 * label / description / validation / error rendering all stay stock — see
 * src/components/admin/ColourSwatch.tsx.
 *
 * Every colour on this global goes through here so none of them can drift
 * apart: a hex box with a swatch on one field and without on the next is the
 * kind of inconsistency that looks like a bug.
 */
const colourField = (
  name: string,
  defaultValue?: string,
  opts: { description?: string; required?: boolean } = {},
): Field => ({
  name,
  type: 'text',
  ...(defaultValue === undefined ? {} : { defaultValue }),
  ...(opts.required ? { required: true } : {}),
  validate: hexColour,
  admin: {
    ...(opts.description === undefined ? {} : { description: opts.description }),
    components: { afterInput: ['@/components/admin/ColourSwatch#ColourSwatch'] },
  },
})

/**
 * Physics and material settings for the hero logo: the hold-to-separate
 * interaction, and the electrical wireframe ignition that bridges the sketch
 * video and the rotating 3D logo.
 * NOT localized — identical in EN and ID (mostly numbers; the colour fields are
 * hex strings).
 * Ranges mirror the dev bench sliders at /[locale]/dev/shatter and
 * /[locale]/dev/ignition, and are enforced by Payload on the REST API as well
 * as in the admin UI.
 *
 * Ignition fields may be null on an existing install that has not been
 * reseeded — resolveIgnition() falls back to DEFAULT_IGNITION for every one of
 * them, so the effect runs correctly before anyone opens /admin. The mascot
 * fields behave the same way: resolveMascot() falls back to DEFAULT_MASCOT for
 * any that are null.
 */
export const HeroEffects: GlobalConfig = {
  slug: 'hero-effects',
  label: 'Hero Effects',
  access: { read: () => true },
  hooks: { afterChange: [globalRevalidateHook('hero-effects')] },
  fields: [
    {
      name: 'separationEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Lets visitors press and hold the logo to pull it apart. Turning this off keeps the glass look, hatching and light wash — it only disables the interaction.',
      },
    },
    {
      name: 'timing',
      type: 'group',
      admin: { description: 'How long the charge and the reassembly take' },
      fields: [
        { name: 'chargeMs', type: 'number', defaultValue: 950, min: 300, max: 4000 },
        { name: 'reformMs', type: 'number', defaultValue: 2500, min: 100, max: 2500 },
        {
          name: 'separateStart',
          type: 'number',
          defaultValue: 0.65,
          min: 0,
          max: 0.9,
          admin: { description: 'Fraction of the charge that passes before anything moves' },
        },
        { name: 'staggerMax', type: 'number', defaultValue: 0.2, min: 0, max: 0.5 },
      ],
    },
    {
      name: 'motion',
      type: 'group',
      admin: { description: 'How far and how the six faces travel' },
      fields: [
        {
          name: 'spreadFrac',
          type: 'number',
          defaultValue: 1.6,
          min: 0,
          max: 2,
          admin: {
            description:
              'Drift distance as a multiple of logo height. Above ~1.0 the faces leave the screen before you can watch them.',
          },
        },
        { name: 'spreadVar', type: 'number', defaultValue: 0.8, min: 0, max: 0.9 },
        { name: 'lateralDrift', type: 'number', defaultValue: 0.75, min: 0, max: 1.5 },
        { name: 'spinMin', type: 'number', defaultValue: 0.18, min: 0, max: 1 },
        { name: 'spinMax', type: 'number', defaultValue: 0.21, min: 0, max: 1.5 },
        {
          name: 'capNormalMin',
          type: 'number',
          defaultValue: 0.79,
          min: 0.5,
          max: 0.99,
          admin: { description: 'Cutoff deciding whether a surface is a flat face or a side wall' },
        },
      ],
    },
    {
      name: 'material',
      type: 'group',
      admin: { description: 'Pencil hatching and the sweeping light wash' },
      fields: [
        { name: 'normalFollow', type: 'number', defaultValue: 0.55, min: 0, max: 1 },
        { name: 'hatchStrength', type: 'number', defaultValue: 0.65, min: 0, max: 1 },
        {
          name: 'hatchScale',
          type: 'number',
          defaultValue: 0.5,
          min: 0.5,
          max: 4,
          admin: { description: 'Higher = coarser strokes, lower = denser' },
        },
        { name: 'shineStrength', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
        { name: 'shineWidth', type: 'number', defaultValue: 0.05, min: 0.05, max: 1 },
        { name: 'shineSpeed', type: 'number', defaultValue: 0.9, min: 0, max: 3 },
        { name: 'shineChargeBoost', type: 'number', defaultValue: 1, min: 0, max: 4 },
        colourField('shineWarm', '#B4571C', {
          description: 'Warm end of the light wash, 6-digit hex',
        }),
        colourField('shineBright', '#FFF8E0', {
          description: 'Hot end of the light wash, 6-digit hex',
        }),
      ],
    },
    {
      name: 'body',
      type: 'group',
      admin: { description: 'The glass skin and the ghost logo left behind' },
      fields: [
        {
          name: 'skinOpacity',
          type: 'number',
          defaultValue: 0.6,
          min: 0.05,
          max: 1,
          admin: {
            description:
              'Below ~0.5 the black and red wash out against the paper background.',
          },
        },
        {
          name: 'bodyOpacity',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 1,
          admin: { description: 'At 0 only the wireframe outline of the ghost logo is drawn' },
        },
        { name: 'bodyEdgeOpacity', type: 'number', defaultValue: 0.9, min: 0, max: 1 },
        {
          name: 'bodyEdgeAngle',
          type: 'number',
          defaultValue: 26,
          min: 1,
          max: 60,
          admin: { description: 'Degrees. Lower draws more edges and gets noisy quickly.' },
        },
      ],
    },
    {
      name: 'feel',
      type: 'group',
      admin: { description: 'Shake while charging, and drag sensitivity' },
      fields: [
        { name: 'vibrateFrac', type: 'number', defaultValue: 0.006, min: 0, max: 0.05 },
        { name: 'vibratePhaseStep', type: 'number', defaultValue: 1.1, min: 0, max: 3 },
        {
          name: 'dragThresholdPx',
          type: 'number',
          defaultValue: 6,
          min: 2,
          max: 20,
          admin: { description: 'Pointer travel that turns a hold into a drag' },
        },
      ],
    },
    {
      name: 'ignitionEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Plays the electrical wireframe transition between the sketch video and the rotating 3D logo. Turning this off restores the plain crossfade.',
      },
    },
    {
      name: 'ignitionTiming',
      type: 'group',
      label: 'Ignition — timing',
      admin: {
        description:
          'Total length, and the phase boundaries as fractions of it. Changing the duration retimes everything proportionally.',
      },
      fields: [
        {
          name: 'ignitionMs',
          type: 'number',
          defaultValue: 2000,
          min: 600,
          max: 4000,
          admin: { description: 'Total length of the transition. The main pacing control.' },
        },
        {
          name: 'seedEnd',
          type: 'number',
          defaultValue: 0.12,
          min: 0,
          max: 0.5,
          admin: { description: 'Fraction where the core bloom ends and the front starts moving' },
        },
        {
          name: 'frontEnd',
          type: 'number',
          defaultValue: 0.78,
          min: 0.2,
          max: 1,
          admin: { description: 'Fraction where the charge front finishes crossing the logo' },
        },
        {
          name: 'cueFrac',
          type: 'number',
          defaultValue: 0.73,
          min: 0.1,
          max: 1,
          admin: { description: 'Fraction where the floating words / orbs are told to enter' },
        },
      ],
    },
    {
      name: 'ignitionShape',
      type: 'group',
      label: 'Ignition — shape',
      admin: { description: 'Where the charge starts and how wide its crest is' },
      fields: [
        { name: 'seedOffsetX', type: 'number', defaultValue: 0, min: -1, max: 1 },
        { name: 'seedOffsetY', type: 'number', defaultValue: 0, min: -1, max: 1 },
        { name: 'seedOffsetZ', type: 'number', defaultValue: 0, min: -1, max: 1 },
        {
          name: 'frontSoftness',
          type: 'number',
          defaultValue: 0.18,
          min: 0.02,
          max: 1,
          admin: { description: 'Width of the glowing crest, as a fraction of logo height' },
        },
        {
          name: 'wakeLag',
          type: 'number',
          defaultValue: 0.1,
          min: 0,
          max: 0.6,
          admin: { description: 'How far behind the crest the solid surfaces appear' },
        },
        { name: 'coreRadius', type: 'number', defaultValue: 0.22, min: 0, max: 1 },
        { name: 'coreStrength', type: 'number', defaultValue: 1, min: 0, max: 2 },
      ],
    },
    {
      name: 'ignitionCage',
      type: 'group',
      label: 'Ignition — cage',
      admin: { description: 'The scribble wireframe that carries the charge' },
      fields: [
        {
          name: 'cageDensity',
          type: 'number',
          defaultValue: 0.3,
          min: 0.05,
          max: 1,
          admin: {
            description:
              'Fraction of wireframe lines drawn. At 1 it looks like CAD; lower reads as pencil scribble.',
          },
        },
        {
          name: 'cageDensityMobile',
          type: 'number',
          defaultValue: 0.3,
          min: 0.05,
          max: 1,
          admin: { description: 'Same, on screens below 640px' },
        },
        { name: 'cageOpacity', type: 'number', defaultValue: 0.26, min: 0, max: 1 },
        {
          name: 'cageSeed',
          type: 'number',
          defaultValue: 1337,
          min: 0,
          max: 999999,
          admin: {
            description: 'Changes which lines are drawn. Same number = same cage every load.',
          },
        },
      ],
    },
    {
      name: 'ignitionColor',
      type: 'group',
      label: 'Ignition — colour',
      admin: { description: 'The graphite-to-hot ramp, and the dark mass that makes red readable' },
      fields: [
        colourField('coldColor', '#2B2A27', {
          description: 'Unlit cage — matches the pencil in the sketch video',
        }),
        colourField('warmColor', '#8E1114'),
        colourField('hotColor', '#C8341A'),
        colourField('crestColor', '#FFF8E0', {
          description: 'The very peak of the charge. Kept small and brief.',
        }),
        {
          name: 'darkMassOpacity',
          type: 'number',
          defaultValue: 0.12,
          min: 0,
          max: 0.6,
          admin: {
            description:
              'Faint dark fill shown only during the transition. Without it the red washes out against the paper background.',
          },
        },
        { name: 'glowDecay', type: 'number', defaultValue: 2.4, min: 0.2, max: 8 },
      ],
    },
    {
      name: 'ignitionOverlay',
      type: 'group',
      label: 'Ignition — cage overlay',
      admin: {
        description:
          'The cage appears over the still-drawing sketch video as a sphere, blooms outward into a polygon, then collapses into the logo shape.',
      },
      fields: [
        {
          name: 'overlayEnabled',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'Turning this off starts the transition at the video cut instead, with no sphere beforehand.',
          },
        },
        {
          name: 'overlayLeadMs',
          type: 'number',
          defaultValue: 1000,
          min: 200,
          max: 4000,
          admin: { description: 'How long before the video ends the sphere appears' },
        },
        {
          name: 'sphereScale',
          type: 'number',
          defaultValue: 1,
          min: 1,
          max: 3,
          admin: { description: 'Starting sphere size, as a multiple of the logo' },
        },
        {
          name: 'bloomScale',
          type: 'number',
          defaultValue: 1.1,
          min: 1,
          max: 4,
          admin: {
            description:
              "The cage's TOTAL size when fully bloomed, as a multiple of the logo — measured corner to corner. Both this and the sphere are measured against the logo, so this number IS the final size rather than a multiplier on the sphere. Anything below the sphere size is raised to it.",
          },
        },
        {
          name: 'polySides',
          type: 'number',
          defaultValue: 8,
          min: 3,
          max: 16,
          admin: { description: 'Shape it blooms into. 8 is an octagon, 6 a hexagon.' },
        },
        { name: 'bloomStart', type: 'number', defaultValue: 0.15, min: 0, max: 1 },
        { name: 'bloomEnd', type: 'number', defaultValue: 0.6, min: 0, max: 1 },
        {
          name: 'morphStart',
          type: 'number',
          defaultValue: 0.6,
          min: 0,
          max: 1,
          admin: { description: 'When the bloomed shape starts collapsing into the logo' },
        },
      ],
    },
    {
      name: 'ignitionPulse',
      type: 'group',
      label: 'Ignition — hold pulses',
      admin: { description: 'Re-ignites while a visitor holds the logo and its skin peels away' },
      fields: [
        { name: 'pulseEnabled', type: 'checkbox', defaultValue: true },
        {
          name: 'pulseMs',
          type: 'number',
          defaultValue: 2500,
          min: 200,
          max: 4000,
          admin: { description: 'Length of one pulse, and the gap before the next' },
        },
      ],
    },
    {
      name: 'ignitionLife',
      type: 'group',
      label: 'Ignition — wires and sparks',
      admin: { description: 'How much the cage writhes, and how it crackles' },
      fields: [
        {
          name: 'wireJitter',
          type: 'number',
          defaultValue: 0.07,
          min: 0,
          max: 0.3,
          admin: { description: 'How far the wires drift, as a fraction of the logo radius' },
        },
        { name: 'wireSpeed', type: 'number', defaultValue: 6, min: 0, max: 6 },
        {
          name: 'sparkStagger',
          type: 'number',
          defaultValue: 0.215,
          min: 0,
          max: 0.5,
          admin: { description: 'Randomness in the charge front. 0 gives a clean, even ring.' },
        },
        { name: 'sparkRate', type: 'number', defaultValue: 2.3, min: 0, max: 10 },
        {
          name: 'sparkDensity',
          type: 'number',
          defaultValue: 0.19,
          min: 0,
          max: 0.9,
          admin: { description: 'How many wires are lit at once. High values wash out.' },
        },
        {
          name: 'sparkIdle',
          type: 'number',
          defaultValue: 0.25,
          min: 0,
          max: 1,
          admin: { description: 'Sparking while the cage is still cold, over the video' },
        },
      ],
    },
    {
      name: 'ignitionEmbers',
      type: 'group',
      label: 'Ignition — ember dots',
      admin: { description: 'Glowing particles at the cage junctions' },
      fields: [
        { name: 'emberEnabled', type: 'checkbox', defaultValue: true },
        {
          name: 'emberDensity',
          type: 'number',
          defaultValue: 0.39,
          min: 0,
          max: 1,
          admin: { description: 'Fraction of cage junctions that carry an ember' },
        },
        { name: 'emberSize', type: 'number', defaultValue: 5, min: 0.5, max: 20 },
        { name: 'emberTwinkle', type: 'number', defaultValue: 2.5, min: 0, max: 12 },
        { name: 'emberOpacity', type: 'number', defaultValue: 0.95, min: 0, max: 1 },
      ],
    },
    {
      name: 'satellitesEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Coloured spheres orbiting the logo, each carrying one of the hero words. Turning this off removes them entirely — the hero keeps the logo, the video and the headline.',
      },
    },
    {
      name: 'satelliteField',
      type: 'group',
      label: 'Satellites — field',
      admin: { description: 'Where the belt sits relative to the mark' },
      fields: [
        {
          name: 'innerRadius',
          type: 'number',
          defaultValue: 3,
          min: 0.4,
          max: 6,
          admin: { description: 'Orbit floor, as a multiple of the logo’s on-screen half-height' },
        },
        {
          name: 'outerRadius',
          type: 'number',
          defaultValue: 1.6,
          min: 0.2,
          max: 3,
          admin: {
            description:
              'Reference radius, as a fraction of half the viewport’s smaller side. Satellites orbit inside a band of this — see “band inner/outer” below.',
          },
        },
        { name: 'mobileInnerRadius', type: 'number', defaultValue: 1.5, min: 0.4, max: 6 },
        {
          name: 'mobileOuterRadius',
          type: 'number',
          defaultValue: 0.78,
          min: 0.2,
          max: 3,
          admin: {
            description:
              'Used below 640px. The desktop value leaves only about half the belt on a portrait screen.',
          },
        },
        {
          name: 'tilt',
          type: 'number',
          defaultValue: 20,
          min: 0,
          max: 90,
          admin: { description: 'Inclination in degrees. 0 is edge-on, 90 is face-on.' },
        },
        { name: 'tiltSideway', type: 'number', defaultValue: 160, min: 0, max: 360 },
        {
          name: 'perspective',
          type: 'number',
          defaultValue: 1300,
          min: 300,
          max: 4000,
          admin: { description: 'Lower is a stronger perspective' },
        },
      ],
    },
    {
      name: 'satelliteMotion',
      type: 'group',
      label: 'Satellites — motion',
      fields: [
        { name: 'orbitSpeed', type: 'number', defaultValue: 2.2, min: 0, max: 20 },
        {
          name: 'orbitCcw',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Counter-clockwise on screen. Off runs them clockwise.' },
        },
        { name: 'speedScale', type: 'number', defaultValue: 0.8, min: 0.1, max: 3 },
        {
          name: 'trail',
          type: 'number',
          defaultValue: 42,
          min: 0,
          max: 50,
          admin: { description: '0 leaves no trail, 50 is the longest streak' },
        },
      ],
    },
    {
      name: 'satelliteLook',
      type: 'group',
      label: 'Satellites — look',
      fields: [
        { name: 'size', type: 'number', defaultValue: 4, min: 1, max: 40 },
        { name: 'alpha', type: 'number', defaultValue: 0.95, min: 0.05, max: 1 },
        {
          name: 'shade',
          type: 'number',
          defaultValue: 1,
          min: 0,
          max: 1,
          admin: { description: '0 is a flat disc, 1 is a fully modelled sphere' },
        },
        {
          name: 'depthScale',
          type: 'number',
          defaultValue: 0.9,
          min: 0,
          max: 2,
          admin: { description: 'Extra near/far size difference beyond the perspective divide' },
        },
        { name: 'streak', type: 'number', defaultValue: 1, min: 0, max: 1 },
        {
          name: 'ring',
          type: 'number',
          defaultValue: 1.1,
          min: 0,
          max: 6,
          admin: { description: 'Outline radius as a multiple of the sphere. 0 removes it.' },
        },
        {
          name: 'bandInner',
          type: 'number',
          defaultValue: 0.5,
          min: 0.1,
          max: 1.4,
          admin: { description: 'Innermost satellite orbit, as a fraction of the outer radius' },
        },
        { name: 'bandOuter', type: 'number', defaultValue: 0.8, min: 0.1, max: 1.4 },
        {
          name: 'tiltSpread',
          type: 'number',
          defaultValue: 15,
          min: 0,
          max: 120,
          admin: {
            description:
              'Per-satellite inclination variation, in degrees. 0 is one shared plane.',
          },
        },
        colourField('baseColor', '#8E1114', {
          description: 'Used for any satellite the colour list below does not cover',
        }),
      ],
    },
    {
      name: 'satelliteColors',
      type: 'array',
      label: 'Satellites — colours, in orbit order',
      admin: {
        description:
          'Colour belongs to the ORBIT SLOT, not to the word: the first row colours the first satellite regardless of which word it carries, and regardless of language. Reordering the hero words does NOT reorder these. Extra rows are ignored; satellites past the last row use the base colour above.',
      },
      fields: [colourField('color', undefined, { required: true })],
    },
    {
      name: 'satelliteLabels',
      type: 'group',
      label: 'Satellites — words',
      admin: {
        description:
          'The words themselves are the hero block’s “floating words” on the Home page, and the number of satellites follows that list.',
      },
      fields: [
        {
          name: 'mode',
          type: 'select',
          defaultValue: 'always',
          options: [
            { label: 'Always visible', value: 'always' },
            { label: 'On hover (nearest)', value: 'hover' },
            { label: 'Hidden', value: 'none' },
          ],
        },
        { name: 'size', type: 'number', defaultValue: 12, min: 8, max: 32 },
        colourField('color', '#2B2A27'),
        { name: 'offset', type: 'number', defaultValue: 14, min: 0, max: 60 },
        { name: 'hoverRadius', type: 'number', defaultValue: 90, min: 20, max: 300 },
      ],
    },
    {
      name: 'satelliteHold',
      type: 'group',
      label: 'Satellites — press and hold',
      admin: {
        description:
          'What the satellites do while a visitor holds the logo. Shares the same gesture as the hold-to-separate effect above.',
      },
      fields: [
        {
          name: 'freeze',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Stop orbiting and tremble in place while the logo is held' },
        },
        { name: 'shakePx', type: 'number', defaultValue: 3, min: 0, max: 40 },
        { name: 'shakeSpeed', type: 'number', defaultValue: 1.1, min: 0.1, max: 4 },
      ],
    },
    {
      name: 'satelliteBehaviour',
      type: 'group',
      label: 'Satellites — behaviour',
      fields: [
        { name: 'entranceMs', type: 'number', defaultValue: 1600, min: 0, max: 5000 },
        {
          name: 'scrollFadeVh',
          type: 'number',
          defaultValue: 0.6,
          min: 0,
          max: 3,
          admin: {
            description: 'Screens of scrolling over which the field dissolves. 0 never fades.',
          },
        },
        {
          name: 'seed',
          type: 'number',
          defaultValue: 20260826,
          admin: { description: 'Changing this reshuffles the starting arrangement' },
        },
      ],
    },

    // ── Mascot ──────────────────────────────────────────────────────
    // A single hard-coded brass object orbiting the satellites' belt. Shares
    // the satellites' orbital plane (tilt/roll/direction) — those are NOT
    // repeated here, so it cannot be desynced from the belt. Read by
    // resolveMascot(); every field falls back to DEFAULT_MASCOT when null on an
    // install that has not been reseeded. Ranges are strictly WIDER than the
    // owner-approved defaults, and mirror the /dev/mascot bench sliders.
    {
      name: 'mascotEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'A single brass mascot orbiting the logo alongside the satellites, trailing gold dust and carrying its own word. Turning this off removes it entirely — nothing else in the hero changes.',
      },
    },
    {
      name: 'mascotLabelText',
      type: 'text',
      defaultValue: 'SAMSARA',
      admin: {
        description:
          'The mascot’s word. NOT one of the hero “floating words” — those are localized and their count drives the satellites; this is the mascot’s own fixed name, shown identically in both languages.',
      },
    },
    {
      name: 'mascotOrbit',
      type: 'group',
      label: 'Mascot — orbit',
      admin: {
        description:
          'The mascot shares the satellites’ orbital plane (tilt, roll, direction). These are its own place within it.',
      },
      fields: [
        {
          name: 'radius',
          type: 'number',
          defaultValue: 0.71,
          min: 0.3,
          max: 2.5,
          admin: {
            description:
              'As a fraction of the satellites’ outer radius. The bead band is 0.5–0.8.',
          },
        },
        { name: 'mobileRadius', type: 'number', defaultValue: 0.55, min: 0.3, max: 2.5 },
        {
          name: 'height',
          type: 'number',
          defaultValue: 136,
          min: 20,
          max: 300,
          admin: {
            description:
              'How far the mascot rides above the belt plane, in px. Keep this well clear of 0 — it is what keeps the mascot reading as nearer than the beads it passes.',
          },
        },
        { name: 'tiltOffset', type: 'number', defaultValue: 0, min: -60, max: 60 },
        {
          name: 'phase',
          type: 'number',
          defaultValue: 88,
          min: 0,
          max: 360,
          admin: { description: 'Starting angle on the orbit, degrees' },
        },
        {
          name: 'speedScale',
          type: 'number',
          defaultValue: 0.52,
          min: 0,
          max: 3,
          admin: { description: 'Orbit speed as a multiple of the satellites’ orbit speed' },
        },
      ],
    },
    {
      name: 'mascotLook',
      type: 'group',
      label: 'Mascot — size & look',
      fields: [
        {
          name: 'size',
          type: 'number',
          defaultValue: 28,
          min: 20,
          max: 420,
          admin: { description: 'On-screen diameter in px at zero depth' },
        },
        { name: 'mobileSize', type: 'number', defaultValue: 18, min: 16, max: 300 },
        {
          name: 'depthScale',
          type: 'number',
          defaultValue: 0.3,
          min: 0,
          max: 3,
          admin: {
            description:
              'Extra near/far size difference beyond the perspective divide. NOT the satellites’ 0.9 — that value is tuned for 4px beads.',
          },
        },
        { name: 'opacity', type: 'number', defaultValue: 1, min: 0.05, max: 1 },
        {
          name: 'envIntensity',
          type: 'number',
          defaultValue: 1,
          min: 0,
          max: 4,
          admin: { description: 'Reflection strength. Brass is fully metallic — at 0 it goes black.' },
        },
        { name: 'lightIntensity', type: 'number', defaultValue: 1.5, min: 0, max: 6 },
      ],
    },
    {
      name: 'mascotSpin',
      type: 'group',
      label: 'Mascot — spin',
      fields: [
        {
          name: 'spinSpeed',
          type: 'number',
          defaultValue: 113,
          min: -180,
          max: 180,
          admin: { description: 'Degrees per second, independent of the orbit' },
        },
        { name: 'spinTilt', type: 'number', defaultValue: 12, min: -90, max: 90 },
        {
          name: 'bobPx',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 80,
          admin: { description: 'Slow vertical float on top of the orbit' },
        },
        { name: 'bobSeconds', type: 'number', defaultValue: 8.8, min: 0.5, max: 20 },
      ],
    },
    {
      name: 'mascotTrail',
      type: 'group',
      label: 'Mascot — gold dust trail',
      admin: {
        description:
          'A shed particle field. Additive blending is a deliberate choice — the dust colour is picked bright to suit it.',
      },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        {
          name: 'seconds',
          type: 'number',
          defaultValue: 1.4,
          min: 0.05,
          max: 5,
          admin: { description: 'How long each mote lives' },
        },
        {
          name: 'density',
          type: 'number',
          defaultValue: 130,
          min: 0,
          max: 400,
          admin: { description: 'Motes per second' },
        },
        {
          name: 'size',
          type: 'number',
          defaultValue: 10,
          min: 1,
          max: 40,
          admin: { description: 'Mote diameter in px' },
        },
        {
          name: 'spread',
          type: 'number',
          defaultValue: 6.5,
          min: 0,
          max: 60,
          admin: { description: 'Random scatter at emission, px' },
        },
        {
          name: 'drift',
          type: 'number',
          defaultValue: 25,
          min: 0,
          max: 160,
          admin: { description: 'How fast motes drift off the path, px/sec' },
        },
        {
          name: 'glow',
          type: 'number',
          defaultValue: 0.95,
          min: 0,
          max: 1,
          admin: { description: 'Hot-core strength' },
        },
        { name: 'twinkle', type: 'number', defaultValue: 0.45, min: 0, max: 1 },
        { name: 'opacity', type: 'number', defaultValue: 0.75, min: 0, max: 1 },
        {
          name: 'additive',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Additive blending. Off is slightly more saturated on the paper.' },
        },
        colourField('color', '#FDB721', { description: 'The saturated body of each mote' }),
        colourField('coreColor', '#FFFCD6', { description: 'The bright centre of each mote' }),
      ],
    },
    {
      name: 'mascotLabel',
      type: 'group',
      label: 'Mascot — word',
      admin: {
        description:
          'The word’s text is set above (“mascot label text”). These control how it looks.',
      },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        { name: 'size', type: 'number', defaultValue: 12, min: 8, max: 40 },
        colourField('color', '#2B2A27'),
        {
          name: 'offset',
          type: 'number',
          defaultValue: 14,
          min: 0,
          max: 80,
          admin: { description: 'Gap from the mascot’s edge, px' },
        },
        {
          name: 'halo',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 6,
          admin: {
            description:
              'Paper-coloured halo behind the word, px. Fixes the word going illegible where it crosses the mark’s red stroke. 0 is off.',
          },
        },
      ],
    },
    {
      name: 'mascotHold',
      type: 'group',
      label: 'Mascot — press and hold',
      admin: {
        description:
          'Shares the same gesture as the hold-to-separate effect. Freeze + tremble in place while the logo is held.',
      },
      fields: [
        { name: 'freeze', type: 'checkbox', defaultValue: true },
        { name: 'shakePx', type: 'number', defaultValue: 1.5, min: 0, max: 40 },
        { name: 'shakeSpeed', type: 'number', defaultValue: 1, min: 0.1, max: 4 },
      ],
    },
    {
      name: 'mascotBehaviour',
      type: 'group',
      label: 'Mascot — behaviour',
      fields: [
        { name: 'entranceMs', type: 'number', defaultValue: 1600, min: 0, max: 5000 },
        {
          name: 'scrollFadeVh',
          type: 'number',
          defaultValue: 0.6,
          min: 0,
          max: 3,
          admin: {
            description:
              'Screens of scrolling over which the mascot dissolves. 0 never fades.',
          },
        },
      ],
    },

    // ── mascot eyes ──────────────────────────────────────────────────
    // The animated LED face. Owner-tuned on screen 2026-08-28 and mapped by
    // resolveMascotEyes(); every field falls back to DEFAULT_MASCOT_EYES when
    // null on an unsaved global.
    //
    // The 14 expression SHAPES are deliberately NOT here — they are frozen in
    // src/lib/mascot/eyes.ts. Tuning them blind in a form is not a workflow
    // anyone can succeed at; the bench at /dev/mascot is the tool for that.
    {
      name: 'mascotEyesEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'The mascot’s animated LED face. Turning this off restores its original painted eyes exactly — no socket darkening, no display. The expression shapes are not editable here: they were tuned on screen and are frozen in code, so changing one is a code change.',
      },
    },
    {
      name: 'mascotEyesLook',
      type: 'group',
      label: 'Mascot eyes — look',
      fields: [
        colourField('color', '#F2A81C', {
          description:
            'The lit eye. Amber rather than the reference’s cyan, so the hero keeps one warm accent instead of gaining a second, cold one.',
        }),
        colourField('coreColor', '#FFF0BE', { description: 'Hot centre of the eye.' }),
        colourField('socketColor', '#000000', {
          description:
            'Darkening over the faceplate. It exists to cover the mascot’s own PAINTED amber ovals — lighten it and the old eyes show through around the new ones.',
        }),
        { name: 'glow', type: 'number', defaultValue: 0.55, min: 0, max: 2 },
        {
          name: 'gap',
          type: 'number',
          defaultValue: 0.38,
          min: 0,
          max: 0.9,
          admin: { description: 'Half-distance between the two eyes.' },
        },
        {
          name: 'socketSpan',
          type: 'number',
          defaultValue: 1.34,
          min: 0.3,
          max: 2.5,
          admin: {
            description:
              'How far the darkening reaches. ⚠️ Anything drawn past this is CUT with a hard edge, not faded, and at 1.34 there is no headroom left — one expression already reaches 1.35. Raise this, never lower it.',
          },
        },
      ],
    },
    {
      name: 'mascotEyesScanlines',
      type: 'group',
      label: 'Mascot eyes — scanlines',
      fields: [
        { name: 'max', type: 'number', defaultValue: 9, min: 0, max: 20 },
        {
          name: 'minBodyPx',
          type: 'number',
          defaultValue: 44,
          min: 0,
          max: 200,
          admin: {
            description:
              'Body size below which scanlines are off. Deliberately above the mascot’s 28px base, so they appear only as it swings near — 7 lines over an 18px eye is moire, not texture.',
          },
        },
        { name: 'ramp', type: 'number', defaultValue: 12, min: 1, max: 60 },
      ],
    },
    {
      name: 'mascotEyesBeat',
      type: 'group',
      label: 'Mascot eyes — beat',
      admin: {
        description:
          'The mascot plays ONE expression each time its face sweeps past the viewer, then returns to neutral. There is no idle timer and no cursor tracking — the face is only toward you about a quarter of each turn.',
      },
      fields: [
        { name: 'glanceSeconds', type: 'number', defaultValue: 0.6, min: 0.1, max: 3 },
        {
          name: 'glancePeak',
          type: 'number',
          defaultValue: 0.45,
          min: 0.05,
          max: 0.95,
          admin: { description: 'Where in the glance the expression peaks.' },
        },
        {
          name: 'facingThreshold',
          type: 'number',
          defaultValue: 0.3,
          min: -0.5,
          max: 0.95,
          admin: { description: 'How square-on the face must be to count as facing you.' },
        },
        {
          name: 'chargeCrossover',
          type: 'number',
          defaultValue: 0.7,
          min: 0.05,
          max: 0.95,
          admin: {
            description:
              'While the mark is held: the eyes widen, then squeeze shut past this point.',
          },
        },
        { name: 'noRepeat', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'mascotEyesWeights',
      type: 'group',
      label: 'Mascot eyes — expression frequency',
      admin: {
        description:
          'How often each expression is picked. 0 removes it entirely. “Neutral” is the resting face and “wide” belongs to the press-and-hold reaction, so both are 0 here by design.',
      },
      fields: [
        { name: 'neutral', type: 'number', defaultValue: 0, min: 0, max: 4 },
        { name: 'blink', type: 'number', defaultValue: 2, min: 0, max: 4 },
        { name: 'squint', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'wide', type: 'number', defaultValue: 0, min: 0, max: 4 },
        { name: 'happy', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookLeft', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookRight', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookUp', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookDown', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookUpLeft', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookUpRight', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookDownLeft', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookDownRight', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'wink', type: 'number', defaultValue: 1, min: 0, max: 4 },
      ],
    },
  ],
}
