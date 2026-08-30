// Reduced-motion and mobile checks for the orbiting satellites.
//
// Reduced motion is not cosmetic on this project: an idle spin that ignored it
// read as "the whole site is broken" in August (see _HANDOFF/HANDOFF.md,
// 2026-08-22). The site honours the preference in 19 places.
//
// Byte-stability alone is NOT a sufficient assertion here — it passes happily
// on a blank canvas. That is exactly how a real defect stayed invisible: an
// earlier, wider orbit band rendered ~76px of ink under reduced motion at
// 1440x900 (effectively one satellite, everything else off-frame at its
// seeded angle), which the stability check alone called a pass. Tightening
// the band fixed it as a side effect (3634px at the same viewport), but the
// MIN_STATIC_INK floor below exists so a regression like that fails loudly
// again instead of quietly passing.

import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.TT_URL ?? 'http://localhost:3000/en'
const SHOTS = process.env.TT_SHOTS ?? 'shots'

// A near-empty static field is a defect, not a pass.
const MIN_STATIC_INK = 500

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const ink = (page) =>
  page.evaluate(() => {
    const read = (sel) => {
      const c = document.querySelector(sel)
      if (!c) return null
      const ctx = c.getContext('2d')
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++
      return n
    }
    return { back: read('[data-satellites="back"]'), front: read('[data-satellites="front"]') }
  })

let failures = 0
const check = (label, cond) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const run = async (label, viewport, reduced) => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.setViewport(viewport)
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' },
  ])
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, reduced ? 6000 : 15000))

  const a = await ink(page)
  await new Promise((r) => setTimeout(r, 1800))
  const b = await ink(page)
  await page.screenshot({ path: `${SHOTS}/deg-${label}.png` }).catch(() => {})
  await page.close()

  const total = a.back + a.front
  console.log(
    JSON.stringify({ label, viewport: `${viewport.width}x${viewport.height}`, reduced, a, b, total, errors }),
  )

  if (reduced) {
    check(`${label}: byte-stable (genuinely static, not just slow)`, a.back === b.back && a.front === b.front)
    check(`${label}: renders non-trivial ink, not a near-empty field`, total > MIN_STATIC_INK)
  } else {
    check(`${label}: animating (ink changes between samples)`, a.back !== b.back || a.front !== b.front)
  }
  check(`${label}: zero console errors`, errors.length === 0)
}

await run('reduced', { width: 1440, height: 900 }, true)
await run('mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }, false)

await browser.close()

console.log(failures ? `\n${failures} check(s) failed.` : '\nDegradation paths verified.')
process.exit(failures ? 1 : 0)
