/**
 * The parked mascot's golden-smoke burst — scheduling, geometry, growth, fade.
 * Run: npm run verify:config
 *
 * Pure: no GL, no browser. A seeded RNG makes every assertion exact rather than
 * statistical, which is what lets "the burst is BEHIND the body" be a hard
 * check instead of a sampled average.
 */
import { DEFAULT_SEQUENCE } from './types'
import { BurstState, burstFade, makeBurstPool } from './roomBurst'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}${note ? '   ' + note : ''}`)
  } else {
    console.log(`ok    ${label}${note ? '   ' + note : ''}`)
  }
}

const cfg = DEFAULT_SEQUENCE.BURST

/** Deterministic, and NOT constant — a constant rng hides every use of it. */
const seeded = () => {
  let x = 123456789
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
}

// ── the owner's actual requirement ───────────────────────────────────
check('the burst is on by default', cfg.ENABLED === true)
check('and fires every 4 seconds, as asked', cfg.INTERVAL_MS === 4000)

// ── it has to read as SMOKE, not as dust ─────────────────────────────
//
// ⚠️ These are the CONFIG half of that, and they are the smaller half. What
// actually decides it is the sprite's SHAPE, in the fragment shader: a sprite
// whose alpha falls off smoothly with radius is the definition of bokeh, and
// no combination of the numbers below rescues it. The owner reported exactly
// that — "emitting dust not smoke" — against a pass that had already tuned
// count, size and opacity three times. The shader now erodes each puff with
// fbm noise; these values only have to keep the cloud faint and expanding.
//
// A COUNT ceiling used to live here on the theory that smoke means FEWER
// particles. That was wrong and is deliberately gone: with eroded sprites,
// more of them is what makes the mass connected rather than a scatter of orbs.
check('smoke expands as it fades', cfg.GROWTH > 1, `growth ${cfg.GROWTH}`)
check('and curls rather than expanding as a clean ball', cfg.SWIRL > 0, `swirl ${cfg.SWIRL}`)
check('the puffs are large', cfg.SIZE >= 24, `${cfg.SIZE}px at the body`)
check(
  'and faint enough to layer into volume',
  cfg.OPACITY <= 0.5,
  `opacity ${cfg.OPACITY}`,
)
check('the glow is low enough not to leave a bright centre', cfg.GLOW <= 0.25,
  `glow ${cfg.GLOW}`)
check('and there are enough puffs to form a connected mass', cfg.COUNT >= 60,
  `${cfg.COUNT}`)

// ── the fade ─────────────────────────────────────────────────────────
check('fade is 0 at birth', burstFade(0) === 0)
check('fade is 0 once dead', burstFade(1) <= 0)
check('fade peaks at the attack', Math.abs(burstFade(0.08) - 1) < 1e-9)
check('fade never goes negative', burstFade(1.4) === 0)
{
  // Monotonic decay after the attack: a bump would read as a second flash.
  let ok = true
  for (let a = 0.08; a < 1; a += 0.01) if (burstFade(a + 0.01) > burstFade(a) + 1e-9) ok = false
  check('and decays monotonically after it', ok)
}

// ── scheduling ───────────────────────────────────────────────────────
{
  const b = new BurstState(makeBurstPool(256), seeded())
  // ⚠️ The first burst waits a full interval. Firing on arrival buries it under
  // the bounce and the settle.
  check('nothing fires on the frame it parks', b.update(cfg, 0, true) === false)
  check('nor part-way through the first interval', b.update(cfg, 3.9, true) === false)
  check('one fires at the interval', b.update(cfg, 4.0, true) === true)
  check('and not again immediately', b.update(cfg, 4.1, true) === false)
  check('the next comes one interval later', b.update(cfg, 8.0, true) === true)
}
{
  const b = new BurstState(makeBurstPool(256), seeded())
  b.update(cfg, 0, true)
  // A backgrounded tab hands back a huge elapsed jump. One burst, not twelve.
  check('a stalled tab fires exactly one burst, not one per missed interval',
    b.update(cfg, 50, true) === true)
  check('and re-arms from NOW rather than from the missed schedule',
    b.update(cfg, 53.9, true) === false)
}
{
  const b = new BurstState(makeBurstPool(256), seeded())
  b.update(cfg, 0, true)
  check('nothing fires while not parked', b.update(cfg, 99, false) === false)
  // Re-entering must not fire instantly on a timer that ran while off screen.
  check('re-entering re-arms rather than firing at once', b.update(cfg, 99.1, true) === false)
  check('and then fires an interval after re-entry', b.update(cfg, 103.1, true) === true)
}
{
  const off = { ...cfg, ENABLED: false }
  const b = new BurstState(makeBurstPool(256), seeded())
  b.update(off, 0, true)
  check('disabled never fires', b.update(off, 100, true) === false)
}

// ── geometry: the whole point is that it comes from BEHIND ───────────
{
  const b = new BurstState(makeBurstPool(512), seeded())
  b.fire(cfg, 0)
  const motes = b.sample(cfg, 0.001, 1).filter((m) => m.alpha > 0 || m.size > 0)
  check('a burst emits COUNT motes', motes.length === cfg.COUNT, `${motes.length}`)

  // The shader rotates and offsets each puff's noise by this. All-equal seeds
  // would draw the same wisp 110 times, and repetition reads as a texture bug.
  const seeds = new Set(motes.map((m) => m.size > 0 && m.seed))
  check('every puff carries its own noise seed', seeds.size > cfg.COUNT * 0.9,
    `${seeds.size} distinct of ${motes.length}`)
  check('and the seeds are in 0..1 as the shader assumes',
    motes.every((m) => m.seed >= 0 && m.seed <= 1))

  // ⚠️ Every mote starts behind the body's centre plane. If any spawned in
  // front, the effect reads as dust sprayed at the visitor's face rather than
  // shed from behind — and it would draw over the eyes, which are the point.
  const anyInFront = motes.some((m) => m.z >= 0)
  check('every mote is born BEHIND the centre plane', !anyInFront)

  // And behind the SURFACE, not merely the centre: cosPhi <= -0.15 at r >= 1,
  // pushed a further BACK_OFFSET back.
  const shallowest = Math.max(...motes.map((m) => m.z))
  check('the shallowest is still clear of the surface', shallowest < -cfg.BACK_OFFSET * 0.5,
    `z ${shallowest.toFixed(3)}`)

  // Spawned on a shell around the body, not at a single point — a point source
  // reads as a puff of smoke from one spot.
  const radii = motes.map((m) => Math.hypot(m.x, m.y, m.z + cfg.BACK_OFFSET))
  check('spawned on a shell at/outside the surface', Math.min(...radii) >= 1 - 1e-6,
    `min ${Math.min(...radii).toFixed(3)}`)
  check('and inside the configured spread', Math.max(...radii) <= 1 + cfg.SPREAD + 1e-6)

  // Spread around the axis, not all on one side.
  check('the burst surrounds the body rather than favouring one side',
    motes.some((m) => m.x > 0.2) && motes.some((m) => m.x < -0.2) &&
    motes.some((m) => m.y > 0.2) && motes.some((m) => m.y < -0.2))
}

// ── motion ───────────────────────────────────────────────────────────
{
  const b = new BurstState(makeBurstPool(512), seeded())
  b.fire(cfg, 0)
  const t0 = b.sample(cfg, 0.05, 1, 0)
  const spread0 = Math.max(...t0.map((m) => Math.hypot(m.x, m.y)))
  // Advance a while.
  for (let i = 0; i < 30; i++) b.sample(cfg, 0.05 + i * 0.02, 1, 0.02)
  const t1 = b.sample(cfg, 0.7, 1, 0)
  const spread1 = Math.max(...t1.map((m) => Math.hypot(m.x, m.y)))
  check('the cloud expands outward', spread1 > spread0, `${spread0.toFixed(2)} -> ${spread1.toFixed(2)}`)

  const meanY0 = t0.reduce((a, m) => a + m.y, 0) / t0.length
  const meanY1 = t1.reduce((a, m) => a + m.y, 0) / t1.length
  check('and drifts upward as smoke does', meanY1 > meanY0, `${meanY0.toFixed(3)} -> ${meanY1.toFixed(3)}`)

  // ⚠️ The single strongest smoke cue, and the one most easily lost: a puff
  // that SHRINKS as it fades reads as a grain falling away. The dust pass
  // multiplied size by (1 - age * 0.35); this asserts that inversion held.
  const size0 = t0.reduce((a, m) => a + m.size, 0) / t0.length
  const size1 = t1.reduce((a, m) => a + m.size, 0) / t1.length
  check('and every puff GROWS rather than shrinking', size1 > size0,
    `${size0.toFixed(1)}px -> ${size1.toFixed(1)}px`)
}

// ── the curl is real, and it is per-puff ─────────────────────────────
//
// ⚠️ Compared against a SWIRL-0 run from an IDENTICAL seed, so both clouds
// start from exactly the same motes and any difference is the curl itself.
//
// The first version of this measured the standard deviation of the radii and
// failed at 0.530 vs 0.523 — because sample() returns every POOL slot and 222
// of the 256 were dead, parked at the origin. The statistic was mostly a count
// of zeros. Filter to the live motes, and compare positions rather than a
// summary of them.
{
  const run = (c: typeof cfg) => {
    const b = new BurstState(makeBurstPool(256), seeded())
    b.fire(c, 0)
    for (let i = 0; i < 40; i++) b.sample(c, i * 0.02, 1, 0.02)
    return b.sample(c, 0.8, 1, 0).filter((m) => m.alpha > 0)
  }
  const straight = run({ ...cfg, SWIRL: 0 })
  const curled = run(cfg)
  check('both runs kept the same live motes', straight.length === curled.length &&
    straight.length === cfg.COUNT, `${straight.length} vs ${curled.length}`)

  const moved = straight.map((m, i) =>
    Math.hypot(m.x - curled[i].x, m.y - curled[i].y, m.z - curled[i].z))
  const mean = moved.reduce((a, v) => a + v, 0) / moved.length
  check('curl actually displaces the puffs', mean > 0.02,
    `mean ${mean.toFixed(4)} radii after 0.8s`)
  // Per-puff, not a bodily sway: if every mote moved by the same vector the
  // cloud would just be translated, which looks like wind rather than curl.
  const spread = Math.max(...moved) - Math.min(...moved)
  check('and does so by a different amount for each', spread > mean * 0.5,
    `range ${spread.toFixed(4)}`)
}

// ── lifetime ─────────────────────────────────────────────────────────
{
  const b = new BurstState(makeBurstPool(512), seeded())
  b.fire(cfg, 0)
  check('alive right after firing', b.aliveCount(0.1) === cfg.COUNT)
  // Longest possible life is SECONDS * 1.3.
  const after = cfg.SECONDS * 1.3 + 0.01
  check('all dead once the longest life is past', b.aliveCount(after) === 0, `at ${after.toFixed(2)}s`)
  check('and every sample reports alpha 0 then',
    b.sample(cfg, after, 1).every((m) => m.alpha === 0))
}

// ── the pool cannot be overrun ───────────────────────────────────────
{
  // A COUNT larger than the pool must wrap, not write out of bounds.
  const b = new BurstState(makeBurstPool(16), seeded())
  b.fire({ ...cfg, COUNT: 500 }, 0)
  check('a COUNT larger than the pool is clamped to it', b.aliveCount(0.1) === 16)
}
{
  const b = new BurstState(makeBurstPool(64), seeded())
  b.fire({ ...cfg, COUNT: -5 }, 0)
  check('a negative COUNT emits nothing rather than throwing', b.aliveCount(0.1) === 0)
}

// ── the alpha the engine passes gates everything ─────────────────────
{
  const b = new BurstState(makeBurstPool(64), seeded())
  b.fire(cfg, 0)
  check('a 0 alpha hides the whole burst',
    b.sample(cfg, 0.5, 0).every((m) => m.alpha === 0))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll room burst checks passed.')
process.exit(failures ? 1 : 0)
