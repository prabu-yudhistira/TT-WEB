/**
 * mascotEnabled OFF must remove the mascot ENTIRELY — no canvas in the DOM, no
 * WebGL context, and mascot.draco.glb never fetched. Not merely "blank". This
 * bug class (a switch that leaves the effect half-running) has shipped THREE
 * times on this project.
 *
 * Flips the REAL CMS value both ways via authenticated POST and checks the
 * live homepage each time.
 *
 * Run: node docs/superpowers/verification/mascot-kill-switch.mjs
 * Requires: npm run dev on :3000
 */
import puppeteer from './_puppeteer.mjs'

const BASE = 'http://localhost:3000'
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

const token = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
})
  .then((r) => r.json())
  .then((j) => j.token)
if (!token) throw new Error('login failed')

const setEnabled = (v) =>
  fetch(`${BASE}/api/globals/hero-effects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ mascotEnabled: v }),
  }).then((r) => r.json())

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})

/**
 * @param expectLoad true when the mascot is supposed to be ON.
 *
 * ⚠️ The two polarities need OPPOSITE waiting strategies, and conflating them
 * made this check fail for the wrong reason:
 *
 *   ON  — wait for the CONDITION (the model finishing). A fixed sleep raced a
 *         cold dev-server fetch of the 530 KB GLB on the first load after the
 *         CMS write, and the probe read `loaded:false` with the request still
 *         in flight and therefore NO Resource Timing entry yet. That reported
 *         "model never fetched" on a build where the model loads perfectly —
 *         a false failure that says nothing about the kill switch.
 *   OFF — wait a fixed TIME. The assertion is that nothing ever happens, and
 *         there is no condition to wait for; only elapsed time can support it.
 */
async function probe(expectLoad) {
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.goto(`${BASE}/en`, { waitUntil: 'networkidle2', timeout: 60000 })
  if (expectLoad) {
    // Bounded: if it genuinely never loads, fall through and let the assertions
    // below report it rather than hanging.
    await page
      .waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 45000 })
      .catch(() => {})
  }
  await new Promise((r) => setTimeout(r, 6000))
  const r = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas[data-mascot]').length,
    labelNodes: document.querySelectorAll('[data-mascot-label]').length,
    handle: typeof window.__ttMascot,
    glb: performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('mascot.draco.glb')).length,
  }))
  await page.close()
  return r
}

try {
  await setEnabled(false)
  const off = await probe(false)
  check('OFF: no mascot canvas', off.canvases === 0, `found ${off.canvases}`)
  check('OFF: no mascot label node', off.labelNodes === 0, `found ${off.labelNodes}`)
  check('OFF: mascot model never fetched', off.glb === 0, `${off.glb} request(s)`)
  check('OFF: no dev handle (engine never constructed)', off.handle === 'undefined')

  await setEnabled(true)
  const on = await probe(true)
  check('ON: mascot canvas present', on.canvases === 1, `found ${on.canvases}`)
  check('ON: model fetched once', on.glb === 1, `${on.glb} request(s)`)
} finally {
  await setEnabled(true) // leave it on
  await browser.close()
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nKill switch verified both ways.')
process.exit(failures ? 1 : 0)
