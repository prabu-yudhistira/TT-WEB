// How much of the belt is actually visible, and does anything get clipped or
// overlap? Both mechanisms (edge fade, nearest-first overlap suppression) live
// in lib/satellites/labels.ts and have their own unit checks in
// labels.check.ts — this is the end-to-end proof that they hold on the real,
// composed page across real viewports, not just in isolation.

import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// No ?satellites= param — removed once the field shipped unconditionally.
const URL = process.env.TT_URL ?? 'http://localhost:3000/en'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const measure = async (w, h, label) => {
  const page = await browser.newPage()
  await page.setViewport({ width: w, height: h })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 15000))

  const samples = []
  for (let i = 0; i < 8; i++) {
    samples.push(
      await page.evaluate(() => {
        const s = window.__ttSatellites()
        const W = innerWidth
        const H = innerHeight
        const onScreen = s.sats.filter(
          (p) => Number.isFinite(p.x) && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H,
        ).length
        const labels = [...document.querySelectorAll('[data-satellites="labels"] > div')]
        let clipped = 0
        let visible = 0
        for (const el of labels) {
          if (parseFloat(el.style.opacity || '0') < 0.05) continue
          visible++
          const r = el.getBoundingClientRect()
          if (r.left < 0 || r.right > W || r.top < 0 || r.bottom > H) clipped++
        }
        // Always-on labels can collide. Count pairs whose boxes intersect.
        const boxes = labels
          .filter((el) => parseFloat(el.style.opacity || '0') > 0.25)
          .map((el) => el.getBoundingClientRect())
        let overlaps = 0
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]
            const b = boxes[j]
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
              overlaps++
          }
        }
        return { total: s.sats.length, onScreen, visibleLabels: visible, clippedLabels: clipped, overlaps }
      }),
    )
    await new Promise((r) => setTimeout(r, 700))
  }

  const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length
  const result = {
    viewport: label,
    total: samples[0].total,
    avgOnScreen: Number(avg('onScreen').toFixed(1)),
    pctOnScreen: Math.round((avg('onScreen') / samples[0].total) * 100),
    avgVisibleLabels: Number(avg('visibleLabels').toFixed(1)),
    avgClippedLabels: Number(avg('clippedLabels').toFixed(1)),
    avgLabelOverlaps: Number(avg('overlaps').toFixed(2)),
    worstOverlaps: Math.max(...samples.map((s) => s.overlaps)),
  }
  console.log(JSON.stringify(result))
  await page.close()
  return result
}

const results = []
results.push(await measure(1600, 900, '1600x900 laptop'))
results.push(await measure(2560, 1080, '2560x1080 ultrawide'))
results.push(await measure(390, 844, '390x844 phone'))

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

for (const r of results) {
  // Approved geometry keeps the whole belt on screen; a regression here means
  // the orbit band widened past the frame again.
  check(`${r.viewport}: at least 90% of satellites on screen`, r.pctOnScreen >= 90)
  check(`${r.viewport}: essentially no clipped labels`, r.avgClippedLabels <= 0.5)
  check(`${r.viewport}: zero label overlaps`, r.worstOverlaps === 0)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nOn-screen and overlap checks passed.')
process.exit(failures ? 1 : 0)
