/**
 * Fallback / clamp / round-trip for the SAMSARA sequence resolver, plus the
 * headroom audit for the global's own numeric ranges.
 * Run: npm run verify:config
 * Mirrors src/lib/mascot/resolveMascotEyes.check.ts.
 */
import type { Field } from 'payload'
import { SamsaraSequence } from '../../globals/SamsaraSequence'
import { DEFAULT_SEQUENCE, type SequenceConfig } from './types'
import { resolveSamsara, toSamsaraPayload } from './resolveSamsara'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_SEQUENCE

// ── nothing saved -> the frozen defaults, exactly ────────────────────
//
// Not a formality: the global is brand new, so on every existing install and
// on every fresh clone this is the code path that actually runs until someone
// opens /admin and presses save.
check('null cms -> defaults', JSON.stringify(resolveSamsara(null)) === JSON.stringify(d))
check(
  'undefined cms -> defaults',
  JSON.stringify(resolveSamsara(undefined)) === JSON.stringify(d),
)
check('empty object -> defaults', JSON.stringify(resolveSamsara({})) === JSON.stringify(d))

// A group that exists but is empty is a DIFFERENT shape from a missing one,
// and it is what Payload returns for a group whose fields were never filled.
check(
  'empty groups -> defaults',
  JSON.stringify(
    resolveSamsara({ gestures: {}, transit: {}, landing: {}, room: {}, drag: {}, idleEyes: {} }),
  ) === JSON.stringify(d),
)

// ── junk does not reach the engine ───────────────────────────────────
{
  const r = resolveSamsara({
    gestures: { beatsToCommit: null, wheelThreshold: Number.NaN },
    room: { bgColor: 'not-a-hex', keyLightIntensity: null },
    landing: { sizeFrac: null },
  })
  check('null number falls back', r.GESTURES.BEATS_TO_COMMIT === d.GESTURES.BEATS_TO_COMMIT)
  check('NaN falls back', r.GESTURES.WHEEL_THRESHOLD === d.GESTURES.WHEEL_THRESHOLD)
  check('malformed hex falls back', r.ROOM.BG_COLOR === d.ROOM.BG_COLOR)
}

// ── the arrays ───────────────────────────────────────────────────────
//
// Payload stores these as rows, so they arrive as [{value}] and can be short,
// long, or full of nulls. The engine indexes into them per beat and per
// bounce; a short array there is an undefined multiplied into a position.
{
  const r = resolveSamsara({ freeze: { shakePxPerBeat: [{ value: 40 }] } })
  check(
    'a short array keeps the default length',
    r.FREEZE.SHAKE_PX_PER_BEAT.length === d.FREEZE.SHAKE_PX_PER_BEAT.length,
  )
  check('and takes the saved value where it has one', r.FREEZE.SHAKE_PX_PER_BEAT[0] === 40)
  check(
    'and falls back past the end',
    r.FREEZE.SHAKE_PX_PER_BEAT[1] === d.FREEZE.SHAKE_PX_PER_BEAT[1],
  )

  const nulls = resolveSamsara({ transit: { bounceMs: [{ value: null }, { value: 200 }] } })
  check('a null row falls back', nulls.TRANSIT.BOUNCE_MS[0] === d.TRANSIT.BOUNCE_MS[0])
  check('a filled row is kept', nulls.TRANSIT.BOUNCE_MS[1] === 200)
}

// ── the weights ──────────────────────────────────────────────────────
{
  const r = resolveSamsara({ idleEyes: { weights: { happy: 3 } } })
  check('a given weight applies', r.IDLE_EYES.WEIGHTS.happy === 3)
  check(
    'a missing weight falls back rather than to 0',
    r.IDLE_EYES.WEIGHTS.neutral === d.IDLE_EYES.WEIGHTS.neutral,
  )
  const neg = resolveSamsara({ idleEyes: { weights: { happy: -5 } } })
  check('a negative weight clamps to 0', neg.IDLE_EYES.WEIGHTS.happy === 0)
}

// ── round trip ───────────────────────────────────────────────────────
//
// ⚠️ EVERY mapped field is perturbed to a non-default value first. Round-tripping
// defaults against themselves is the near-tautology the 2026-08-09 review caught
// in resolveSeparation.check.ts, and it passes against a resolver that ignores
// its input entirely.
{
  const perturbed: SequenceConfig = {
    ENABLED: false,
    GESTURES: {
      BEATS_TO_COMMIT: 4,
      WHEEL_THRESHOLD: 311,
      COOLDOWN_MS: 421,
      QUIET_MS: 137,
      TOUCH_THRESHOLD: 91,
    },
    FREEZE: {
      SHAKE_PX_PER_BEAT: [11, 22, 33],
      SHAKE_HZ: 13.5,
      CHARGE_PER_BEAT: [0.11, 0.55, 0.91],
    },
    TRANSIT: {
      HALF_ORBIT_MS: 777,
      FALL_MS: 888,
      BOUNCE_COUNT: 2,
      RESTITUTION: 0.42,
      BOUNCE_MS: [111, 222, 333],
      SETTLE_MS: 444,
    },
    LANDING: {
      SIZE_FRAC: 0.31,
      MOBILE_SIZE_FRAC: 0.27,
      X_FRAC: 0.61,
      Y_FRAC: 0.52,
      MOBILE_X_FRAC: 0.44,
      MOBILE_Y_FRAC: 0.22,
      HOVER_BOB_PX: 17,
      HOVER_BOB_MS: 3100,
      ROT_X_DEG: 11,
      ROT_Y_DEG: -21,
      ROT_Z_DEG: 6,
    },
    ROOM: {
      BG_COLOR: '#112233',
      FLOOR_COLOR: '#223344',
      WALL_COLOR: '#334455',
      KEY_LIGHT_COLOR: '#445566',
      KEY_LIGHT_INTENSITY: 3.1,
      AMBIENT_INTENSITY: 0.77,
      FOG_DENSITY: 0.061,
      CAMERA_FOV_DEG: 41,
      DEPTH: 33,
      MASCOT_TINT_COLOR: '#556677',
      MASCOT_TINT_STRENGTH: 0.61,
      MASCOT_ROUGHNESS_BOOST: 0.29,
      ENV_COLOR: '#667788',
      ENV_INTENSITY: 1.7,
      // ⚠️ NOT CMS-mapped, so like FACE_RADIUS in the eyes these must be the
      // DEFAULT here: a non-mapped field can only survive the round trip as
      // whatever the resolver hands back. Read from the defaults rather than
      // restated, because a literal copy here goes stale the moment the mesh
      // is re-measured — which is exactly what broke resolveMascotEyes.check
      // at the fifth socket pass.
      MASCOT_STRETCH_X: d.ROOM.MASCOT_STRETCH_X,
      MASCOT_STRETCH_Y: d.ROOM.MASCOT_STRETCH_Y,
    },
    DRAG: {
      ENABLED: false,
      SENSITIVITY_DEG_PER_PX: 0.71,
      MAX_PITCH_DEG: 41,
      DAMPING: 0.03,
      RETURN_DELAY_MS: 1700,
      RETURN_MS: 910,
    },
    IDLE_EYES: {
      WEIGHTS: Object.fromEntries(
        Object.keys(d.IDLE_EYES.WEIGHTS).map((k, i) => [k, (i % 5) + 1]),
      ),
      INTERVAL_MS: 3300,
      SMILE_SHAKE_PX: 14,
      SMILE_SHAKE_MS: 210,
      HOLD_EXPRESSION: 'wink',
    },
    BURST: {
      ENABLED: false,
      INTERVAL_MS: 2750,
      COUNT: 41,
      SECONDS: 3.3,
      SPEED: 1.4,
      GROWTH: 3.1,
      SWIRL: 0.91,
      DRAG: 0.6,
      RISE: 0.42,
      SPREAD: 0.61,
      BACK_OFFSET: 0.77,
      SIZE: 12,
      OPACITY: 0.44,
      GLOW: 0.31,
      COLOR: '#778899',
      CORE_COLOR: '#99AABB',
    },
    CHATBOX: { DELAY_MS: 1500, ENTER_MS: 620 },
    EXIT_MS: 1250,
  }

  // Nothing may be left at its default, or the round trip proves nothing about
  // that field. Cheap to assert and it catches a value copied from the frozen
  // config by mistake.
  const flat = (o: unknown, path = ''): [string, unknown][] =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.entries(o).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k))
      : [[path, o]]
  const NOT_MAPPED = ['ROOM.MASCOT_STRETCH_X', 'ROOM.MASCOT_STRETCH_Y']
  const same = flat(perturbed)
    .filter(([p, v]) => {
      const dv = flat(d).find(([q]) => q === p)?.[1]
      return JSON.stringify(v) === JSON.stringify(dv)
    })
    .map(([p]) => p)
    .filter((p) => !NOT_MAPPED.some((n) => p.startsWith(n)))
  check(`every mapped field is actually perturbed (${same.join(', ') || 'none left'})`, same.length === 0)

  const round = resolveSamsara(toSamsaraPayload(perturbed))
  for (const [path, want] of flat(perturbed)) {
    const got = flat(round).find(([q]) => q === path)?.[1]
    check(`round trip preserves ${path}`, JSON.stringify(got) === JSON.stringify(want))
  }
}

// ── every numeric range has headroom above its approved value ────────
//
// ⚠️ ASSERTED, not eyeballed. `wireSpeed` sat pinned at its own CMS ceiling of 6
// for three sessions and was flagged three separate times before anyone asked
// the owner directly; `reformMs` on hero-effects still has defaultValue 2500
// against max 2500 today. A ceiling that equals the shipped value is not a
// range, it is a value the owner can only ever lower.
//
// Walked off the ACTUAL field definitions and the ACTUAL serialised defaults,
// so a field added later is audited without anyone remembering to list it here.
{
  const defaults = toSamsaraPayload(d) as Record<string, unknown>

  /**
   * Fields whose approved value IS the semantic maximum, so headroom above it
   * would be meaningless rather than useful.
   *
   * ⚠️ Kept deliberately tiny, and it does not simply silence the check — an
   * entry still has to prove `max === value`, i.e. that the ceiling really is a
   * hard boundary of the quantity and not a range someone drew too small. The
   * whole point of this audit is that "it is fine, trust me" is exactly how
   * `wireSpeed` stayed pinned for three sessions. Adding a row here should feel
   * like it needs a sentence, because it does.
   */
  const SEMANTIC_MAX: Record<string, string> = {
    'freeze.chargePerBeat[2].value':
      'charge is 0..1 by definition — 1 is the logo fully separated, and the commit drives it there regardless',
  }

  const walk = (fields: Field[], value: unknown, path: string) => {
    for (const f of fields) {
      if (!('name' in f) || typeof f.name !== 'string') continue
      const here = path ? `${path}.${f.name}` : f.name
      const v = (value as Record<string, unknown> | undefined)?.[f.name]

      if (f.type === 'group') {
        walk(f.fields as Field[], v, here)
        continue
      }
      if (f.type === 'array') {
        const rows = Array.isArray(v) ? v : []
        rows.forEach((row, i) => walk(f.fields as Field[], row, `${here}[${i}]`))
        continue
      }
      if (f.type !== 'number') continue

      const max = typeof f.max === 'number' ? f.max : undefined
      const min = typeof f.min === 'number' ? f.min : undefined
      if (typeof v !== 'number') continue

      if (max !== undefined) {
        const why = SEMANTIC_MAX[here]
        if (why) {
          check(`${here}: max ${max} is a real boundary — ${why}`, max === v)
        } else {
          check(`${here}: max ${max} leaves room above the approved ${v}`, max > v)
        }
      }
      if (min !== undefined) {
        check(`${here}: min ${min} is at or below the approved ${v}`, min <= v)
      }
    }
  }

  walk(SamsaraSequence.fields as Field[], defaults, '')
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll SAMSARA resolver checks passed.')
process.exit(failures ? 1 : 0)
