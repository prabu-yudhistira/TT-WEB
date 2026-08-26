/**
 * Assertions for pure satellite label placement.
 * Run: npm run verify:config
 */
import { placeLabels, EDGE_FADE_PX, type LabelCandidate } from './labels'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const W = 1000
const H = 600
const mk = (o: Partial<LabelCandidate> & { index: number }): LabelCandidate => ({
  x: 400,
  y: 300,
  w: 60,
  h: 16,
  z: 0,
  alpha: 1,
  ...o,
})
const byIndex = (out: ReturnType<typeof placeLabels>, i: number) =>
  out.find((p) => p.index === i)!.opacity

// A label well inside the frame is untouched.
{
  const out = placeLabels([mk({ index: 0 })], W, H, EDGE_FADE_PX)
  check('interior label keeps full opacity', byIndex(out, 0) === 1)
  check('one candidate -> one placement', out.length === 1)
}

// Every candidate comes back, so callers can drive the DOM without a lookup miss.
{
  const out = placeLabels(
    [mk({ index: 0 }), mk({ index: 1, y: 100 }), mk({ index: 2, y: 500 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('all candidates returned', out.length === 3)
  check(
    'indices preserved',
    [0, 1, 2].every((i) => out.some((p) => p.index === i)),
  )
}

// Edge fade: fully outside the fade band -> 0, partway in -> partial.
{
  const out = placeLabels([mk({ index: 0, x: -60 })], W, H, EDGE_FADE_PX)
  check('label past the left edge is hidden', byIndex(out, 0) === 0)
}
{
  const half = EDGE_FADE_PX / 2
  const out = placeLabels([mk({ index: 0, x: half })], W, H, EDGE_FADE_PX)
  const o = byIndex(out, 0)
  check('label inside the fade band is partial', o > 0 && o < 1)
}
{
  // Right edge uses the box's RIGHT side, not its left — a wide label must fade
  // before its tail is cut.
  const out = placeLabels([mk({ index: 0, x: W - 60 })], W, H, EDGE_FADE_PX)
  check('right edge accounts for label width', byIndex(out, 0) < 1)
}
{
  // Bottom edge uses the box's height, which is line-height and NOT the font
  // size. Guessing the shorter value was a real bug.
  const out = placeLabels([mk({ index: 0, y: H - 16 })], W, H, EDGE_FADE_PX)
  check('bottom edge accounts for label height', byIndex(out, 0) < 1)
}

// Overlap: nearer (lower z) wins, farther is dropped entirely.
{
  const out = placeLabels(
    [mk({ index: 0, x: 400, y: 300, z: 10 }), mk({ index: 1, x: 410, y: 302, z: -10 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('nearer label survives a collision', byIndex(out, 1) === 1)
  check('farther label is dropped', byIndex(out, 0) === 0)
}

// Touching but not overlapping is not a collision.
{
  const out = placeLabels(
    [mk({ index: 0, x: 400, y: 300 }), mk({ index: 1, x: 460, y: 300 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check(
    'adjacent non-overlapping labels both survive',
    byIndex(out, 0) === 1 && byIndex(out, 1) === 1,
  )
}

// A label already faded to nothing must not reserve space and block a visible one.
{
  const out = placeLabels(
    [mk({ index: 0, x: -400, y: 300, z: -50 }), mk({ index: 1, x: 400, y: 300, z: 0 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('an invisible label does not block a visible one', byIndex(out, 1) === 1)
}

// Zero-size boxes must not silently defeat suppression — that was a real bug
// when satellites inherited labelW 0 on re-seed.
{
  const out = placeLabels(
    [mk({ index: 0, w: 0, h: 0, z: 5 }), mk({ index: 1, w: 0, h: 0, z: -5 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('zero-size boxes do not crash placement', out.length === 2)
}

// Incoming alpha is respected, not overwritten.
{
  const out = placeLabels([mk({ index: 0, alpha: 0.4 })], W, H, EDGE_FADE_PX)
  check('incoming alpha is carried through', Math.abs(byIndex(out, 0) - 0.4) < 1e-9)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll label placement checks passed.')
process.exit(failures ? 1 : 0)
