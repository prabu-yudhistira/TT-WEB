/**
 * The parked mascot's golden smoke — does it actually reach the screen?
 *
 * `roomBurst.check.ts` pins the scheduling and the geometry as pure arithmetic.
 * None of that proves a single pixel is drawn, and this effect had two ways to
 * be invisible while every unit test passed:
 *
 *  1. WRONG SPACE. The hero's existing dust lives in screen pixels under an
 *     ORTHOGRAPHIC camera. The room is PERSPECTIVE, where those same numbers
 *     land hundreds of world units off-frustum. A burst written against the old
 *     helper renders nothing at all, silently.
 *
 *  2. WRONG SIZE. `gl_PointSize` under a perspective camera needs the
 *     projection divide. Get the scale wrong and the motes are either sub-pixel
 *     or, as happened once in this project's ignition, ~437px each at 5.9fps.
 *
 * So this measures PIXELS: it samples the room before a burst and during one,
 * and requires gold to have appeared. It also holds the run long enough to see
 * the interval actually repeat, because "it fired once on arrival" and "it
 * fires every 4 seconds" are different features.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-burst.mjs
 */
import puppeteer from './_puppeteer.mjs'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.TT_URL ?? 'http://localhost:3000/en'

let failures = 0
const check = (label, cond, note = '') => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  } else {
    console.log(`ok    ${label}   ${note}`)
  }
}

/**
 * Gold, counted honestly. The room is graphite (#08080A walls, a mid-grey
 * floor) and SAMSARA is warm brass, so "bright pixels" alone would just be
 * counting the mascot. A mote is additive gold: strongly red-dominant, clearly
 * lit, and — the part that separates it from the body — it appears where there
 * was nothing before, which is why every count below is a DIFFERENCE.
 */
const goldPixels = async (buf, accept) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let n = 0
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * info.channels
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (!(r > 110 && r > b + 55 && g > b + 20 && g < r)) continue
    if (accept && !accept(p % info.width, Math.floor(p / info.width))) continue
    n++
  }
  return n
}

// The gates write here rather than into eyeshots/, which eyes-legibility
// readdir()s and asserts holds exactly the 14 expression crops.
mkdirSync('samsarashots', { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 120000 })
await page.waitForFunction(() => typeof window.__ttSamsara === 'function', { timeout: 60000 })
await new Promise((r) => setTimeout(r, 1200))

// ── into the room ────────────────────────────────────────────────────
const landed = await page.evaluate(async () => {
  for (let i = 0; i < 4; i++) {
    window.__ttSamsaraBeat('down')
    await new Promise((r) => setTimeout(r, 120))
  }
  const t0 = performance.now()
  while (performance.now() - t0 < 15000) {
    if (window.__ttSamsara().mode === 'landed') break
    await new Promise((r) => setTimeout(r, 100))
  }
  return window.__ttSamsara().mode
})
check('reached the room', landed === 'landed', landed)

const cfg = await page.evaluate(() => window.__ttBurst && window.__ttBurst().cfg)
check('the burst dev handle is exposed', !!cfg)
const intervalMs = cfg?.INTERVAL_MS ?? 4000
check('it is the owner-approved 4 second interval', intervalMs === 4000, `${intervalMs}ms`)

/**
 * A quiet frame: no motes alive. Taken from the ENGINE's own count rather than
 * from a timer, because a screenshot raced against the schedule would compare
 * two frames that both happen to have dust in them.
 */
const settle = async () => {
  const t0 = Date.now()
  while (Date.now() - t0 < intervalMs + 4000) {
    const alive = await page.evaluate(() => window.__ttBurst().alive)
    if (alive === 0) return true
    await new Promise((r) => setTimeout(r, 60))
  }
  return false
}
check('the dust drains completely between bursts', await settle())

/**
 * ⚠️ Counted in a RING the body never occupies, not over the whole screen.
 *
 * SAMSARA is brass, so a full-frame gold count is ~74,000 before any dust
 * exists, and HOVER_BOB_PX moves that whole silhouette by ±8px every cycle.
 * The edge pixels that shifts are the same order as the burst itself, so a
 * whole-frame difference measures the bob as much as the dust. The ring starts
 * outside the body plus its bob and ends past where motes travel.
 *
 * The dpr is 1 in this headless run, so CSS px and image px coincide; the
 * assertion below would need scaling if that ever changed.
 */
/**
 * ⚠️ PIN THE EXPRESSION FIRST, or the face measurement below is meaningless.
 *
 * The room runs an idle eye loop — mostly neutral with a blink every couple of
 * seconds — and the lit amber eyes are by far the largest gold area inside the
 * face. Left live, the "quiet" and "during" frames catch different expressions:
 * the first run of this check read 4,085 then 22,834 gold pixels on the face
 * and flagged smoke drawing over it, when all that had happened was that
 * SAMSARA blinked in one frame and not the other.
 */
await page.evaluate(() => window.__ttMascotExpr('neutral'))
await new Promise((r) => setTimeout(r, 900))

const body = await page.evaluate(() => {
  const m = window.__ttMascot()
  return { x: m.rendered.x, y: m.rendered.y, d: m.rendered.diameterPx }
})
const R = body.d / 2
const inRing = (x, y) => {
  const dist = Math.hypot(x - body.x, y - body.y)
  return dist > R * 1.25 && dist < R * 2.6
}
const onFace = (x, y) => Math.hypot(x - body.x, y - body.y) < R * 0.55

const quietShot = await page.screenshot()
const quietRing = await goldPixels(quietShot, inRing)
const quietFace = await goldPixels(quietShot, onFace)
await sharp(quietShot).toFile('samsarashots/burst-quiet.png')

// ── fire one on demand and look ──────────────────────────────────────
await page.evaluate(() => window.__ttBurst().fire())
// Part-way through the life, so the motes have cleared the silhouette but have
// not faded out. Sampling at t=0 would catch them still hidden BEHIND the body.
await new Promise((r) => setTimeout(r, 420))
const burstShot = await page.screenshot()
const duringRing = await goldPixels(burstShot, inRing)
const duringFace = await goldPixels(burstShot, onFace)
await sharp(burstShot).toFile('samsarashots/burst-during.png')

check(
  'golden smoke is actually PAINTED outside the body during a burst',
  duringRing > quietRing + 300,
  `ring ${quietRing} quiet -> ${duringRing} during (+${duringRing - quietRing})`,
)

// ── it comes from BEHIND, not over the face ──────────────────────────
//
// The body writes depth and the motes do not, so anything still behind the
// silhouette is hidden. With depthTest off the burst would draw straight over
// the face — where the eyes are, which is the whole point of the room — and
// this count would jump. The face is already amber, so it is a CHANGE budget.
check(
  'and none of it draws over SAMSARA’s face',
  duringFace <= quietFace * 1.06 + 120,
  `face ${quietFace} -> ${duringFace}`,
)

// ── and it repeats on the interval, unprompted ───────────────────────
/**
 * ⚠️ Measured between two consecutive RISING EDGES of the live count, not from
 * the manual fire above.
 *
 * `fire()` deliberately does not touch the schedule — it is a bench trigger, so
 * that pressing it does not shift the rhythm being tuned. Timing from it
 * therefore measures "time left in whatever cycle was already running", which
 * is a number between 0 and the interval. The first version of this check did
 * exactly that and reported 1772ms against a correct 4000ms clock.
 */
/**
 * ⚠️ Timed on the ENGINE's clock, not on wall clock, and that distinction is
 * load-bearing rather than pedantic.
 *
 * The schedule advances with the render loop's own accumulated time. Under
 * headless software rasterisation this page runs at a fraction of real frame
 * rate, so a wall-clock stopwatch measures the RENDERER, not the schedule —
 * this check read 5,667ms against a perfectly correct 4,000ms clock once the
 * puff count went up and frames got heavier. On real hardware the two agree;
 * in here only the engine clock is meaningful.
 *
 * The rising-edge detection stays, because "it fired twice" is what proves the
 * timer repeats rather than firing once on arrival.
 */
{
  const edges = []
  const deadline = Date.now() + intervalMs * 6 + 20000
  let wasAlive = (await page.evaluate(() => window.__ttBurst().alive)) > 0
  while (Date.now() < deadline && edges.length < 2) {
    const st = await page.evaluate(() => window.__ttBurst())
    const alive = st.alive > 0
    if (alive && !wasAlive) edges.push(st.elapsed)
    wasAlive = alive
    await new Promise((r) => setTimeout(r, 40))
  }
  check('bursts keep firing on their own', edges.length === 2, `${edges.length} rising edge(s)`)
  if (edges.length === 2) {
    const gapMs = (edges[1] - edges[0]) * 1000
    check(
      'and the gap really is the configured interval',
      gapMs > intervalMs * 0.85 && gapMs < intervalMs * 1.15,
      `${gapMs.toFixed(0)}ms of engine time vs ${intervalMs}ms`,
    )
  }
}

// ── nothing of it leaks into the hero orbit ──────────────────────────
{
  const back = await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      window.__ttSamsaraBeat('up')
      await new Promise((r) => setTimeout(r, 120))
    }
    const t0 = performance.now()
    while (performance.now() - t0 < 12000) {
      if (window.__ttSamsara().mode === 'idle') break
      await new Promise((r) => setTimeout(r, 100))
    }
    // Long enough for any in-flight motes to die.
    await new Promise((r) => setTimeout(r, 3500))
    return { mode: window.__ttSamsara().mode, alive: window.__ttBurst().alive }
  })
  check('scrolling back returns to the hero', back.mode === 'idle', back.mode)
  check('and no dust is left alive there', back.alive === 0, `${back.alive} motes`)
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nThe parked mascot sheds golden smoke.')
process.exit(failures ? 1 : 0)
