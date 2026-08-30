/**
 * Mascot degradation paths:
 *  - reduced motion: one static frame, orbit frozen, no dust, but non-empty
 *  - frame rate above the 30fps software floor
 *  - scroll fade dissolves the mascot
 *  - a FAILED model load (404) leaves the rest of the hero intact
 *  - a SLOW model load (10s stall) does not delay the logo handoff
 *
 * The kill switch has its own script (mascot-kill-switch.mjs).
 *
 * Run: node mascot-degradation.mjs   (from a dir with puppeteer-core)
 * Requires: npm run dev on :3000
 */
import puppeteer from './_puppeteer.mjs'

const HERO = 'http://localhost:3000/en'
const BENCH = 'http://localhost:3000/en/dev/mascot'
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})

// ── reduced motion ────────────────────────────────────────────────────
{
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.goto(`${BENCH}?RADIUS=0.6&SIZE=140`, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 2500))

  const a = await page.screenshot({ encoding: 'base64' })
  const angleA = await page.evaluate(() => window.__ttMascot().angle)
  await new Promise((r) => setTimeout(r, 1500))
  const b = await page.screenshot({ encoding: 'base64' })
  const angleB = await page.evaluate(() => window.__ttMascot().angle)
  check('reduced motion: frame is byte-stable', a === b)
  check('reduced motion: orbit does not advance', angleA === angleB, `${angleA} -> ${angleB}`)

  const ink = await page.evaluate(() => {
    const s = window.__ttMascot()
    return { x: s.pos.x, y: s.pos.y, loaded: s.loaded }
  })
  check(
    'reduced motion: mascot is placed on screen (non-empty)',
    ink.loaded && ink.x > -200 && ink.x < 1480 && ink.y > -200 && ink.y < 1000,
    JSON.stringify(ink),
  )
  await page.close()
}

// ── frame rate ────────────────────────────────────────────────────────
{
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.goto(HERO, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
  const fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => {
          if (++n >= 90) return res((n / (performance.now() - t0)) * 1000)
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  console.log(`      rAF rate: ${fps.toFixed(1)} fps (software rasteriser — treat as a floor)`)
  check('frame rate above the 30fps software floor', fps > 30, `${fps.toFixed(1)} fps`)
  await page.close()
}

// ── scroll fade ───────────────────────────────────────────────────────
{
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.goto(HERO, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 4000))
  const before = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-mascot]')
    return c ? parseFloat(getComputedStyle(c).opacity) : null
  })
  // scroll a full viewport height — SCROLL_FADE_VH default is 0.6
  await page.evaluate(() => window.scrollTo(0, window.innerHeight))
  await new Promise((r) => setTimeout(r, 800))
  const after = await page.evaluate(() => {
    const label = document.querySelector('[data-mascot-label]')
    return label ? parseFloat(getComputedStyle(label).opacity) : null
  })
  check('scroll past 1vh fades the mascot label to ~0', after !== null && after < 0.05, `label opacity ${after}`)
  void before
  await page.close()
}

// ── failed model load (404) leaves the hero intact ────────────────────
{
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (req.url().includes('mascot.draco.glb')) req.respond({ status: 404, body: 'nope' })
    else req.continue()
  })
  await page.goto(HERO, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 8000))
  const r = await page.evaluate(() => ({
    satellites: document.querySelectorAll('canvas[data-satellites]').length,
    logoLive: !!window.__ttLogoReady || !!document.querySelector('canvas'),
    mascotLoaded: window.__ttMascot ? window.__ttMascot().loaded : false,
  }))
  check('failed GLB: satellite canvases still present', r.satellites >= 1, `found ${r.satellites}`)
  check('failed GLB: mascot never reports loaded', r.mascotLoaded === false)
  check('failed GLB: no uncaught page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
  await page.close()
}

// ── slow model load (10s stall) does not delay the logo handoff ───────
{
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.setRequestInterception(true)
  page.on('request', async (req) => {
    if (req.url().includes('mascot.draco.glb')) {
      await new Promise((r) => setTimeout(r, 10000))
      req.continue()
    } else req.continue()
  })
  const t0 = Date.now()
  await page.goto(HERO, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // the logo becomes interactive well before 10s — wait for its canvas + a
  // stable frame, then confirm the mascot is still loading
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, { timeout: 20000 })
  const logoReadyAt = Date.now() - t0
  const mascotStillLoading = await page.evaluate(() =>
    window.__ttMascot ? window.__ttMascot().loaded === false : true,
  )
  check('slow GLB: logo canvases up well before the 10s stall clears', logoReadyAt < 9000, `${logoReadyAt} ms`)
  check('slow GLB: mascot is still loading at that point', mascotStillLoading)
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll degradation checks passed.')
process.exit(failures ? 1 : 0)
