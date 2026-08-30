/**
 * Pins the fall-and-bounce arc.
 *
 * Spec §6.3: gravity-driven parabola to the floor, three bounces at a
 * restitution coefficient, each carrying depth velocity toward the camera so
 * SAMSARA grows on every contact — then a RISE into a hover rather than a rest,
 * because it is a floating mascot.
 * Run: npm run verify:config
 */
import { bounceAt } from './bounce'
import { DEFAULT_SEQUENCE } from './types'

const cfg = DEFAULT_SEQUENCE.TRANSIT
let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const SAMPLES = 400
const poses = Array.from({ length: SAMPLES + 1 }, (_, i) => bounceAt(i / SAMPLES, cfg))

// ── the floor is a floor ────────────────────────────────────────────
check('never goes below the floor', poses.every((p) => p.height >= -1e-9))
check('starts high', poses[0].height > 0)
// It is a FLOATING mascot: the arc ends on a hover, not on the ground.
check('ends at the hover, not on the floor', poses[SAMPLES].height > 0)

// ── depth advances toward the viewer, and never reverses ────────────
check(
  'depth is monotonic toward the camera',
  poses.every((p, i) => i === 0 || p.depth01 >= poses[i - 1].depth01 - 1e-9),
)
check('depth starts at the back wall', Math.abs(poses[0].depth01) < 1e-9)
check('depth ends at the landed position', Math.abs(poses[SAMPLES].depth01 - 1) < 1e-9)

// ── exactly three bounces, each lower than the last ─────────────────
{
  const apexes: number[] = []
  for (let b = 0; b < cfg.BOUNCE_COUNT; b++) {
    const inBounce = poses.filter((p) => p.bounceIndex === b)
    check(`bounce ${b} is reached`, inBounce.length > 0)
    apexes.push(Math.max(...inBounce.map((p) => p.height)))
  }
  check(
    `apexes decay (${apexes.map((a) => a.toFixed(2)).join(' > ')})`,
    apexes.every((h, i) => i === 0 || h < apexes[i - 1]),
  )
  check('no fourth bounce', poses.every((p) => p.bounceIndex < cfg.BOUNCE_COUNT))
  check('the initial fall is not counted as a bounce', poses[0].bounceIndex === -1)
}

// ── restitution actually governs the decay ──────────────────────────
// Without this the apexes could decay by any arbitrary rule and the CMS
// restitution field would be decorative.
{
  const apex0 = Math.max(...poses.filter((p) => p.bounceIndex === 0).map((p) => p.height))
  const apex1 = Math.max(...poses.filter((p) => p.bounceIndex === 1).map((p) => p.height))
  const apex2 = Math.max(...poses.filter((p) => p.bounceIndex === 2).map((p) => p.height))
  const r1 = apex1 / apex0
  const r2 = apex2 / apex1
  check(`apex ratio 1 ~ restitution (${r1.toFixed(3)} vs ${cfg.RESTITUTION})`, Math.abs(r1 - cfg.RESTITUTION) < 0.06)
  check(`apex ratio 2 ~ restitution (${r2.toFixed(3)} vs ${cfg.RESTITUTION})`, Math.abs(r2 - cfg.RESTITUTION) < 0.06)
}

// ── contacts ────────────────────────────────────────────────────────
// There must be real touchdowns, or the shadow has nothing to tighten against
// and three "bounces" read as floating.
{
  let contacts = 0
  for (let i = 1; i < poses.length - 1; i++) {
    if (poses[i].height < poses[i - 1].height && poses[i].height < poses[i + 1].height) contacts++
  }
  check(`the arc actually touches down (${contacts} contacts)`, contacts >= cfg.BOUNCE_COUNT)
}

// ── responds to config, rather than being hard-coded ────────────────
{
  const bouncier = bounceAt(0.5, { ...cfg, RESTITUTION: 0.8 })
  const deader = bounceAt(0.5, { ...cfg, RESTITUTION: 0.1 })
  check('a higher restitution gives a higher mid-arc', bouncier.height > deader.height)
}

// Clamped outside 0..1 rather than extrapolating into nonsense.
check('t below 0 clamps to the start', bounceAt(-0.5, cfg).depth01 === poses[0].depth01)
check('t above 1 clamps to the end', bounceAt(1.5, cfg).depth01 === poses[SAMPLES].depth01)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll bounce checks passed.')
process.exit(failures ? 1 : 0)
