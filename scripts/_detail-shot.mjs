/**
 * Capture SAMSARA face-on at a large size, optionally after swapping in the
 * high-detail room model, so the result can be compared against the owner's
 * reference renders.
 *
 *   node scripts/_detail-shot.mjs <out.png> [--detail]
 */
import puppeteer from '../docs/superpowers/verification/_puppeteer.mjs'

const OUT = process.argv[2] ?? 'shot.png'
const WANT_DETAIL = process.argv.includes('--detail')

const b = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})
const p = await b.newPage()
await p.setViewport({ width: 1400, height: 1400, deviceScaleFactor: 2 })
await p.goto('http://localhost:3000/en', { waitUntil: 'networkidle0', timeout: 90000 })
await p.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 90000 })
// The sketch-intro video is opaque above the canvas until the ~7.67s handoff.
await new Promise((r) => setTimeout(r, 12000))

if (WANT_DETAIL) {
  const res = await p.evaluate(() => window.__ttSamsaraDetail())
  console.log('detail swap:', JSON.stringify(res))
  if (!res.ok) {
    console.error('FAIL: detail model did not load')
    await b.close()
    process.exit(1)
  }
}

await p.evaluate(() => window.__ttSamsaraBig(900))
await p.evaluate(() => window.__ttMascotExpr('neutral'))
await new Promise((r) => setTimeout(r, 900))

// ⚠️ Poll facing CHEAPLY, then take ONE screenshot.
//
// Screenshotting on every improvement is slow enough that the loop never covers
// a full 3.2s revolution (SPIN_SPEED 113 deg/s), so it settles for whatever
// partial angle it happened to catch. Measured: it stalled at facing 0.795 and
// never showed the forehead badge at all — which is the single detail this
// capture exists to check.
let best = -2
for (let i = 0; i < 400; i++) {
  const f = await p.evaluate(() => Math.cos(window.__ttMascot().spin))
  if (f > best) best = f
  if (f > 0.995) break
  await new Promise((r) => setTimeout(r, 15))
}

const m = await p.evaluate(() => {
  const s = window.__ttMascot()
  return { x: s.pos.x, y: s.pos.y, d: s.diameterPx }
})
const half = m.d * 0.72
const shot = await p.screenshot({
  clip: {
    x: Math.max(0, m.x - half),
    y: Math.max(0, m.y - half),
    width: half * 2,
    height: half * 2,
  },
})

const { writeFileSync } = await import('node:fs')
writeFileSync(OUT, shot)
console.log(`wrote ${OUT} (facing ${best.toFixed(3)}, diameter ${m.d.toFixed(0)}px)`)
await b.close()
