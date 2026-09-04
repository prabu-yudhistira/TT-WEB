/**
 * Pins `orbSmoke` — continuous emission from an arbitrary set of ports.
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
import { DEFAULT_SEQUENCE, portOffsets } from './types'
import { makeSmokePool, SmokeState, type PortSpec } from './orbSmoke'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  }
}

const cfg = DEFAULT_SEQUENCE.EMITTERS

/** The orb's four afterburners, pointing down and out. */
const ORB_PORTS: PortSpec[] = portOffsets(cfg).map((o) => ({
  at: o as unknown as readonly [number, number, number],
  dir: [o[0] * 0.3, -0.7, o[2] * 0.3] as const,
}))
/** Deterministic, so any failure is reproducible. */
const seeded = () => {
  let s = 12345
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

// ── off emits nothing ───────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), ORB_PORTS, seeded())
  check('off spawns nothing on the first step', st.update(cfg, 'off', 0, 16) === 0)
  check('off stays empty after a second', st.update(cfg, 'off', 1000, 16) === 0)
  check('and nothing is alive to sample', st.sample(1000, cfg).length === 0)
}

// ── thrust is continuous ────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(512), ORB_PORTS, seeded())
  let total = 0
  for (let t = 0; t < 1000; t += 16) total += st.update(cfg, 'on', t, 16)
  const want = cfg.THRUST_RATE * 4
  check('thrust emits at roughly its rate over one second',
    Math.abs(total - want) / want < 0.2, `${total} vs ~${want}`)
  // ⚠️ Reads the PORT off each sample, not its array index. The plan's version
  // read the index and so proved nothing.
  const ports = new Set(st.sample(500, cfg).map((p) => p.port))
  check('thrust uses all four ports', ports.size === 4, `ports seen: ${[...ports].sort().join(',')}`)
}

// ── emission is continuous, and never stops ─────────────────────────
{
  const st = new SmokeState(makeSmokePool(512), ORB_PORTS, seeded())
  // ⚠️ There is no interval any more. This used to assert a burst every
  // CADENCE_MS with nothing in between; the owner superseded that on
  // 2026-09-04, so what matters is that emission NEVER PAUSES.
  let gaps = 0
  let steps = 0
  for (let t = 0; t < 4000; t += 16) {
    steps++
    if (st.update(cfg, 'on', t, 16) === 0) gaps++
  }
  // A fractional rate cannot emit on literally every frame, but it must not
  // leave a visible hole: at THRUST_RATE across four ports the budget clears
  // one whole puff most frames.
  check('emission never pauses for long', gaps / steps < 0.5,
    `${gaps} idle of ${steps} frames`)

  const alive = st.sample(4000, cfg)
  check('and a steady cloud is standing', alive.length > 10, `${alive.length} puffs`)
  check('drawn from every port', new Set(alive.map((p) => p.port)).size === 4)
}

// ── a puff blooms, then dies ────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), ORB_PORTS, seeded())
  const t0 = 1000
  // ⚠️ ONE long step, so the whole cohort shares a birth stamp and ages
  // together. Stepping at frame length instead would smear births across the
  // window and every age assertion below would read a mixture.
  const n = st.update(cfg, 'on', t0, 250)

  const born = st.sample(t0 + 5, cfg)
  check('a fresh cohort is alive', n > 0 && born.length === n, `${born.length} of ${n}`)
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
  const small = new SmokeState(makeSmokePool(8), ORB_PORTS, seeded())
  let spawned = 0
  for (let t = 0; t < 500; t += 16) spawned += small.update(cfg, 'on', t, 16)
  check('a small pool recycles rather than throwing',
    spawned > 0 && Number.isFinite(spawned) && small.sample(500, cfg).length <= 8)
}

// ── reset ───────────────────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), ORB_PORTS, seeded())
  st.update(cfg, 'on', 1000, 250)
  st.reset()
  check('reset clears every live puff', st.sample(1005, cfg).length === 0)
  // The sequence re-enters `landed` on every replay; a state that could not
  // emit again would go quiet for the rest of the page load.
  check('and it emits again', st.update(cfg, 'on', 1000, 250) > 0)
}

// ── the port list is a parameter, not four ──────────────────────────
{
  // SAMSARA has TWO exhausts. The rate is per-port, so a two-port emitter must
  // produce half what a four-port one does over the same second — if the count
  // were baked at four, this would silently double SAMSARA's output.
  const two: PortSpec[] = [
    { at: [0.5, 0.6, -0.5], dir: [0.3, 0.9, -0.4] },
    { at: [-0.5, 0.6, -0.5], dir: [-0.3, 0.9, -0.4] },
  ]
  const st = new SmokeState(makeSmokePool(512), two, seeded())
  let total = 0
  for (let t = 0; t < 1000; t += 16) total += st.update(cfg, 'on', t, 16)
  const want = cfg.THRUST_RATE * 2
  check('a two-port emitter emits at two ports\u2019 worth',
    Math.abs(total - want) / want < 0.2, `${total} vs ~${want}`)
  check('and uses both of them',
    new Set(st.sample(500, cfg).map((p) => p.port)).size === 2)

  // ⚠️ The port cursor is PERSISTENT across frames. Two ports at THRUST_RATE
  // clear well under one puff per frame, so a cursor reset each frame would
  // fire port 0 forever and one exhaust would never smoke.
  const drip = new SmokeState(makeSmokePool(256), two, seeded())
  for (let t = 0; t < 1000; t += 16) drip.update(cfg, 'on', t, 16)
  check('a one-puff-per-frame drip still alternates ports',
    new Set(drip.sample(900, cfg).map((p) => p.port)).size === 2)

  // Direction has to reach the puff, or every emitter plumes the same way.
  const up = st.sample(600, cfg)
  check('puffs travel along the port direction', up.some((p) => p.y > 0.6),
    `max y ${Math.max(...up.map((q) => q.y)).toFixed(2)}`)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll orbSmoke checks passed.')
process.exit(failures ? 1 : 0)
