/**
 * Pins `HologramController` — the four beats as a phase machine.
 */
import { DEFAULT_SEQUENCE } from './types'
import { HologramController } from './HologramController'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  }
}

const cfg = DEFAULT_SEQUENCE
const run = (c: HologramController, ms: number, step = 16) => {
  for (let t = 0; t < ms; t += step) c.update(cfg, step)
}
const entryTotal = cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS

// ── dormant until started ───────────────────────────────────────────
{
  const c = new HologramController()
  check('starts dormant', c.phase === 'dormant')
  run(c, 10000)
  check('stays dormant without start()', c.phase === 'dormant', c.phase)
  check('dormant emits no smoke', c.smokeMode() === 'off')
}

// ── the four beats, in order ────────────────────────────────────────
{
  const c = new HologramController()
  c.start()
  check('start() enters the entry beat', c.phase === 'entering', c.phase)
  check('entry is already emitting', c.smokeMode() === 'on')

  // ⚠️ Entry is over only when the LAGGING orb has arrived — entry + stagger.
  // Advancing at ENTRY_MS alone would cut the far orb's arrival off.
  run(c, entryTotal - 100)
  check('still entering while the far orb is in flight', c.phase === 'entering', c.phase)

  run(c, 200)
  check('both orbs parked before the beat advances', c.phase !== 'entering', c.phase)
  // ⚠️ Parking must NOT change the emission. It used to switch from a
  // continuous thrust to a repeating burst; the owner superseded that on
  // 2026-09-04 and the orbs now emit constantly across the boundary.
  check('parking does not interrupt the emission', c.smokeMode() === 'on')

  run(c, 400)
  check('then it emits', c.phase === 'emitting' || c.phase === 'forming', c.phase)

  run(c, cfg.HOLOGRAM.FORM_MS + 1200)
  check('and reaches live', c.phase === 'live', c.phase)
  check('live keeps emitting', c.smokeMode() === 'on')
}

// ── live is terminal, because the cadence and flicker are permanent ─
{
  const c = new HologramController()
  c.start()
  run(c, 60000)
  check('live is terminal', c.phase === 'live', c.phase)
  check('and smoke never stops', c.smokeMode() === 'on')
}

// ── progress ratios ─────────────────────────────────────────────────
{
  const c = new HologramController()
  c.start()
  check('entry starts at 0', c.entry01(cfg) === 0)
  run(c, entryTotal / 2)
  const mid = c.entry01(cfg)
  check('entry progresses', mid > 0.3 && mid < 0.8, mid.toFixed(2))
  check('form is still 0 during entry', c.form01(cfg) === 0)
  run(c, 30000)
  check('entry saturates at 1', c.entry01(cfg) === 1)
  check('form saturates at 1', c.form01(cfg) === 1)
}

// ── reset, because the sequence re-enters `landed` on every replay ──
{
  const c = new HologramController()
  c.start()
  run(c, 30000)
  c.reset()
  check('reset returns to dormant', c.phase === 'dormant')
  check('reset clears the clock', c.totalMs === 0)
  check('reset stops smoke', c.smokeMode() === 'off')
  check('reset clears the parked clock', c.parkedMs() === 0)
  // A controller that could not restart would run once per page load.
  c.start()
  check('and it can start again', c.phase === 'entering')
}

// ── parkedMs drives the cadence, and counts from the PARK ───────────
{
  const c = new HologramController()
  c.start()
  check('parkedMs is 0 while entering', c.parkedMs() === 0)
  run(c, entryTotal + 1000)
  // ⚠️ If this counted from start() the first cadenced burst would fire
  // ~1.9s early, landing under the entrance instead of clear of it.
  check('parkedMs counts from the park, not from start',
    c.parkedMs() > 900 && c.parkedMs() < 1120, c.parkedMs().toFixed(0))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll HologramController checks passed.')
process.exit(failures ? 1 : 0)
