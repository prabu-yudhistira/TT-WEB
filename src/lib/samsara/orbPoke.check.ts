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

  run(c, cfg.FLICKER_MS + 100)
  check('the flicker ends on its own', c.dip(cfg) === 0)

  /**
   * ⚠️ THE ONE THAT MATTERS. Holding still must not re-fire: a strobe on a
   * loop is ugly, and this screen will carry subtitles, so a repeating flash
   * under a resting finger is a photosensitivity problem and not just a
   * cosmetic one.
   */
  let dips = 0
  for (let t = 0; t < 8000; t += 16) {
    c.update(cfg, 16)
    if (c.dip(cfg) > 0) dips++
  }
  check('and never fires again while still held', dips === 0, `${dips} frames dipped`)
  check('but the shake stays up under the finger', c.shake01(cfg) === 1)
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

// ── a second press can fire again ───────────────────────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  run(c, cfg.FLICKER_MS + 50)
  c.release()
  run(c, cfg.RELEASE_MS + 50)
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  check('a fresh press fires again', c.phase === 'firing', c.phase)
}

// ── a flicker survives an early release ─────────────────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  check('firing', c.phase === 'firing')
  c.release()
  // ⚠️ Letting go mid-strobe must not cut the dip off: the screen would be left
  // at whatever brightness the flicker happened to be passing through.
  let seen = false
  for (let t = 0; t < cfg.FLICKER_MS; t += 16) {
    c.update(cfg, 16)
    if (c.dip(cfg) > 0) seen = true
  }
  check('the flicker runs out even if the finger lifts', seen)
}

// ── the dip never exceeds its configured depth ──────────────────────
{
  const c = new PokeController()
  c.press()
  run(c, cfg.SHAKE_MS + 50)
  let max = 0
  for (let t = 0; t < cfg.FLICKER_MS; t += 8) {
    c.update(cfg, 8)
    max = Math.max(max, c.dip(cfg))
  }
  check('the dip stays within its depth', max <= cfg.FLICKER_DEPTH + 1e-9, max.toFixed(3))
  check('and actually dips', max > cfg.FLICKER_DEPTH * 0.5, max.toFixed(3))
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
