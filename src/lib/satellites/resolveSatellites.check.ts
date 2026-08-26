/**
 * Assertions for the pure CMS <-> engine config mapping for satellites.
 * Run: npm run verify:config
 *
 * Mirrors resolveIgnition.check.ts.
 */
import { DEFAULT_SATELLITES, type SatelliteConfig } from './types'
import { resolveSatellites, toSatellitesPayload } from './resolveSatellites'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// null / undefined / empty -> pure defaults
for (const [label, input] of [
  ['null', null],
  ['undefined', undefined],
  ['empty object', {}],
] as const) {
  const r = resolveSatellites(input as never)
  check(`${label} -> default orbit speed`, r.ORBIT_SPEED === DEFAULT_SATELLITES.ORBIT_SPEED)
  check(`${label} -> default colours`, r.SAT_COLORS.length === DEFAULT_SATELLITES.SAT_COLORS.length)
  check(`${label} -> default label mode`, r.LABEL_MODE === DEFAULT_SATELLITES.LABEL_MODE)
}

// partial values override only what they set
const partial = resolveSatellites({ satelliteMotion: { orbitSpeed: 9 } })
check('partial override applies', partial.ORBIT_SPEED === 9)
check('partial leaves siblings default', partial.TRAIL === DEFAULT_SATELLITES.TRAIL)

// nulls from a never-saved field fall back rather than becoming 0
const nulled = resolveSatellites({ satelliteMotion: { orbitSpeed: null, trail: 12 } })
check('null falls back', nulled.ORBIT_SPEED === DEFAULT_SATELLITES.ORBIT_SPEED)
check('sibling still applies', nulled.TRAIL === 12)

// the checkbox maps to a signed multiplier, both ways
check('ccw true -> -1', resolveSatellites({ satelliteMotion: { orbitCcw: true } }).ORBIT_DIR === -1)
check('ccw false -> +1', resolveSatellites({ satelliteMotion: { orbitCcw: false } }).ORBIT_DIR === 1)

// the kill switch is honoured, and false is not mistaken for "unset"
check('enabled defaults true', resolveSatellites({}).SAT_ENABLED === DEFAULT_SATELLITES.SAT_ENABLED)
check(
  'enabled false is respected',
  resolveSatellites({ satellitesEnabled: false }).SAT_ENABLED === false,
)

// band must come back ordered even if the REST API is written to directly
const swapped = resolveSatellites({ satelliteLook: { bandInner: 0.9, bandOuter: 0.3 } })
check('band is reordered, not inverted', swapped.SAT_RADIUS_MIN <= swapped.SAT_RADIUS_MAX)

// fractions are clamped
const wild = resolveSatellites({ satelliteLook: { alpha: 5, shade: -3, streak: 99 } })
check('alpha clamped to 1', wild.SAT_ALPHA === 1)
check('shade clamped to 0', wild.SAT_SHADE === 0)
check('streak clamped to 1', wild.SAT_STREAK === 1)

// colours: valid rows kept in order, invalid dropped, empty -> defaults
const cols = resolveSatellites({
  satelliteColors: [{ color: '#AABBCC' }, { color: 'nope' }, { color: '#123456' }],
})
check(
  'valid colours kept in order',
  cols.SAT_COLORS[0] === '#AABBCC' && cols.SAT_COLORS[1] === '#123456',
)
check('invalid colour dropped', !cols.SAT_COLORS.includes('nope'))
check(
  'empty colour list -> defaults',
  resolveSatellites({ satelliteColors: [] }).SAT_COLORS.length ===
    DEFAULT_SATELLITES.SAT_COLORS.length,
)

// unknown label mode falls back rather than reaching the engine
check(
  'unknown label mode falls back',
  resolveSatellites({ satelliteLabels: { mode: 'sideways' as never } }).LABEL_MODE ===
    DEFAULT_SATELLITES.LABEL_MODE,
)

// Round trip. Every mapped field is perturbed to a NON-default value first —
// round-tripping the defaults against themselves is a near-tautology, which is
// exactly the weakness the 2026-08-09 review found in resolveSeparation.check.ts.
const perturbed: SatelliteConfig = {
  ...DEFAULT_SATELLITES,
  INNER_RADIUS: 2.25,
  OUTER_RADIUS: 1.15,
  MOBILE_INNER_RADIUS: 1.75,
  MOBILE_OUTER_RADIUS: 0.61,
  TILT: 37,
  TILT_SIDEWAY: 214,
  PERSPECTIVE: 1750,
  ORBIT_SPEED: 3.4,
  ORBIT_DIR: 1,
  TRAIL: 19,
  SAT_ENABLED: false,
  SAT_SIZE: 7.5,
  SAT_COLOR: '#123456',
  SAT_COLORS: ['#111111', '#222222', '#333333'],
  SAT_ALPHA: 0.42,
  SAT_RADIUS_MIN: 0.31,
  SAT_RADIUS_MAX: 0.94,
  SAT_TILT_SPREAD: 61,
  SAT_SPEED_SCALE: 1.7,
  SAT_RING: 3.3,
  SAT_SHADE: 0.24,
  SAT_STREAK: 0.66,
  SAT_DEPTH_SCALE: 1.45,
  LABEL_MODE: 'hover',
  LABEL_SIZE: 21,
  LABEL_COLOR: '#654321',
  LABEL_OFFSET: 33,
  LABEL_HOVER_RADIUS: 155,
  HOLD_FREEZE: false,
  HOLD_SHAKE_PX: 17,
  HOLD_SHAKE_SPEED: 2.6,
  ENTRANCE_MS: 2400,
  SCROLL_FADE_VH: 1.4,
  SEED: 999001,
}
const round = resolveSatellites(toSatellitesPayload(perturbed))
const MAPPED: (keyof SatelliteConfig)[] = [
  'INNER_RADIUS',
  'OUTER_RADIUS',
  'MOBILE_INNER_RADIUS',
  'MOBILE_OUTER_RADIUS',
  'TILT',
  'TILT_SIDEWAY',
  'PERSPECTIVE',
  'ORBIT_SPEED',
  'ORBIT_DIR',
  'TRAIL',
  'SAT_ENABLED',
  'SAT_SIZE',
  'SAT_COLOR',
  'SAT_ALPHA',
  'SAT_RADIUS_MIN',
  'SAT_RADIUS_MAX',
  'SAT_TILT_SPREAD',
  'SAT_SPEED_SCALE',
  'SAT_RING',
  'SAT_SHADE',
  'SAT_STREAK',
  'SAT_DEPTH_SCALE',
  'LABEL_MODE',
  'LABEL_SIZE',
  'LABEL_COLOR',
  'LABEL_OFFSET',
  'LABEL_HOVER_RADIUS',
  'HOLD_FREEZE',
  'HOLD_SHAKE_PX',
  'HOLD_SHAKE_SPEED',
  'ENTRANCE_MS',
  'SCROLL_FADE_VH',
  'SEED',
]
for (const k of MAPPED) {
  check(`round trip preserves ${k}`, round[k] === perturbed[k])
  check(`${k} was actually perturbed`, round[k] !== DEFAULT_SATELLITES[k])
}
check('round trip preserves colour list', round.SAT_COLORS.join() === perturbed.SAT_COLORS.join())

console.log(
  failures ? `\n${failures} check(s) failed.` : '\nAll satellite resolver checks passed.',
)
process.exit(failures ? 1 : 0)
