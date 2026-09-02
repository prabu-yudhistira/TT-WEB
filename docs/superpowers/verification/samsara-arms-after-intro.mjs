/**
 * The transition waits for the hero to finish its ENTIRE entrance.
 *
 * Owner requirement 2026-09-02: "make the scroll function wait until hero plays
 * all the sequential". Spec §5.2 already asked for the weaker version of this —
 * scrolling during the sketch intro must scroll the page normally — but the gate
 * was `stageLive`, which fires when the logo's ignition hands over and the canvas
 * is ready. That is still mid-entrance: the headline is being typed, holds for
 * 5.6s, dissolves, and only then does the constellation reclaim its space. A
 * scroll in that window ripped SAMSARA out of an orbit that was still
 * rearranging itself.
 *
 * So this asserts BOTH halves, because either alone is satisfiable by a broken
 * build:
 *
 *   - BEFORE: wheel gestures scroll the document like any other page.
 *   - AFTER:  wheel gestures are taken by the sequence and the page holds still.
 *
 * A build that never arms passes the first. A build that arms immediately passes
 * the second. Only the pair pins the actual requirement.
 *
 * ⚠️ Wheel gestures are dispatched as real events and the document is advanced
 * only when nothing called preventDefault — the same discipline as the fail-open
 * gate, and for the same reason: `window.scrollBy` ignores the listener entirely
 * and would call a pinned page healthy.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-arms-after-intro.mjs
 */
import puppeteer from './_puppeteer.mjs'

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

const wheel = async (page, n) =>
  page.evaluate(async (count) => {
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 250))
    const before = window.scrollY
    const target =
      document.querySelector('[data-hero], header, main')?.firstElementChild ?? document.body
    for (let i = 0; i < count; i++) {
      const ev = new WheelEvent('wheel', { deltaY: 180, bubbles: true, cancelable: true })
      target.dispatchEvent(ev)
      if (!ev.defaultPrevented) window.scrollBy(0, 180)
      await new Promise((r) => setTimeout(r, 80))
    }
    await new Promise((r) => setTimeout(r, 500))
    return { before, after: window.scrollY }
  }, n)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.setViewport({ width: 1280, height: 800 })

const t0 = Date.now()
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 })

// ── DURING the entrance ──────────────────────────────────────────────
//
// Deliberately immediate: this is the visitor who starts scrolling the moment
// the page paints, which is the common case rather than an edge one.
{
  const armedNow = await page.evaluate(() => typeof window.__ttSamsara === 'function')
  check('the sequence has NOT armed while the hero is still playing', armedNow === false)

  const s = await wheel(page, 10)
  check('and the page scrolls normally in the meantime',
    s.after > s.before + 100, `scrollY ${s.before} -> ${s.after}`)
}

// ── AFTER it ─────────────────────────────────────────────────────────
{
  await page.waitForFunction(() => typeof window.__ttSamsara === 'function', {
    timeout: 45000,
    polling: 100,
  })
  const armedAt = Date.now() - t0
  // The whole entrance is video (~7.7s) + headline typed, held and dissolved
  // (7s from 0.3s after playback) + a 650ms reflow. Anything much under this
  // means a stage was skipped rather than waited for.
  check('it arms only after the whole entrance has played',
    armedAt > 9000, `armed at ${armedAt}ms`)

  const s = await wheel(page, 10)
  check('and then the sequence takes the scroll — the page holds still',
    s.after <= s.before + 8, `scrollY ${s.before} -> ${s.after}`)

  /**
   * ⚠️ Responsiveness is proved through `__ttSamsaraBeat`, NOT by hoping the
   * synthetic wheel stream above turned into beats.
   *
   * It does not, and that is expected rather than a bug: `feedWheel` normalises
   * real hardware — one trackpad flick must stay ONE beat — and a dispatched
   * WheelEvent carries none of the timing signature it keys on. The first
   * version of this check asserted `mode !== 'idle'` after the wheel loop and
   * went red against a perfectly working build. `samsara-seam.mjs` documents the
   * same conclusion and drives beats the same way; `gestures.check.ts` is what
   * actually pins normalisation, against synthetic hardware streams.
   *
   * So the pair here is: the page HOLDS STILL under wheel (the sequence has the
   * scroll), and the machine ADVANCES when beaten (it is alive, not merely
   * jammed). A stuck page satisfies the first alone.
   */
  const mode = await page.evaluate(async () => {
    window.__ttSamsaraBeat('down')
    await new Promise((r) => setTimeout(r, 300))
    return window.__ttSamsara().mode
  })
  check('and the sequence is alive, not merely jamming the page',
    mode !== 'idle', `mode after one beat: ${mode}`)
  await page.evaluate(() => window.__ttSamsaraReset?.())
}

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nThe transition waits for the hero to finish.',
)
process.exit(failures ? 1 : 0)
