/**
 * Pins `orbSmoke` — the two smoke behaviours of spec §5.2.
 *
 * ⚠️ Three assertions here were rewritten from the plan, which had them wrong:
 *
 *  - "fresh puffs are near opaque" contradicted the design. Alpha is a BLOOM,
 *    deliberately near zero at birth so a puff grows into visibility rather
 *    than popping. The plan's check would have forced the opposite.
 *  - "puffs die at their lifetime" sampled at PUFF_LIFE_MS + 50, but lifetimes
 *    are randomised up to 1.25x, so a live puff could still be there. It would
 *    have failed intermittently, which is worse than failing.
 *  - "thrust uses all four ports" mapped over the sample INDEX rather than the
 *    port, so it passed for any input with four or more puffs. `PuffSample`
 *    now carries `port` so the assertion is real.
 */
import { DEFAULT_SEQUENCE } from './types'
import { makeSmokePool, SmokeState } from './orbSmoke'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  }
}

const cfg = DEFAULT_SEQUENCE.EMITTERS
/** Deterministic, so any failure is reproducible. */
const seeded = () => {
  let s = 12345
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

// ── off emits nothing ───────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), seeded())
  check('off spawns nothing on the first step', st.update(cfg, 'off', 0, 16) === 0)
  check('off stays empty after a second', st.update(cfg, 'off', 1000, 16) === 0)
  check('and nothing is alive to sample', st.sample(1000, cfg).length === 0)
}

// ── thrust is continuous ────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(512), seeded())
  let total = 0
  for (let t = 0; t < 1000; t += 16) total += st.update(cfg, 'thrust', t, 16)
  const want = cfg.THRUST_RATE * 4
  check('thrust emits at roughly its rate over one second',
    Math.abs(total - want) / want < 0.2, `${total} vs ~${want}`)
  // ⚠️ Reads the PORT off each sample, not its array index. The plan's version
  // read the index and so proved nothing.
  const ports = new Set(st.sample(500, cfg).map((p) => p.port))
  check('thrust uses all four ports', ports.size === 4, `ports seen: ${[...ports].sort().join(',')}`)
}

// ── cadence is discrete, and permanent ──────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), seeded())
  // ⚠️ The first cadenced burst waits a FULL interval after parking. Firing on
  // the arrival frame would land it on top of the thrust smoke still
  // dissipating and read as a continuation of it, not as its own event.
  check('nothing fires on the frame it parks', st.update(cfg, 'cadence', 0, 16) === 0)

  let before = 0
  for (let t = 16; t < cfg.CADENCE_MS - 20; t += 16) before += st.update(cfg, 'cadence', t, 16)
  check('nothing fires part-way through the first interval', before === 0, `${before}`)

  check('a burst fires at the interval',
    st.update(cfg, 'cadence', cfg.CADENCE_MS, 16) === cfg.CADENCE_PUFFS * 4)

  // Three intervals, not one — a single reading cannot tell a cadence from a
  // one-shot, and "keeps bursting all the time" is the owner's decision #3.
  // ⚠️ The upper bound is padded past the fourth interval on purpose. Stepping
  // 16ms from CADENCE_MS+16 does not land exactly on every multiple of 3000, so
  // a bound of exactly CADENCE_MS*4 stops one frame short of the third burst
  // and the cadence reads as broken when it is not.
  let bursts = 0
  for (let t = cfg.CADENCE_MS + 16; t <= cfg.CADENCE_MS * 4 + 100; t += 16) {
    if (st.update(cfg, 'cadence', t, 16) > 0) bursts++
  }
  check('and keeps firing every interval', bursts === 3, `${bursts} bursts across 3 intervals`)
}

// ── a puff blooms, then dies ────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), seeded())
  st.update(cfg, 'cadence', cfg.CADENCE_MS, 16)
  const t0 = cfg.CADENCE_MS

  const born = st.sample(t0 + 5, cfg)
  check('a fresh burst is alive', born.length === cfg.CADENCE_PUFFS * 4, `${born.length}`)
  // ⚠️ Alpha is a BLOOM, not a step. A fresh puff is deliberately faint so it
  // grows into visibility instead of popping into existence.
  check('a fresh puff is faint', born.every((p) => p.alpha < cfg.PUFF_OPACITY * 0.35),
    `${born[0]?.alpha.toFixed(3)}`)

  const peak = st.sample(t0 + cfg.PUFF_LIFE_MS * 0.4, cfg)
  check('it peaks mid-life', peak.some((p) => p.alpha > cfg.PUFF_OPACITY * 0.8),
    `${Math.max(...peak.map((p) => p.alpha)).toFixed(3)} vs opacity ${cfg.PUFF_OPACITY}`)
  check('and never exceeds the configured opacity',
    peak.every((p) => p.alpha <= cfg.PUFF_OPACITY + 1e-9))

  check('it grows as it ages',
    Math.max(...peak.map((p) => p.size)) > Math.max(...born.map((p) => p.size)))

  // ⚠️ Lifetimes are randomised up to 1.25x PUFF_LIFE_MS, so this must sample
  // past the LONGEST possible life, not past the nominal one.
  const dead = st.sample(t0 + cfg.PUFF_LIFE_MS * 1.25 + 50, cfg)
  check('every puff is gone past the longest possible life', dead.length === 0,
    `${dead.length} still alive`)
}

// ── the shared pool must not starve the entrance ────────────────────
{
  // Thrust is far denser than the cadence; a pool sized for the cadence alone
  // truncates the entry plume silently.
  const small = new SmokeState(makeSmokePool(8), seeded())
  let spawned = 0
  for (let t = 0; t < 500; t += 16) spawned += small.update(cfg, 'thrust', t, 16)
  check('a small pool recycles rather than throwing',
    spawned > 0 && Number.isFinite(spawned) && small.sample(500, cfg).length <= 8)
}

// ── reset ───────────────────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), seeded())
  st.update(cfg, 'cadence', cfg.CADENCE_MS, 16)
  st.reset()
  check('reset clears every live puff', st.sample(cfg.CADENCE_MS + 5, cfg).length === 0)
  // The sequence re-enters `landed` on every replay; a state that could not
  // restart its cadence would burst once per page load.
  check('and the cadence can fire again', st.update(cfg, 'cadence', cfg.CADENCE_MS, 16) > 0)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll orbSmoke checks passed.')
process.exit(failures ? 1 : 0)
