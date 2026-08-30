/**
 * Capture the five homepage sections being retired by the 3-section redesign,
 * so their appearance survives their removal.
 *
 * puppeteer-core is deliberately NOT a dependency of this app and must never
 * become one. It lives in the session scratchpad.
 *
 * ⚠️ Running this from the scratchpad does NOT help: ESM resolves imports from
 * the FILE's directory upward, not from the working directory, so a bare
 * `import ... from 'puppeteer-core'` in a repo file cannot see it wherever you
 * launch node. Reach across package roots explicitly instead — the same trick
 * mascot-capture.mjs already uses to pull `sharp` out of the app.
 *
 *   TT_SCRATCH=/path/to/scratchpad node scripts/archive-sections.mjs
 *
 * ⚠️ Reduced motion is deliberately NOT emulated. It would make the shots
 * byte-stable, but ManifestoStrip reveals its text through a GSAP ScrollTrigger
 * scrub — under reduced motion it captures as an EMPTY section, which defeats
 * the whole point of an archive. Each section is scrolled into view and given
 * time to settle instead.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const SCRATCH =
  process.env.TT_SCRATCH ??
  'C:/Users/YUDHISTIRA/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/d0ca22db-692e-419a-99b2-f64c186473d0/scratchpad'
const puppeteer = createRequire(`file:///${SCRATCH.replace(/\\/g, '/')}/package.json`)('puppeteer-core')

// sharp IS an app dependency — reach into the app's package root for it.
const REPO_PKG = 'file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json'
const sharp = createRequire(REPO_PKG)('sharp')

/**
 * ManifestoStrip fills its statements with ink as you scroll THROUGH it, so
 * there is no single "correct" scroll offset — scrolling to its centre catches
 * it around 15% inked, which misrepresents the one effect the section exists
 * for. Sample across its scroll range and keep the darkest frame, i.e. the one
 * carrying the most ink. Measured, not guessed at.
 */
async function captureDarkest(page, el, outPath, samples = 11) {
  const box = await el.evaluate((n) => {
    const r = n.getBoundingClientRect()
    return { top: r.top + window.scrollY, height: r.height }
  })
  const { width: vw, height: vh } = page.viewport()
  const from = box.top - vh * 0.35
  const to = box.top + box.height - vh * 0.65

  let best = null
  let bestMean = Infinity
  let bestY = null

  for (let i = 0; i < samples; i++) {
    const y = Math.max(0, from + ((to - from) * i) / (samples - 1))
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await new Promise((r) => setTimeout(r, 450))

    // ⚠️ Measure INSIDE the section's own box, never the whole viewport.
    // Measuring the viewport picks the frame where the HERO's dark paper
    // fills the screen and reports it as "most ink" — which is the same
    // background-not-subject error that made the mascot kill-switch check
    // wrong three times. Clip to the element, and ignore samples where it
    // does not substantially fill the frame.
    // ⚠️ page.screenshot({clip}) takes PAGE coordinates, but
    // getBoundingClientRect() returns VIEWPORT coordinates. Without adding the
    // scroll offset the clip lands near the document origin and silently
    // captures the HERO instead — which looks like a plausible screenshot, so
    // nothing errors and the archive is quietly wrong.
    const clip = await el.evaluate((n) => {
      const r = n.getBoundingClientRect()
      const top = Math.max(0, r.top)
      const bottom = Math.min(window.innerHeight, r.bottom)
      const left = Math.max(0, r.left)
      const right = Math.min(window.innerWidth, r.right)
      return {
        x: left + window.scrollX,
        y: top + window.scrollY,
        width: right - left,
        height: bottom - top,
      }
    })
    if (clip.height < vh * 0.85 || clip.width < vw * 0.85) continue

    const buf = await page.screenshot({ clip })
    const { channels } = await sharp(buf).stats()
    const mean = (channels[0].mean + channels[1].mean + channels[2].mean) / 3
    if (mean < bestMean) {
      bestMean = mean
      best = buf
      bestY = Math.round(y)
    }
  }

  if (!best) throw new Error(`captureDarkest: no sample filled the frame for ${outPath}`)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(outPath, best)
  return { mean: bestMean, y: bestY }
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REPO = 'D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT'
const OUT = `${REPO}/docs/archive/2026-08-30-homepage-sections/shots`

const SECTIONS = ['manifestoStrip', 'featuredWorks', 'servicesRows', 'archiveTeaser', 'contactMailto']
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]
const SETTLE_MS = 1600

mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

let ok = 0
let missing = 0

for (const locale of ['en', 'id']) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: vp.width, height: vp.height })
    await page.goto(`http://localhost:3000/${locale}`, { waitUntil: 'networkidle0', timeout: 60000 })

    for (const slug of SECTIONS) {
      const el = await page.$(`[data-block="${slug}"]`)
      if (!el) {
        console.warn(`MISSING  ${locale}/${vp.name}/${slug}`)
        missing++
        continue
      }
      const path = `${OUT}/${locale}-${vp.name}-${slug}.png`

      if (slug === 'manifestoStrip') {
        // Scrub-animated: pick the most-inked frame by measurement.
        const r = await captureDarkest(page, el, path)
        console.log(`ok       ${locale}/${vp.name}/${slug}  (most ink at scrollY ${r.y}, mean ${r.mean.toFixed(1)})`)
      } else {
        // Static sections: centre them and let any entrance reveal settle.
        await el.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }))
        await new Promise((r) => setTimeout(r, SETTLE_MS))
        await el.screenshot({ path })
        console.log(`ok       ${locale}/${vp.name}/${slug}`)
      }
      ok++
    }

    // A full-page shot for context, taken last so every section has settled.
    await page.evaluate(() => window.scrollTo(0, 0))
    await new Promise((r) => setTimeout(r, 600))
    await page.screenshot({ path: `${OUT}/${locale}-${vp.name}-fullpage.png`, fullPage: true })
    console.log(`ok       ${locale}/${vp.name}/fullpage`)

    await page.close()
  }
}

await browser.close()

console.log(`\n${ok} section shots written, ${missing} missing -> ${OUT}`)
if (missing > 0) {
  console.error('FAIL: a section was not found. Resolve before Task 16 removes it — it cannot be captured afterwards.')
  process.exit(1)
}
console.log('All five sections captured at both locales and both breakpoints.')
process.exit(0)
