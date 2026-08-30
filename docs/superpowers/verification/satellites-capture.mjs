// Baseline health check for the orbiting satellites: fps, ink on both
// canvases, motion between frames, label count, zero console errors.
//
// The in-app browser pane cannot do this: it reports the tab hidden, which
// throttles requestAnimationFrame to ~1Hz and stalls the engine's own clock
// (13 frames in 13 real seconds, measured), not just screenshot cadence.
//
// Usage: node satellites-capture.mjs [url] [outPrefix] [frames] [waitMs]

import puppeteer from './_puppeteer.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Per this directory's README these scripts are COPIED into a scratchpad that
// has puppeteer-core, and run from there — so nothing may be resolved
// relative to this file's own location.
const SHOTS = process.env.TT_SHOTS ?? 'shots'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// No ?satellites= param — the prototype's opt-in switch was removed once the
// field shipped on the real hero, fed by the CMS unconditionally.
const url = process.argv[2] ?? 'http://localhost:3000/en'
const prefix = process.argv[3] ?? 'sat'
const FRAMES = Number(process.argv[4] ?? 6)
const WAIT = Number(process.argv[5] ?? 15000)
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--window-size=1600,900'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 })
// Explicit: the owner's own machine had OS animations off once, which maps
// straight to prefers-reduced-motion and would make this render a static frame.
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
await page
  .waitForFunction(() => document.querySelector('[data-satellites="front"]') !== null, {
    timeout: 20000,
  })
  .catch(() => {})

const ink = () =>
  page.evaluate(() => {
    const read = (sel) => {
      const c = document.querySelector(sel)
      if (!c) return null
      const ctx = c.getContext('2d')
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++
      return { px: n, w: c.width, h: c.height }
    }
    return {
      back: read('[data-satellites="back"]'),
      front: read('[data-satellites="front"]'),
      labels: document.querySelectorAll('[data-satellites="labels"] > div').length,
    }
  })

// Let the entrance run — sketch video (~7.67s) + ENTRANCE_MS (1600ms) is
// ~9.3s minimum before anything real is on the canvases.
await new Promise((r) => setTimeout(r, WAIT))

// Real rAF rate — screenshot cadence would lie here.
const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0
      const t0 = performance.now()
      const tick = () => {
        n++
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
        else res(Math.round((n / (performance.now() - t0)) * 1000))
      }
      requestAnimationFrame(tick)
    }),
)

const samples = []
for (let i = 0; i < FRAMES; i++) {
  await page.screenshot({ path: join(SHOTS, `${prefix}-${String(i).padStart(2, '0')}.png`) })
  samples.push(await ink())
  await new Promise((r) => setTimeout(r, 420))
}

const movedBack = new Set(samples.map((s) => s.back?.px)).size
const movedFront = new Set(samples.map((s) => s.front?.px)).size

const report = {
  url,
  fps,
  frames: FRAMES,
  labels: samples[0].labels,
  backInkFirst: samples[0].back?.px ?? null,
  frontInkFirst: samples[0].front?.px ?? null,
  canvasSize: samples[0].front ? `${samples[0].front.w}x${samples[0].front.h}` : null,
  distinctBackInkCounts: movedBack,
  distinctFrontInkCounts: movedFront,
  consoleErrors: errors,
}
writeFileSync(join(SHOTS, `${prefix}-report.json`), JSON.stringify(report, null, 2))
await browser.close()

let failures = 0
const check = (label, cond) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

console.log(JSON.stringify(report, null, 2))

// Under software rasterisation this is a floor, not real-device performance —
// but this project's own benches held 50+ under the same conditions.
check('fps at or above a sane software-rasterisation floor', fps >= 30)
check('back canvas has ink', (report.backInkFirst ?? 0) > 0)
check('front canvas has ink', (report.frontInkFirst ?? 0) > 0)
check('back canvas ink changes between frames (it is animating)', movedBack > 1)
check('front canvas ink changes between frames (it is animating)', movedFront > 1)
check('labels are bound', report.labels > 0)
check('zero console errors', errors.length === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nBaseline health verified.')
process.exit(failures ? 1 : 0)
