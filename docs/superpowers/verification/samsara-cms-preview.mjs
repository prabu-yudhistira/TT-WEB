/**
 * The SAMSARA transition's live preview: does the /admin iframe reach the ROOM?
 *
 * Almost every field on the `samsara-sequence` global describes the room, the
 * landing or the golden smoke, and none of it is visible from the hero. A
 * preview that renders the hero and stays there is worse than no preview: an
 * editor drags the key-light slider, watches a 7.7s sketch intro, sees nothing
 * change, and reasonably concludes the whole thing is broken.
 *
 * So the assertion is not "the route returns 200" — it is that the preview
 * arrives, unprompted, at the thing being edited.
 *
 * ⚠️ It also checks the OTHER source still behaves. `livePreview.url()` used to
 * label any global as 'hero-effects' by truthiness; with a second global that
 * silently mislabels SAMSARA's data, and the preview would then feed a sequence
 * config into the effects resolvers — every field missing, so it falls back to
 * saved values and looks merely "not live" rather than wrong.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-cms-preview.mjs
 */
import puppeteer from './_puppeteer.mjs'
import { mkdirSync } from 'node:fs'

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

// The gates write here rather than into eyeshots/, which eyes-legibility
// readdir()s and asserts holds exactly the 14 expression crops.
mkdirSync('samsarashots', { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

/** Load a preview source and report where the sequence ends up. */
const run = async (source, waitMs) => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(`${BASE}/admin-preview/hero?source=${source}`, {
    waitUntil: 'networkidle0',
    timeout: 120000,
  })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, {
    timeout: 120000,
  })
  // The sequence arms only once the hero stage goes live, behind the intro.
  await page.waitForFunction(() => typeof window.__ttSamsara === 'function', { timeout: 90000 })

  const t0 = Date.now()
  let mode = 'idle'
  while (Date.now() - t0 < waitMs) {
    mode = await page.evaluate(() => window.__ttSamsara().mode)
    if (mode === 'landed') break
    await new Promise((r) => setTimeout(r, 200))
  }
  const camera = await page.evaluate(() => window.__ttMascot().rendered.camera)
  await page.screenshot({ path: `samsarashots/preview-${source}.png` })
  await page.close()
  return { mode, camera, errors, tookMs: Date.now() - t0 }
}

// ── the SAMSARA source drives itself into the room ───────────────────
{
  const r = await run('samsara-sequence', 30000)
  check('the SAMSARA preview reaches the room on its own', r.mode === 'landed',
    `mode ${r.mode} after ${r.tookMs}ms`)
  check('and it is the room camera that is rendering', r.camera === 'perspective', r.camera)
  check('no page errors', r.errors.length === 0, r.errors.slice(0, 2).join(' | '))
}

// ── the hero-effects source is untouched ─────────────────────────────
//
// It must NOT auto-land: those fields are the logo, the ignition, the
// satellites and the orbiting mascot, all of which live on the hero. Driving
// this preview into the room would hide everything it exists to show.
{
  const r = await run('hero-effects', 9000)
  check('the hero-effects preview stays on the hero', r.mode !== 'landed', `mode ${r.mode}`)
  check('and keeps the orbit camera', r.camera === 'ortho', r.camera)
  check('no page errors', r.errors.length === 0, r.errors.slice(0, 2).join(' | '))
}

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nThe SAMSARA tab previews the room.',
)
process.exit(failures ? 1 : 0)
