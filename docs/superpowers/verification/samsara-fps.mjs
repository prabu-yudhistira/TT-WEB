/**
 * Frame rate with the dark room and its shadow-casting key light live.
 *
 * ⚠️ Measures REAL rAF deltas via performance.now() inside the page — never
 * screenshot cadence, which reports the harness's own speed rather than the
 * renderer's. Same technique as fps-ignition.mjs.
 *
 * Why this exists at all: this project lost 5.9 fps once to a lighting-adjacent
 * bug that looked entirely reasonable in code — the common three.js
 * `gl_PointSize = 300.0 / -mv.z` idiom, which assumed a far larger world scale
 * and produced ~437px points, ~13,000 of them, additively blended. Toggling the
 * feature off gave 87 fps and isolated it instantly. So: measure with the room
 * ON and OFF and report both, rather than asserting a number in isolation.
 *
 * Software rasterisation (SwiftShader) — treat these as a FLOOR, not as
 * real-device performance.
 */
import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PAGE_URL = process.env.TT_URL ?? 'http://localhost:3000/en'
const MEASURE_MS = 5000
const FLOOR_FPS = 30

let failures = 0
const check = (label, cond) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 90000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 90000 })

const measure = (ms) =>
  page.evaluate(
    (d) =>
      new Promise((resolve) => {
        let frames = 0
        const t0 = performance.now()
        const tick = () => {
          frames++
          if (performance.now() - t0 < d) requestAnimationFrame(tick)
          else resolve((frames * 1000) / (performance.now() - t0))
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )

// Warm up — the first second after load is dominated by compilation.
await measure(1200)

const orbitFps = await measure(MEASURE_MS)

const state = await page.evaluate(() => window.__ttSamsaraRoom(true))
await new Promise((r) => setTimeout(r, 600))
const roomFps = await measure(MEASURE_MS)

await page.evaluate(() => window.__ttSamsaraRoom(false))
await browser.close()

console.log(`orbit only : ${orbitFps.toFixed(1)} fps`)
console.log(`with room  : ${roomFps.toFixed(1)} fps  (${state.mode}/${state.camera})`)
console.log(`cost       : ${(orbitFps - roomFps).toFixed(1)} fps`)

check('the room actually became visible', state.room === true && state.mode === 'room')
check('the camera swapped to perspective', state.camera === 'perspective')
check(`room holds above ${FLOOR_FPS}fps under software raster (${roomFps.toFixed(1)})`, roomFps >= FLOOR_FPS)

// ⚠️ There is deliberately NO relative "the room must cost less than X% of the
// orbit" assertion, and the reason is worth keeping.
//
// Such a check was written first and failed at 53%. But it compares
// incomparable scenes: the orbit draws ONE small object on a transparent
// background, while the room fills the whole viewport with PBR-shaded geometry
// lit by an environment map. Roughly halving the frame rate is what a room IS,
// not a defect, and a threshold there would only ever be tuned until it passed.
//
// It is also not the shadows. Measured: a 512 shadow map costs the same as 1024
// (53.0 vs 52.7 fps), so the cost is fill rate, not shadow resolution.
//
// The absolute floor above is the assertion that discriminates. The failure
// being guarded against — the ember gl_PointSize bug — showed up as 5.9 fps
// ABSOLUTE, which a floor catches instantly and a ratio would have missed.
console.log(
  `\nnote: the room costs ~${(((orbitFps - roomFps) / orbitFps) * 100).toFixed(0)}% here. ` +
    'Expected — it fills the viewport with lit geometry. Software raster is a floor, not device performance.',
)

console.log(failures ? `\n${failures} check(s) failed.` : '\nRoom frame rate is acceptable.')
process.exit(failures ? 1 : 0)
