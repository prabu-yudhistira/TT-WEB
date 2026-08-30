/**
 * The hero shake must not trap SAMSARA inside the hero.
 *
 * Spec §4.4, as corrected during Task 10.
 *
 * ⚠️ TWO constraints that pull against each other, and the naive fix breaks the
 * shipped mascot:
 *
 *  1. `position: fixed` escapes an ancestor's `overflow: hidden` — UNLESS an
 *     ancestor carries a `transform`, which makes that ancestor the containing
 *     block and restores clipping. The hero IS `overflow: hidden`, so any shake
 *     transform above MascotLayer clips the fall — and only WHILE shaking,
 *     which is the kind of intermittent bug that survives casual testing.
 *
 *  2. But the obvious fix — wrap the hero's contents in one transformed
 *     "shake wrapper" — destroys the z-sandwich. Satellites-back (z0), mascot
 *     (z0), LogoStage (z0) and satellites-front (z2) all interleave inside ONE
 *     stacking context, and a transform creates a new one, collapsing the group
 *     into a unit. The mascot could then never pass behind the mark.
 *
 * So the shake is applied to the DOM layers ONLY. The three 3D layers already
 * shake from their own charge-driven jitter (HOLD_SHAKE_PX), which is why this
 * costs nothing visually.
 *
 * This script pins both halves: the shake really moves the DOM, and the mascot
 * has no transformed ancestor while it does.
 */
import puppeteer from './_puppeteer.mjs'

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
await page.setViewport({ width: 1280, height: 900 })
await page.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 90000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 90000 })
await new Promise((r) => setTimeout(r, 12000))

// ── the shake exists and moves the DOM ──────────────────────────────
const hasHandle = await page.evaluate(() => typeof window.__ttHeroShake === 'function')
check('the hero exposes a shake handle', hasHandle)

const rest = await page.evaluate(() => {
  const el = document.querySelector('.hero-headline-overlay')
  return el ? el.getBoundingClientRect().left : null
})
check('found the headline overlay', rest !== null)

await page.evaluate(() => window.__ttHeroShake(6))
await new Promise((r) => setTimeout(r, 250))

const moved = await page.evaluate(() => {
  const el = document.querySelector('.hero-headline-overlay')
  const cs = getComputedStyle(el)
  return { transform: cs.transform, left: el.getBoundingClientRect().left }
})
check('the shake applies a transform to the DOM layer', moved.transform !== 'none', moved.transform)

// ── and the mascot has NO transformed ancestor ──────────────────────
const ancestry = await page.evaluate(() => {
  const canvas = document.querySelector('[data-mascot]')
  if (!canvas) return { found: false }
  const transformed = []
  let n = canvas.parentElement
  while (n && n !== document.documentElement) {
    const t = getComputedStyle(n).transform
    if (t && t !== 'none') transformed.push(n.className || n.tagName)
    n = n.parentElement
  }
  return { found: true, transformed }
})
check('found the mascot canvas', ancestry.found)
check(
  'the mascot has NO transformed ancestor while shaking',
  ancestry.transformed && ancestry.transformed.length === 0,
  (ancestry.transformed || []).join(', '),
)

// ── a fixed probe inside the mascot layer resolves to the VIEWPORT ──
// The direct behavioural test: if an ancestor were transformed, this box would
// resolve against that ancestor and be clipped by the hero instead.
const probe = await page.evaluate(() => {
  const canvas = document.querySelector('[data-mascot]')
  const host = canvas.parentElement
  const d = document.createElement('div')
  d.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none'
  host.appendChild(d)
  const r = d.getBoundingClientRect()
  const out = { top: r.top, left: r.left, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }
  d.remove()
  return out
})
check(
  'a fixed child of the mascot layer fills the VIEWPORT',
  Math.abs(probe.top) < 1 && Math.abs(probe.left) < 1 && Math.abs(probe.h - probe.vh) < 2,
  `${probe.left},${probe.top} ${probe.w}x${probe.h} vs ${probe.vw}x${probe.vh}`,
)

await page.evaluate(() => window.__ttHeroShake(0))
await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nHero shake does not trap the mascot.')
process.exit(failures ? 1 : 0)
