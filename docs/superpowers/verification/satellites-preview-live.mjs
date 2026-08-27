// Proves a Satellites edit reaches the admin-preview iframe WITHOUT saving.
//
// The postMessage envelope is the real one @payloadcms/ui's LivePreviewWindow
// sends — copied from preview-live-update.mjs, which is itself copied from
// the library's own source. mergeData() is not a local merge: it round-trips
// through POST /api/globals/hero-effects with a GET method-override and
// returns THAT response, so this exercises the real server path, not a
// client-side simulation of one.
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.TT_URL_ORIGIN ?? 'http://localhost:3000'
const EMAIL = process.env.TT_ADMIN_EMAIL ?? 'admin@tampa-taruno.local'
const PASSWORD = process.env.TT_ADMIN_PASSWORD ?? 'tampataruno-2026'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

// Log in through the API so the preview's own mergeData round-trip has a
// valid session cookie.
const login = await browser.newPage()
await login.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
await login.evaluate(
  async (base, email, password) => {
    await fetch(`${base}/api/users/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  },
  BASE,
  EMAIL,
  PASSWORD,
)
const cookies = await login.cookies()
await login.close()

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
await page.setCookie(...cookies)
// Reduced motion, deliberately: the engine draws ONE static frame and never
// loops (SatelliteEngine.drawStatic()), which removes the orbital-position
// confound entirely. Total ink otherwise swings ~2x between arbitrary moments
// just from how many of the orbiting spheres happen to be near-camera at that
// instant (apparent radius is boosted up to ~4.6x by SAT_DEPTH_SCALE) — that
// swing dwarfed a size-only signal on the first version of this check
// (checked against a magic "5x" ratio) and produced a false failure that did
// not reproduce once the confound was removed. setConfig() still calls
// drawStatic() again on a live edit, so reactivity is still exercised — just
// without the noise. Same discipline the README documents for
// preview-live-update.mjs's own cross-source check.
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await page.goto(`${BASE}/en/admin-preview/hero?source=hero-effects`, {
  waitUntil: 'domcontentloaded',
})
await page.waitForSelector('canvas', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 8000))

const inkSum = () =>
  page.evaluate(() => {
    let n = 0
    for (const sel of ['[data-satellites="back"]', '[data-satellites="front"]']) {
      const c = document.querySelector(sel)
      if (!c) continue
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++
    }
    return n
  })

// Two samples a second apart to confirm the baseline is genuinely settled —
// under reduced motion these should be byte-identical.
const before1 = await inkSum()
await new Promise((r) => setTimeout(r, 1000))
const before = await inkSum()

await page.evaluate(() => {
  window.postMessage(
    {
      type: 'payload-live-preview',
      globalSlug: 'hero-effects',
      locale: 'en',
      data: { satelliteLook: { size: 20, alpha: 1 } },
    },
    window.location.origin,
  )
})
// mergeData() is a real network round-trip, not instant.
await new Promise((r) => setTimeout(r, 2500))

const after = await inkSum()

// The document must still be unsaved.
const savedAfterLiveEdit = await page.evaluate(async (base) => {
  const r = await fetch(`${base}/api/globals/hero-effects`, { credentials: 'include' })
  const j = await r.json()
  return j?.satelliteLook?.size
}, BASE)

await page.close()
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

console.log('ink before1:', before1, '| before2:', before, '| after live edit:', after)
console.log('saved satelliteLook.size (should be unchanged):', savedAfterLiveEdit)

check('baseline had rendered something', before1 > 0)
check('baseline is byte-stable (a genuinely static frame, not still settling)', before === before1)
check('the live edit produced a clearly larger static frame', after > before * 3)
check('nothing was saved to the database', savedAfterLiveEdit !== 20)

console.log(failures ? `\n${failures} check(s) failed.` : '\nLive preview verified.')
process.exit(failures ? 1 : 0)
