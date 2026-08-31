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
 *
 * ⚠️ CORRECTION, Task 11 — every number this file produced before Task 11 was
 * measuring the wrong scene, and the floor was set from one of them.
 *
 * `__ttSamsaraRoom` deliberately did not swap the camera until the perspective
 * placement existed. So the room was being rendered through the ORTHOGRAPHIC
 * camera, whose frustum is the viewport in CSS PIXELS — and the room is ~42
 * WORLD units across. It drew as a ~40px smudge in the middle of the frame. The
 * 52.1 fps recorded at Task 8, and the 30 fps floor derived from it, describe
 * that smudge, not a room.
 *
 * With the camera correct the room fills the viewport, and the honest numbers
 * on this machine are:
 *
 *   SwiftShader (CPU raster)        orbit 42.2 -> room 16.3   (~58% cost)
 *   Intel UHD 630, ANGLE / D3D11    orbit 23.3 -> room 24.1   (no cost at all)
 *
 * The two disagree because full-viewport fill of PBR-shaded planes is exactly
 * the work a GPU does for free and a CPU rasteriser cannot. On hardware the
 * room is free; both figures there are rAF-limited by the rest of the hero.
 *
 * So FLOOR_FPS is lowered to 12 — and its job changes. It is no longer a
 * performance target; it is a tripwire for a catastrophic regression of the
 * ember-gl_PointSize kind, which is all a software rasteriser can honestly
 * report. Performance claims about this room need the hardware line above.
 */
import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PAGE_URL = process.env.TT_URL ?? 'http://localhost:3000/en'
const MEASURE_MS = 5000
// See the correction in the header: a tripwire, not a target. Measured 16.3 fps
// with the room correctly framed, against high run-to-run variance from machine
// load (22.5 fps on a loaded run, 16.3 on a quiet one).
const FLOOR_FPS = 12

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
