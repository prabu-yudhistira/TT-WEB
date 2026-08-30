// Proves a Hero Effects edit reaches the preview iframe WITHOUT saving, and
// that a page-sourced edit does the same for the constellation words.
//
// The postMessage envelope below is not a guess — it is copied from
// @payloadcms/ui's own LivePreviewWindow source (the ADMIN side that sends
// it): { type: 'payload-live-preview', collectionSlug, data, globalSlug,
// locale }. That mattered here: handleMessage() in @payloadcms/live-preview
// silently discards any message missing BOTH collectionSlug and globalSlug
// ("Only attempt to merge when we have a clear target"), so an envelope
// without one of those two fields looks like it worked (no error) while
// doing nothing.
//
// Also: mergeData() does not merge locally. Every live update round-trips
// through a real server endpoint — POST /api/globals/hero-effects, or
// POST /api/pages/{id}, each with an X-Payload-HTTP-Method-Override: GET
// header — and returns THAT response as the new data. So this test is
// exercising the real server round-trip, not a client-side simulation of one.
import puppeteer from './_puppeteer.mjs'
import { CHROME, ARGS, fresh, meanAbsDiff, report } from './t9-lib.mjs'

const OUT = fresh('preview-live')
const BASE = process.env.TT_URL_ORIGIN || 'http://localhost:3000'
const W = 1280
const H = 900

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })

// Log in through the API so the preview page's own fetches (if any) and the
// mergeData round-trip both have a valid session cookie.
const login = await browser.newPage()
await login.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
await login.evaluate(
  async (base) => {
    await fetch(`${base}/api/users/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
    })
  },
  BASE,
)
const cookies = await login.cookies()
await login.close()

async function newAuthedPage() {
  const p = await browser.newPage()
  await p.setViewport({ width: W, height: H })
  await p.setCookie(...cookies)
  return p
}

// --- 1. hero-effects source: preview reacts to a live, unsaved edit -------
const preview = await newAuthedPage()
await preview.goto(`${BASE}/en/admin-preview/hero?source=hero-effects`, {
  waitUntil: 'domcontentloaded',
})
await preview.waitForSelector('canvas', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 6000)) // settle past the intro
await preview.screenshot({ path: `${OUT}/a.png` })

await preview.evaluate(() => {
  window.postMessage(
    {
      type: 'payload-live-preview',
      globalSlug: 'hero-effects',
      locale: 'en',
      data: {
        ignitionCage: { cageOpacity: 1, cageDensity: 1 },
        ignitionEmbers: { emberEnabled: true, emberDensity: 1, emberSize: 14, emberOpacity: 1 },
      },
    },
    window.location.origin,
  )
})
// mergeData() is a real network round-trip, not instant.
await new Promise((r) => setTimeout(r, 2000))
await preview.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /replay/i.test(x.textContent || ''))
  b?.click()
})
await new Promise((r) => setTimeout(r, 4000))
await preview.screenshot({ path: `${OUT}/b.png` })

const delta = meanAbsDiff(`${OUT}/a.png`, `${OUT}/b.png`, W, H)

// The document must still be unsaved — read the ACTUAL saved value back.
const savedAfterLiveEdit = await preview.evaluate(async (base) => {
  const r = await fetch(`${base}/api/globals/hero-effects`, { credentials: 'include' })
  const j = await r.json()
  return j?.ignitionCage?.cageOpacity
}, BASE)
await preview.close()

// --- 2. page source: effects data must NOT cross over ----------------------
// Reduced motion is emulated here deliberately: the hero's own idle spin and
// floating-word drift are continuous, so a plain before/after screenshot a
// few seconds apart would show a large delta from ordinary animation alone —
// that is not a signal this check can use. Freezing the mark (proven in
// t9-reduced-motion-pose.mjs) removes that confound, so any pixel change left
// after posting a mismatched message can only be the guard failing to hold.
const other = await newAuthedPage()
await other.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await other.goto(`${BASE}/en/admin-preview/hero?source=page`, { waitUntil: 'domcontentloaded' })
await other.waitForSelector('canvas', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 3000)) // reach the settled, motionless state
await other.screenshot({ path: `${OUT}/c.png` })
await other.evaluate(() => {
  window.postMessage(
    {
      type: 'payload-live-preview',
      globalSlug: 'hero-effects', // deliberately the OTHER source's shape
      locale: 'en',
      data: { ignitionCage: { cageOpacity: 1, cageDensity: 1 } },
    },
    window.location.origin,
  )
})
await new Promise((r) => setTimeout(r, 2500))
await other.screenshot({ path: `${OUT}/d.png` })
const crossDelta = meanAbsDiff(`${OUT}/c.png`, `${OUT}/d.png`, W, H)
await other.close()

console.log('effects delta:', delta.toFixed(3), '| saved cageOpacity still:', savedAfterLiveEdit)
console.log('cross-source delta:', crossDelta.toFixed(3))

const checks = [
  ['the preview reacted to a live, unsaved edit', delta > 1, `mean abs diff ${delta.toFixed(3)}`],
  ['nothing was saved to the database', savedAfterLiveEdit !== 1, `stored cageOpacity = ${savedAfterLiveEdit}`],
  [
    'a hero-effects-shaped message is ignored when source=page',
    crossDelta < 1,
    `cross-source delta ${crossDelta.toFixed(3)}`,
  ],
]

const failed = report(checks)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
