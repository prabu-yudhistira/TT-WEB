/**
 * Assertions for the gold-dust particle bookkeeping. Pure — no GL context.
 * Run: npm run verify:config
 */
import { DEFAULT_MASCOT } from './types'
import { makeMotePool, moteFade, TrailState } from './mascotTrail'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const cfg = { ...DEFAULT_MASCOT }
// Deterministic RNG so emission counts and mote lifetimes are exact.
// 0.5 -> every random(0,1)=0.5, so life = TRAIL_SECONDS * (0.7 + 0.5*0.6) = 1.0x.
const half = () => 0.5

// ── fade curve (pure) ──
check('fade at age 0 is 0', moteFade(0) === 0)
check('fade peaks at the 12% mark', moteFade(0.12) === 1)
check('fade in: 6% is below 12%', moteFade(0.06) < moteFade(0.12))
check('fade out: 60% is below 12%', moteFade(0.6) < moteFade(0.12))
check('fade at age 0.99 is near zero', moteFade(0.99) < 0.02)
check('fade never negative past end of life', moteFade(1.2) <= 0)

// ── fractional emission carry ──
// DENSITY 130/s over a 1/60 s frame is 2.1667 motes. Frame 1 emits 2, carry
// 0.1667. Frame 2 adds 2.1667 -> 2.333 -> emits 2, carry 0.333. Two frames = 4.
{
  const t = new TrailState(makeMotePool(900), half)
  t.emit(cfg, 0, 0, 1 / 60, 1, 0)
  t.emit(cfg, 0, 0, 1 / 60, 1, 1 / 60)
  const alive = t.sample(cfg, 2 / 60, 1).filter((m) => m.alpha > 0).length
  check('two 1/60s frames emit exactly 4 motes', alive === 4)
}

// ── frame-stall clamp ──
{
  const t = new TrailState(makeMotePool(900), half)
  t.emit(cfg, 0, 0, 5, 1, 0) // 5s * 130/s = 650 motes wanted
  // Sample a hair after birth — at elapsed 0 the fade curve is exactly 0.
  const alive = t.sample(cfg, 0.1, 1).filter((m) => m.alpha > 0).length
  check('stall clamp caps a huge dt at 40 motes', alive === 40)
}

// ── disabled / faded emits nothing, carry resets ──
{
  const t = new TrailState(makeMotePool(900), half)
  t.emit({ ...cfg, TRAIL_ENABLED: false }, 0, 0, 1 / 60, 1, 0)
  check('disabled trail emits nothing', t.sample(cfg, 0, 1).every((m) => m.alpha === 0))
  const t2 = new TrailState(makeMotePool(900), half)
  t2.emit(cfg, 0, 0, 0, 1, 0) // dtSec 0
  check('zero dt emits nothing', t2.sample(cfg, 0, 1).every((m) => m.alpha === 0))
  const t3 = new TrailState(makeMotePool(900), half)
  t3.emit(cfg, 0, 0, 1 / 60, 0, 0) // alpha 0
  check('zero global alpha emits nothing', t3.sample(cfg, 0, 1).every((m) => m.alpha === 0))
}

// ── a live mote reports position, fade, size; a dead slot reports alpha 0 ──
{
  const t = new TrailState(makeMotePool(4), half)
  t.emit({ ...cfg, TRAIL_DENSITY: 600, TRAIL_TWINKLE: 0 }, 100, 200, 1 / 60, 1, 0)
  // life = TRAIL_SECONDS(1.4) * (0.7 + 0.5*0.6) = 1.4. Sample at elapsed 0.7 -> age 0.5.
  const s = t.sample({ ...cfg, TRAIL_TWINKLE: 0 }, 0.7, 1)
  const live = s.filter((m) => m.alpha > 0)
  // density 600/s * (1/60)s = 10 wanted, pool holds 4 -> ring wraps, all 4 written
  check('every pool slot is live at mid-life', live.length === 4)
  check(
    'live mote alpha = TRAIL_OPACITY * moteFade(0.5)',
    Math.abs(live[0].alpha - cfg.TRAIL_OPACITY * moteFade(0.5)) < 1e-9,
  )
  // Past end of life every slot is dead.
  check('all dead after 2 lifetimes', t.sample(cfg, 3.0, 1).every((m) => m.alpha === 0))
}

// ── ring buffer wraps without gaps ──
{
  const pool = makeMotePool(20)
  const t = new TrailState(pool, half)
  for (let f = 0; f < 30; f++) t.emit({ ...cfg, TRAIL_DENSITY: 600 }, f, f, 1 / 60, 1, f / 60)
  check('ring buffer fills every slot', pool.every((m) => m.life > 0))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll trail checks passed.')
process.exit(failures ? 1 : 0)
