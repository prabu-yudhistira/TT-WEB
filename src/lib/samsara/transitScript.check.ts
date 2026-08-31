/**
 * Pins the transit path and the layer-promotion guard.
 *
 * The far point is the BACK of the orbit (owner-confirmed 2026-08-30), at angle
 * π/2 where projectOrbit's depth term is maximal. With shipped belt values that
 * puts SAMSARA ~213px ABOVE the mark, inside its horizontal span, at its
 * smallest, and drawing on the back canvas.
 *
 * ⚠️ The spec's original reading of what follows was wrong, and these
 * assertions are what caught it. It claimed SAMSARA would fall BEHIND the mark
 * for ~397px and that the promotion had to wait until it emerged below. Both
 * halves fail against measurement: the boxes do not intersect at the far point
 * (~30px gap against a ~10px radius), and with the landed pose at Y_FRAC 0.52
 * SAMSARA never descends past the logo's bottom edge at all. See
 * hasClearedLogo's own comment for the full account.
 *
 * Fixture values below were DERIVED by running projectOrbit with the shipped
 * belt config, not hand-computed. If one fails, re-derive it the same way — do
 * not paste new output, that would defeat the lock.
 * Run: npm run verify:config
 */
import { farPointAngle, transitPoseAt, hasClearedLogo, type Box, type TransitContext } from './transitScript'
import { DEFAULT_SEQUENCE } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// projectOrbit's depth term is maximal at sin(angle) = 1.
check('far point is angle pi/2', Math.abs(farPointAngle() - Math.PI / 2) < 1e-9)

// ── desktop 1440x900, shipped belt values ───────────────────────────
// Logo half-height 183.6 = HEIGHT_FRAC 0.408 of 900, halved.
const ctx: TransitContext = {
  cfg: DEFAULT_SEQUENCE,
  W: 1440,
  H: 900,
  mobile: false,
  cx: 720,
  cy: 450,
  hh: 183.6,
  orbitR: 511.2,
  height: 136,
  plane: { TILT: 20, TILT_SIDEWAY: 160, PERSPECTIVE: 1300 },
  startSizePx: 21,
}
const logo: Box = { x: 720 - 183.6, y: 450 - 183.6, w: 367.2, h: 367.2 }

// ── the far point, per spec §5.6 ────────────────────────────────────
{
  const p0 = transitPoseAt(0, ctx)
  check(`t=0 x offset ~ -77.6 (got ${(p0.x - 720).toFixed(2)})`, Math.abs(p0.x - 720 + 77.61) < 1)
  check(`t=0 y offset ~ -213.2 (got ${(p0.y - 450).toFixed(2)})`, Math.abs(p0.y - 450 + 213.23) < 1)
  // ABOVE the mark, not below — the correction that came out of the owner's
  // "furthest from the viewer" answer.
  check(`t=0 is ABOVE the logo box (${p0.y.toFixed(1)} < ${logo.y.toFixed(1)})`, p0.y < logo.y)
  check('t=0 is left of the logo centre', p0.x < 720)
  // Inside the logo's horizontal span, but ABOVE its box — so the promotion IS
  // a no-op here, by a thin and viewport-dependent margin.
  check('t=0 overlaps the logo horizontally', p0.x > logo.x && p0.x < logo.x + logo.w)
  check(`t=0 is at its smallest (${p0.sizePx.toFixed(1)}px)`, p0.sizePx < 40)
}

// ── it descends, and it grows ───────────────────────────────────────
const samples = Array.from({ length: 400 }, (_, i) => transitPoseAt(i / 399, ctx))
{
  check('descends overall', samples[399].y > samples[0].y)
  check('grows overall', samples[399].sizePx > samples[0].sizePx)
  // Read from the config, not restated. The fraction is owner-tuned (0.4 ->
  // 0.435 at the freeze gate) and the thing under test here is that the script
  // ARRIVES at the configured size — pinning the number itself is types.check's
  // job, and doing it in both places means a retune fails in two files for one
  // reason.
  const wantDesktop = DEFAULT_SEQUENCE.LANDING.SIZE_FRAC * 900
  check(
    `lands at the configured size (${samples[399].sizePx.toFixed(1)} vs ${wantDesktop})`,
    Math.abs(samples[399].sizePx - wantDesktop) < 6,
  )
  check(
    `lands right of centre (x ${samples[399].x.toFixed(0)} of 1440)`,
    samples[399].x > 720,
  )
}

// ── THE PROMOTION GUARD ─────────────────────────────────────────────
// ⚠️ Measured, not assumed: at the far point SAMSARA's box clears the mark's by
// ~30px against its own ~10px radius, so the promotion is already a visual
// no-op there and fires immediately. The spec's original claim — that it must
// wait ~397px until SAMSARA "emerges below the mark" — was wrong twice over:
// the boxes never overlap at the far point, AND with the landed pose at
// Y_FRAC 0.52 SAMSARA never descends past the logo's bottom edge at all, so
// such a gate could never fire. See hasClearedLogo's own comment.
{
  const cleared = samples.map((p) => hasClearedLogo(p, logo))
  check('cleared at the far point — promotion is a no-op there', cleared[0] === true)
  // Deliberately NOT asserted: that it is still cleared at the LANDING. It is
  // not — the landed mascot is 360px tall and overlaps where the mark's box
  // was. That is fine and expected: by then the room covers the hero and the
  // logo is gone. The guard is consulted once, at promotion time.
  check('an overlapping pose would defer promotion', cleared.some((c) => !c))

  // The far point's margin is small and viewport-dependent. Pin it, so a
  // retune that erases it fails here rather than on screen.
  const p0 = transitPoseAt(0, ctx)
  const gap = logo.y - (p0.y + p0.sizePx / 2)
  check(`far point clears the mark's box by ${gap.toFixed(1)}px`, gap > 0)
  check('that margin is thin enough to be worth guarding', gap < 80)
}

// Pin hasClearedLogo's polarities directly, so a sign slip inside it cannot
// hide behind the path's shape.
{
  const overlapping = { x: 720, y: 450, sizePx: 40, depth01: 0 }
  const below = { x: 720, y: 450 + 183.6 + 100, sizePx: 40, depth01: 1 }
  const aside = { x: 1400, y: 450, sizePx: 40, depth01: 1 }
  check('a pose over the mark is NOT cleared', hasClearedLogo(overlapping, logo) === false)
  check('a pose well below the mark IS cleared', hasClearedLogo(below, logo) === true)
  check('a pose well to the side IS cleared', hasClearedLogo(aside, logo) === true)
}

// ── mobile portrait ─────────────────────────────────────────────────
// Owner's composition: SAMSARA on top, chatbox below it.
{
  const m: TransitContext = { ...ctx, W: 390, H: 844, mobile: true, cx: 195, cy: 300, hh: 101 }
  const end = transitPoseAt(1, m)
  check(`mobile lands in the upper half (y ${end.y.toFixed(0)} of 844)`, end.y < 844 * 0.5)
  // MOBILE_SIZE_FRAC, which the owner set independently of the desktop one at
  // the freeze gate (0.35 vs 0.435) — a phone has less room to give.
  const wantMobile = DEFAULT_SEQUENCE.LANDING.MOBILE_SIZE_FRAC * 844
  check(
    `mobile lands at the configured size (${end.sizePx.toFixed(1)} vs ${wantMobile})`,
    Math.abs(end.sizePx - wantMobile) < 6,
  )
  check('mobile lands near horizontal centre', Math.abs(end.x - 195) < 60)
}

// ── the start pose must come from projectOrbit, not a copy of it ────
// If someone re-implements the projection here, changing the belt would move
// the satellites and leave SAMSARA behind. Feeding a different plane must move
// the far point.
{
  const tilted: TransitContext = { ...ctx, plane: { TILT: 40, TILT_SIDEWAY: 160, PERSPECTIVE: 1300 } }
  const a = transitPoseAt(0, ctx)
  const b = transitPoseAt(0, tilted)
  check('the far point tracks the belt plane', Math.abs(a.y - b.y) > 1)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll transit script checks passed.')
process.exit(failures ? 1 : 0)
