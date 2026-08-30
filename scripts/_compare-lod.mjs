/**
 * Render SAMSARA at ROOM size and capture the face-on frame, so the shipped
 * 20k build and a higher-detail build can be compared where it matters.
 *
 * Why this exists: the decimation ladder in the mascot spec was validated
 * "at every size the hero uses" — 12.6px to 70px. The room lands SAMSARA at 40%
 * of viewport height, ~360px on desktop, over 5x larger than anything that test
 * covered. The forehead badge carrying the brand monogram is modelled GEOMETRY
 * (the skin texture tiles 16x, so it cannot carry a unique mark), which makes
 * the triangle budget — not the texture — what decides whether it survives.
 *
 *   node scripts/_compare-lod.mjs <outfile.png>
 */
import puppeteer from '../docs/superpowers/verification/_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'lod.png'
const SAMPLES = 40

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})
const page = await browser.newPage()
// Tall viewport so 40% of its height is a genuinely large mascot.
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 })
await page.goto('http://localhost:3000/en', { waitUntil: 'networkidle0', timeout: 90000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 90000 })

// ⚠️ `loaded` means the GLB decoded, and `diameterPx > 0` only means the engine
// has started placing — NEITHER means the mascot is on screen. The sketch-intro
// video is opaque and sits ABOVE the canvas until the ~7.67s handoff, so
// capturing on either of those signals photographs the video's logo instead.
// That happened twice before this wait was added.
//
// The satellites appearing is the real "hero is live" signal.
await page.waitForFunction(
  () => {
    const s = window.__ttSatellites && window.__ttSatellites()
    return s && s.count > 0 && window.__ttMascot().diameterPx > 0
  },
  { timeout: 60000 },
).catch(() => {})
await new Promise((r) => setTimeout(r, 11000))

await page.evaluate(() => window.__ttSamsaraBig(820))
// Hold a neutral face so the eyes do not change shape between the two runs.
await page.evaluate(() => window.__ttMascotExpr('neutral'))
await new Promise((r) => setTimeout(r, 800))

// Find the most face-on frame. The body spins at 113 deg/s, so a single
// screenshot is a coin flip on whether the badge is even pointing at us.
let best = -2
let bestShot = null
for (let i = 0; i < SAMPLES; i++) {
  const facing = await page.evaluate(() => Math.cos(window.__ttMascot().spin))
  if (facing > best) {
    best = facing
    const m = await page.evaluate(() => {
      const s = window.__ttMascot()
      return { x: s.pos.x, y: s.pos.y, d: s.diameterPx }
    })
    const half = Math.max(40, m.d * 0.62)
    bestShot = await page.screenshot({
      clip: {
        x: Math.max(0, m.x - half),
        y: Math.max(0, m.y - half),
        width: half * 2,
        height: half * 2,
      },
    })
  }
  if (best > 0.995) break
  await new Promise((r) => setTimeout(r, 40))
}

const { writeFileSync } = await import('node:fs')
writeFileSync(OUT, bestShot)
const d = await page.evaluate(() => window.__ttMascot().diameterPx)
console.log(`wrote ${OUT}  (facing ${best.toFixed(3)}, on-screen diameter ${d.toFixed(0)}px)`)

await browser.close()
