/**
 * The bench must survive being hammered.
 *
 * Spec §4.5, plan Task 12 step 3. The owner has already hit
 * `FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS` on this project once, and the
 * obvious remedy is a trap: `forceContextLoss()` PERMANENTLY poisons the canvas
 * element it was called on, so releasing a context on a canvas that will be
 * reused turns a leak into a dead canvas. The established pattern in this repo
 * is `<canvas key={nonce}>` plus `dispose(true)` — release the context ONLY
 * when the element goes with it.
 *
 * ⚠️ What this actually asserts, and why it is not just "replay 25 times".
 *
 * The SAMSARA bench replays by RESETTING the state machine, not by remounting
 * the canvas, so replay alone can never leak a context and a test that only
 * replayed would pass on any implementation. Two other paths can churn GPU
 * resources and both are exercised here:
 *
 *   - `rebuildRoom()`, which the DEPTH slider triggers — it disposes a floor,
 *     four walls, a backdrop and their materials, then builds fresh ones.
 *   - The reveal ramp, which flips `transparent` on those materials and so
 *     forces shader recompiles.
 *
 * The failure signature of a real context leak is Chrome's own
 * "Too many active WebGL contexts" warning followed by the oldest context being
 * dropped — which shows up as a canvas that is still in the DOM and still sized
 * but no longer draws. So the assertions are: no such warning, the context is
 * not lost, the canvas count did not grow, and SAMSARA still actually renders.
 */
import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BENCH = process.env.TT_BENCH ?? 'http://localhost:3000/en/dev/samsara'

const CYCLES = 25

let failures = 0
const check = (label, cond, note = '') => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  } else {
    console.log(`ok    ${label}   ${note}`)
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})
const page = await browser.newPage()

const warnings = []
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => {
  const t = m.text()
  if (/WebGL context|context lost|Too many active/i.test(t)) warnings.push(t)
})

await page.setViewport({ width: 1280, height: 800 })
await page.goto(BENCH, { waitUntil: 'networkidle0', timeout: 120000 })
await page.waitForFunction(() => typeof window.__ttSamsaraBench === 'function' || !!window.__ttSamsaraBench, {
  timeout: 120000,
})
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 120000 })
await new Promise((r) => setTimeout(r, 1500))

const before = await page.evaluate(() => ({
  canvases: document.querySelectorAll('canvas').length,
}))
check(`[baseline] the bench mounted its canvases`, before.canvases >= 2, `${before.canvases} canvases`)

// ── hammer it ───────────────────────────────────────────────────────
// Replays AND room rebuilds, interleaved: the rebuild is the path that actually
// touches GPU resources, and the replay is the one the plan names.
await page.evaluate(async (cycles) => {
  for (let i = 0; i < cycles; i++) {
    window.__ttSamsaraBench.replay()
    // Alternate the depth so every cycle really does rebuild, rather than
    // setting the same value and being debounced into a single no-op.
    window.__ttSamsaraBench.set('ROOM.DEPTH', 20 + (i % 7) * 4)
    await new Promise((r) => setTimeout(r, 120))
  }
}, CYCLES)

await new Promise((r) => setTimeout(r, 1200))

const after = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')]
  const mascot = document.querySelector('[data-mascot]')
  const gl = mascot ? mascot.getContext('webgl2') || mascot.getContext('webgl') : null
  return {
    canvases: canvases.length,
    foundMascotCanvas: !!mascot,
    contextAlive: !!gl,
    contextLost: gl ? gl.isContextLost() : true,
    sizedOk: mascot ? mascot.width > 0 && mascot.height > 0 : false,
  }
})

check(`no WebGL context warnings after ${CYCLES} cycles`, warnings.length === 0, warnings.slice(0, 2).join(' | '))
check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
check(
  'canvas count did not grow',
  after.canvases === before.canvases,
  `${before.canvases} -> ${after.canvases}`,
)
check('the mascot canvas is still in the DOM', after.foundMascotCanvas)
check('its WebGL context is still obtainable', after.contextAlive)
check('its WebGL context is NOT lost', !after.contextLost)
check('it still has a real drawing buffer', after.sizedOk)

// ── and it still WORKS, which a live-but-dead context would not show ──
await page.evaluate(() => {
  window.__ttSamsaraBench.set('ROOM.DEPTH', 26)
  window.__ttSamsaraBench.replay()
})
await new Promise((r) => setTimeout(r, 7000))

const final = await page.evaluate(() => ({
  seq: window.__ttSamsara(),
  rendered: window.__ttMascot().rendered,
  loaded: window.__ttMascot().loaded,
}))

check('the model is still loaded', final.loaded)
check(
  `the sequence still reaches landed after ${CYCLES} cycles`,
  final.seq.mode === 'landed',
  final.seq.mode,
)
check(
  'and SAMSARA still renders at the landed size',
  final.rendered.diameterPx > 0.3 * 800 - 8 && final.rendered.diameterPx < 0.3 * 800 + 400,
  `${final.rendered.diameterPx.toFixed(1)}px`,
)

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nNo context leak; the bench survives being hammered.')
process.exit(failures ? 1 : 0)
