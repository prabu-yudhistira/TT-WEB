/**
 * Pins `orbPoke` — press, shake, one flicker, settle.
 */
import { DEFAULT_SEQUENCE } from './types'
import { PokeController, shakeOffset, orbHit, type ScreenDisc } from './orbPoke'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  }
}

const cfg = DEFAULT_SEQUENCE.POKE
const run = (c: PokeController, ms: number, step = 16) => {
  for (let t = 0; t < ms; t += step) c.update(cfg, step)
}

// ── nothing happens unpressed ───────────────────────────────────────
{
  const c = new PokeController()
  run(c, 5000)
  check('idle without a press', c.phase === 'idle')
  check('and no shake', c.shake01(cfg) === 0)
  check('and no dip', c.dip(cfg) === 0)
}

// ── the shake builds, then fires ONCE ───────────────────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS * 0.5)
  const mid = c.shake01(cfg)
  check('the shake builds while held', mid > 0.3 && mid < 0.8, mid.toFixed(2))
  check('and nothing has flickered yet', c.dip(cfg) === 0)

  run(c, cfg.SHAKE_MS * 0.55)
  check('at full hold it fires', c.phase === 'firing', c.phase)
  check('the shake is at full', c.shake01(cfg) === 1)

  /**
   * ⚠️ IT KEEPS GOING. The owner asked for continuous on 2026-09-05, reversing
   * a first pass that fired once. What this pins is that the flicker neither
   * stops on its own nor saturates: it has to keep MOVING for eight seconds of
   * hold, which is what separates a flicker from a screen that simply dimmed.
   */
  let lit = 0
  let dark = 0
  let maxHeld = 0
  for (let t = 0; t < 8000; t += 16) {
    c.update(cfg, 16)
    const d = c.dip(cfg)
    maxHeld = Math.max(maxHeld, d)
    if (d > cfg.FLICKER_DEPTH * 0.5) lit++
    if (d < cfg.FLICKER_DEPTH * 0.1) dark++
  }
  check('it is still flickering after eight seconds of hold', lit > 50 && dark > 50,
    `${lit} deep frames, ${dark} shallow`)
  check('and never exceeds its depth', maxHeld <= cfg.FLICKER_DEPTH + 1e-9, maxHeld.toFixed(3))
  check('the shake stays up under the finger', c.shake01(cfg) === 1)
}

// ── release settles rather than stopping dead ───────────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS * 0.4)
  const atRelease = c.shake01(cfg)
  c.release()
  const justAfter = c.shake01(cfg)
  // ⚠️ Continuous across the release. Snapping to full or to zero here reads as
  // a dropped frame rather than as an object settling.
  check('the tail starts where the hold left off',
    Math.abs(justAfter - atRelease) < 1e-6, `${atRelease.toFixed(3)} -> ${justAfter.toFixed(3)}`)

  run(c, cfg.RELEASE_MS * 0.5)
  const mid = c.shake01(cfg)
  check('and decays', mid > 0 && mid < atRelease, mid.toFixed(3))
  run(c, cfg.RELEASE_MS)
  check('to nothing', c.shake01(cfg) === 0)
  check('and it is idle again', c.phase === 'idle')
}

// ── a short press never fires ───────────────────────────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS * 0.6)
  c.release()
  let dips = 0
  for (let t = 0; t < 4000; t += 16) {
    c.update(cfg, 16)
    if (c.dip(cfg) > 0) dips++
  }
  check('a press let go early never flickers', dips === 0, `${dips} frames dipped`)
}

// ── a second press starts it again ──────────────────────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  c.release()
  run(c, cfg.RELEASE_MS + 50)
  check('released, it stops', c.dip(cfg) === 0)
  check('and is idle', c.phase === 'idle', c.phase)
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  check('a fresh press starts it again', c.phase === 'firing', c.phase)
}

// ── the release FADES the dip rather than cutting it ────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  check('firing', c.phase === 'firing')
  c.release()

  /**
   * ⚠️ THE ONE THAT MATTERS NOW that the flicker is continuous. Cutting it at
   * the release leaves the screen parked at whatever brightness the waveform
   * happened to be passing through — a panel stuck at half opacity with no
   * finger on it. The envelope has to reach zero.
   */
  let peak = 0
  for (let t = 0; t < cfg.RELEASE_MS; t += 8) {
    c.update(cfg, 8)
    peak = Math.max(peak, c.dip(cfg))
  }
  check('it is still dipping through the fade', peak > 0, peak.toFixed(3))
  run(c, 200)
  check('and lands on exactly zero', c.dip(cfg) === 0)
  check('with nothing left running', c.phase === 'idle', c.phase)
}

// ── the waveform does not repeat on a beat ──────────────────────────
{
  /**
   * A single sine is a PULSE — it repeats exactly, and a steady rhythm reads as
   * a deliberate animation rather than as an unstable projection. Two rates
   * beat against each other, so the same phase of the fast component lands on
   * different values of the slow one.
   */
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  const a: number[] = []
  for (let t = 0; t < cfg.FLICKER_MS * 2; t += 8) {
    c.update(cfg, 8)
    a.push(c.dip(cfg))
  }
  /**
   * ⚠️ Only the LIT samples are compared. The waveform is half-wave rectified,
   * so about half of every period is exactly zero — and zero matches zero. A
   * naive comparison across all samples reports ~47% identical and would pass
   * a pure single-sine pulse just as happily, which is the thing this exists to
   * rule out.
   */
  const half = Math.floor(a.length / 2)
  let same = 0
  let lit = 0
  for (let i = 0; i < half; i++) {
    if (a[i] <= 0 && a[i + half] <= 0) continue
    lit++
    if (Math.abs(a[i] - a[i + half]) < 1e-4) same++
  }
  check('one period does not repeat the next', lit > 20 && same / lit < 0.2,
    `${same} of ${lit} lit samples identical`)
  check('and it actually reaches its depth', Math.max(...a) > cfg.FLICKER_DEPTH * 0.8,
    Math.max(...a).toFixed(3))
}

// ── the wobble ──────────────────────────────────────────────────────
{
  const a = shakeOffset(0, cfg, 1, 0)
  check('a zero-amplitude shake is still', shakeOffset(100, cfg, 0, 0).every((v) => v === 0))

  // ⚠️ x and y must not stay in phase, or the orb slides along a diagonal
  // instead of shaking. Compare the two components over a full second.
  let sameSign = 0
  let n = 0
  for (let t = 0; t < 1000; t += 3) {
    const [x, y] = shakeOffset(t, cfg, 1, 0)
    n++
    if (Math.sign(x) === Math.sign(y)) sameSign++
  }
  check('x and y drift out of phase', sameSign / n > 0.25 && sameSign / n < 0.75,
    `${((sameSign / n) * 100).toFixed(0)}% aligned`)

  // Two orbs shaking identically read as a camera move, not as two objects.
  const [x0] = shakeOffset(137, cfg, 1, 0)
  const [x1] = shakeOffset(137, cfg, 1, 1)
  check('the two orbs shake differently', Math.abs(x0 - x1) > 1e-6)

  let peak = 0
  for (let t = 0; t < 2000; t += 2) {
    const [x, y] = shakeOffset(t, cfg, 1, 0)
    peak = Math.max(peak, Math.abs(x), Math.abs(y))
  }
  check('and never exceeds the configured amplitude', peak <= cfg.SHAKE_AMP + 1e-9,
    `${peak.toFixed(4)} vs ${cfg.SHAKE_AMP}`)
  void a
}

// ── the hit test ────────────────────────────────────────────────────
{
  const discs: ScreenDisc[] = [
    { cx: 100, cy: 700, r: 40 },
    { cx: 600, cy: 640, r: 30 },
  ]
  check('a press on an orb hits it', orbHit(100, 700, discs, 0) === 0)
  check('and on the other one hits that', orbHit(600, 640, discs, 0) === 1)
  check('empty space misses', orbHit(350, 300, discs, 0) === -1)
  check('just outside the rim misses', orbHit(145, 700, discs, 0) === -1)
  // ⚠️ Slop is what makes this usable on a touch screen. A finger is not a
  // pixel, and the orbs are small.
  check('but slop brings it back', orbHit(145, 700, discs, 20) === 0)

  // Overlapping discs must resolve to the NEAREST, not to the first listed.
  const near: ScreenDisc[] = [
    { cx: 100, cy: 100, r: 60 },
    { cx: 140, cy: 100, r: 60 },
  ]
  check('an overlap picks the nearer orb', orbHit(160, 100, near, 0) === 1)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll orbPoke checks passed.')
process.exit(failures ? 1 : 0)
