// Regression test — under reduced motion the mark is HELD STILL, and held
// FRONTAL.
//
// The bug this guards against: `interactive` gated only the pointer handlers,
// not tick()'s idle spin, so `prefers-reduced-motion` still left the mark
// turning forever — and because the reduced-motion path reaches the mesh via
// finishIgnitionNow() (which, unlike startIgnition(), never calls resetPose()),
// it settled at whatever arbitrary angle the spin had reached. Visitors who ask
// their OS for less motion got a perpetually rotating logo sitting at a random
// oblique angle.
//
// On measuring "frontal" — one trap already paid for. The first attempt
// asserted "frontal = the widest projection" while measuring with the
// FLOATING WORDS STILL VISIBLE. Words land inside the centred crop, so they
// were swallowed by the ink bounding box and inflated it to 1.61 at an oblique
// angle, beating the true frontal face and failing the assertion against
// correct code. Hide the word layer and that contamination disappears.
//
// Even clean, though, "widest" is the wrong ground truth: the mark alone
// measures 1.206 frontal while the spin sweeps roughly 0.2–1.3, i.e. the
// rotating silhouette passes both BELOW and ABOVE the frontal value depending
// where the 400ms sampling lands. So frontality is asserted against the
// deterministic silhouette the engine produces at spinY = 0 (spin, velocity
// and tilt all zero). The spinning page is still sampled, purely to prove the
// metric would MOVE if the pose were wrong.
import { launch, watchErrors, probeWords, fresh, meanAbsDiff, rawRGB, waitForQuiet, report, BASE } from './t9-lib.mjs'

const OUT = fresh('t9-reduced-pose')
const W = 900
const H = 700

// Silhouette of the mark at spinY = 0, measured at exactly this viewport with
// the word layer hidden. The pose is fully deterministic (spin, velocity and
// tilt all zero), so this is stable — but it IS viewport-specific: re-measure
// if W/H above ever change.
const FRONTAL_RATIO = 1.206
const RATIO_TOL = 0.04

/** Hide the constellation words so the ink measurement sees only the mark. */
const hideWords = (page) =>
  page.evaluate(() => {
    for (const d of document.querySelectorAll('div')) {
      if (d.style.fontStyle === 'italic' && d.style.whiteSpace === 'nowrap') d.style.display = 'none'
    }
  })

/** Bounding box of the mark's ink within a centred crop, as {w, h, ratio}. */
function inkBox(pngPath, w, h, cropFrac = 0.6, threshold = 170) {
  const a = rawRGB(pngPath, w, h)
  const x0 = Math.floor((w * (1 - cropFrac)) / 2)
  const x1 = w - x0
  const y0 = Math.floor((h * (1 - cropFrac)) / 2)
  const y1 = h - y0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]
      if (lum < threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (minX === Infinity) return { w: 0, h: 0, ratio: 0 }
  const bw = maxX - minX
  const bh = maxY - minY
  return { w: bw, h: bh, ratio: bh > 0 ? bw / bh : 0 }
}

const browser = await launch()

// ---------------------------------------------------------------- reduced
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
const errors = watchErrors(page)
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const reduced = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

// The words only light once `cue` has fired, i.e. the mesh is on screen.
const deadline = Date.now() + 20000
let words = { total: 0, lit: 0, max: 0 }
while (Date.now() < deadline) {
  words = await probeWords(page)
  if (words.lit > 0) break
  await new Promise((r) => setTimeout(r, 100))
}
await waitForQuiet(page, OUT, W, H)
await hideWords(page)

// Sample well past the 1.2s idle threshold — the old bug only showed itself
// once the idle spin had resumed.
const frames = []
for (let i = 0; i < 10; i++) {
  const p = `${OUT}/r${String(i).padStart(2, '0')}.png`
  await page.screenshot({ path: p })
  frames.push(p)
  await new Promise((r) => setTimeout(r, 400))
}
const deltas = frames.slice(1).map((f, i) => meanAbsDiff(frames[i], f, W, H))
const maxDelta = Math.max(...deltas)
const reducedBox = inkBox(frames[frames.length - 1], W, H)
await page.close()

// ----------------------------------------------------------------- normal
// Find the widest projection the mark ever presents — that pose is frontal.
const p2 = await browser.newPage()
await p2.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
await p2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
await p2.goto(BASE, { waitUntil: 'domcontentloaded' })
await p2.waitForFunction(
  () => {
    const v = document.querySelector('video')
    return !v || v.ended || v.currentTime > 7.6
  },
  { timeout: 40000, polling: 100 },
)
await new Promise((r) => setTimeout(r, 2000)) // let the idle spin get going
await hideWords(p2)

// One revolution is ~14s; half of it is enough to sweep a wide range.
const ratios = []
for (let i = 0; i < 20; i++) {
  const p = `${OUT}/n${String(i).padStart(2, '0')}.png`
  await p2.screenshot({ path: p })
  ratios.push(inkBox(p, W, H).ratio)
  await new Promise((r) => setTimeout(r, 400))
}
const maxRatio = Math.max(...ratios)
const minRatio = Math.min(...ratios)
await p2.close()
await browser.close()

console.log('reduced frame-to-frame deltas:', deltas.map((d) => d.toFixed(3)).join(' '))
console.log(`reduced ink box: ${reducedBox.w}x${reducedBox.h} ratio ${reducedBox.ratio.toFixed(3)}`)
console.log(`spinning ratio range: ${minRatio.toFixed(3)} .. ${maxRatio.toFixed(3)} (frontal is ${FRONTAL_RATIO}, NOT the widest)`)

const checks = [
  ['prefers-reduced-motion is actually emulated', reduced === true],
  ['the mesh is reached — words lit', words.lit === words.total && words.total > 0, `${words.lit}/${words.total}`],
  [
    'the mark is COMPLETELY still under reduced motion',
    maxDelta < 0.5,
    `max frame delta ${maxDelta.toFixed(3)} across ${(frames.length - 1) * 0.4}s`,
  ],
  [
    'the metric is live — rotation moves it well beyond the tolerance',
    maxRatio - minRatio > RATIO_TOL * 4,
    `range ${minRatio.toFixed(3)}..${maxRatio.toFixed(3)} vs tolerance ±${RATIO_TOL}`,
  ],
  [
    'the held pose is frontal — the spinY = 0 silhouette',
    Math.abs(reducedBox.ratio - FRONTAL_RATIO) <= RATIO_TOL,
    `${reducedBox.ratio.toFixed(3)} vs frontal ${FRONTAL_RATIO} ±${RATIO_TOL}`,
  ],
  ['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')],
]

const failed = report(checks)
process.exit(failed === 0 ? 0 : 1)
