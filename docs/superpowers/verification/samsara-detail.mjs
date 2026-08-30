/**
 * The room's high-detail model swap. Owner requirement, spec §6.3b.
 *
 * The hero ships a 20k-triangle build, validated only up to the 70px the orbit
 * uses. The room shows SAMSARA at ~360px, where its silhouette facets and the
 * forehead monogram — modelled GEOMETRY, since the skin texture tiles 16x and
 * cannot carry a unique mark — stops being readable.
 *
 * ⚠️ THE FAILURE THIS EXISTS TO CATCH: the eye shader is injected through
 * onBeforeCompile on the MATERIALS. Swapping the model without re-running
 * patchEyes() gives SAMSARA no eyes at all in the room — and nothing throws,
 * nothing logs, the body just arrives blank-faced. Pixels are the only witness.
 */
import puppeteer from './_puppeteer.mjs'
import { createRequire } from 'node:module'
// sharp IS an app dependency; reach into the app's package root for it.
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PAGE_URL = process.env.TT_URL ?? 'http://localhost:3000/en'

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
await page.setViewport({ width: 1200, height: 1200 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 90000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 90000 })
// The sketch intro is opaque above the canvas until the ~7.67s handoff.
await new Promise((r) => setTimeout(r, 12000))

await page.evaluate(() => window.__ttSamsaraBig(700))


/**
 * Capture face-on with one expression forced.
 *
 * ⚠️ Do NOT score this by counting "amber" pixels.
 *
 * That was tried and it silently passed the negative test: SAMSARA is BRASS,
 * so `R > 150 && R > B + 45` matches most of its warm metal body — 99,682
 * "amber" pixels were counted on a build with the eye shader deliberately
 * removed. It was measuring the mascot, not its eyes. The mascot kill-switch
 * check was wrong three times for exactly this reason; see the harness README.
 *
 * The metric that actually discriminates is a DIFFERENCE between two
 * expressions. If the shader is not injected, the expression uniforms do
 * nothing and `wide` renders identically to `blink`.
 */
const shotWithExpr = async (expr) => {
  await page.evaluate((e) => window.__ttMascotExpr(e), expr)
  await new Promise((r) => setTimeout(r, 300))
  for (let i = 0; i < 400; i++) {
    const s = await page.evaluate(() => {
      const m = window.__ttMascot()
      return { facing: Math.cos(m.spin), x: m.pos.x, y: m.pos.y, d: m.diameterPx }
    })
    if (s.facing > 0.97) {
      // Crop tight to the face, so body pixels cannot dominate the difference.
      const half = s.d * 0.3
      const buf = await page.screenshot({
        clip: { x: Math.max(0, s.x - half), y: Math.max(0, s.y - half), width: half * 2, height: half * 2 },
      })
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
      return { data, info }
    }
    await new Promise((r) => setTimeout(r, 15))
  }
  return null
}

const meanAbsDiff = (a, b) => {
  const n = Math.min(a.data.length, b.data.length)
  let d = 0
  for (let i = 0; i < n; i++) d += Math.abs(a.data[i] - b.data[i])
  return d / n
}

const wideBefore = await shotWithExpr('wide')
const blinkBefore = await shotWithExpr('blink')
check('captured both expressions face-on before the swap', !!wideBefore && !!blinkBefore)
const diffBefore = wideBefore && blinkBefore ? meanAbsDiff(wideBefore, blinkBefore) : 0
check('eyes RESPOND to expression before the swap', diffBefore > 2, `mean|diff| ${diffBefore.toFixed(2)}`)

const swap = await page.evaluate(() => window.__ttSamsaraDetail())
check('the high-detail model loaded', swap.ok === true && swap.detail === true, JSON.stringify(swap))
await new Promise((r) => setTimeout(r, 900))

const wideAfter = await shotWithExpr('wide')
const blinkAfter = await shotWithExpr('blink')
check('captured both expressions face-on after the swap', !!wideAfter && !!blinkAfter)
const diffAfter = wideAfter && blinkAfter ? meanAbsDiff(wideAfter, blinkAfter) : 0

// ⚠️ THE assertions this file exists for. Without patchEyes() re-injection the
// expression uniforms are inert.
//
// Both thresholds come from measurement, not taste. With the shader removed the
// difference collapses to ~17.7 — NOT to zero, because `facing > 0.97` still
// admits a few degrees of spin and rotation alone moves pixels. So 17.7 is the
// jitter FLOOR, and an absolute threshold below it (2 was tried) passes a build
// with no eyes at all. Working builds measure 95–98.
const JITTER_FLOOR = 40
check(
  `eyes STILL respond to expression after the swap (floor ${JITTER_FLOOR})`,
  diffAfter > JITTER_FLOOR,
  `mean|diff| ${diffAfter.toFixed(2)}`,
)
check(
  'expression response is not gutted by the swap',
  diffBefore > 0 && diffAfter > diffBefore * 0.5,
  `${diffBefore.toFixed(2)} -> ${diffAfter.toFixed(2)}`,
)

// A second call must not reload or double-swap.
const again = await page.evaluate(() => window.__ttSamsaraDetail())
check('the swap is idempotent', again.ok === false && again.detail === true, JSON.stringify(again))

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

// Degradation: a missing asset must keep the 20k model, not break the room.
const page2 = await browser.newPage()
await page2.setViewport({ width: 1200, height: 1200 })
await page2.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 90000 })
await page2.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 90000 })
await new Promise((r) => setTimeout(r, 12000))
const missing = await page2.evaluate(() => window.__ttSamsaraDetail('/models/does-not-exist.glb'))
check('a missing detail asset degrades rather than throwing', missing.ok === false, JSON.stringify(missing))
const stillThere = await page2.evaluate(() => window.__ttMascot().loaded)
check('the 20k mascot survives a failed detail load', stillThere === true)

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nDetail swap checks passed.')
process.exit(failures ? 1 : 0)
