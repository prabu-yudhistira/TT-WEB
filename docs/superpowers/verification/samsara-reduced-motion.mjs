/**
 * Reduced motion, and the two other degraded paths — spec §5.9 / §5.10.
 *
 * The load-bearing promise is that a SCROLL-JACK IS NEVER THE ONLY ROUTE TO
 * CONTENT. Section 2 has to be reachable, readable and complete when the
 * cinematic does not run, in every way it can fail to run:
 *
 *   1. `prefers-reduced-motion: reduce`
 *   2. WebGL unavailable (the canvas never initialises, the model never loads)
 *
 * The third path — `sequenceEnabled: false` — needs the CMS global flipped, so
 * it lives in samsara-kill-switch.mjs.
 *
 * ⚠️ This is not hypothetical for this project. The owner's own machine has had
 * reduced motion silently enabled (Windows "Animation effects" off), which made
 * the hero look broken. This path WILL be seen in the wild.
 *
 * ⚠️ And "reachable" is checked by SCROLLING and then reading pixels and layout,
 * not by asserting the element exists. The chatbox already proved that a node
 * can be in the DOM, correctly positioned, fully opaque and still invisible —
 * see samsara-room-chatbox.mjs. Existence is not reachability.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-reduced-motion.mjs
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

/**
 * @param label   which degraded path this is
 * @param setup   runs before navigation
 */
const run = async (label, setup) => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: 1280, height: 800 })
  await setup(page)
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120000 })

  /**
   * ⚠️ WAIT FOR THE CONDITION, not for a duration.
   *
   * The hero now arms only after its ENTIRE entrance — video, ignition, the
   * headline typed, held, dissolved, and the constellation reflowed — which
   * measures ~11.3s here. A fixed settle was 12s, so this had 0.7s of margin on
   * a software-rasterised browser and would have started reporting "never arms"
   * as a flake the moment the machine was busy. Waiting on the handle with a
   * generous timeout distinguishes "not yet" from "never" honestly.
   */
  const armed = await page
    .waitForFunction(() => typeof window.__ttSamsara === 'function', { timeout: 30000 })
    .then(() => true)
    .catch(() => false)

  /**
   * The page must scroll like any other page.
   *
   * ⚠️ Driven with real WHEEL EVENTS, not `window.scrollBy`. The sequence's whole
   * mechanism is a wheel listener that calls preventDefault and pins the page —
   * `scrollBy` walks straight past it and would report "scrolls fine" on a build
   * that is completely jammed for an actual visitor. The first version of this
   * check did exactly that, and passed on the WebGL-off path while the sequence
   * was still arming its listeners.
   */
  const scroll = await page.evaluate(async () => {
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 400))
    const before = window.scrollY
    const hero = document.querySelector('[data-hero], header, main')?.firstElementChild ?? document.body
    for (let i = 0; i < 14; i++) {
      const ev = new WheelEvent('wheel', { deltaY: 180, bubbles: true, cancelable: true })
      hero.dispatchEvent(ev)
      // Only advance the document if nothing swallowed the gesture — which is
      // what a browser does, and what makes a pin observable here.
      if (!ev.defaultPrevented) window.scrollBy(0, 180)
      await new Promise((r) => setTimeout(r, 90))
    }
    await new Promise((r) => setTimeout(r, 700))
    return { before, after: window.scrollY, height: document.body.scrollHeight }
  })

  // ── Section 2 must be reachable AND readable ──────────────────────
  const room = await page.evaluate(async () => {
    const el = document.querySelector('[data-block="samsaraRoom"]')
    if (!el) return { present: false }
    el.scrollIntoView({ block: 'start' })
    await new Promise((r) => setTimeout(r, 900))
    const r = el.getBoundingClientRect()
    // The temporary in-flow note. It is what stands between a degraded
    // visitor and a blank black panel, so it is measured the same way the
    // chatbox's heading was before it: on screen, opaque, and IN FLOW.
    const n = el.querySelector('.tt-room-note')
    const nb = n?.getBoundingClientRect()
    const cs = n ? getComputedStyle(n) : null
    return {
      present: true,
      sectionInView: r.top < window.innerHeight && r.bottom > 0,
      note: n?.textContent ?? null,
      noteInViewport:
        !!nb && nb.top >= 0 && nb.bottom <= window.innerHeight && nb.width > 0 && nb.height > 0,
      noteOpacity: cs ? Number(cs.opacity) : null,
      notePosition: cs ? cs.position : null,
      accessibleName: el.getAttribute('aria-label'),
    }
  })

  await page.screenshot({ path: `samsarashots/degraded-${label}.png`, fullPage: false })
  await page.close()
  return { armed, scroll, room, errors }
}

// ── 1. prefers-reduced-motion: reduce ────────────────────────────────
{
  const r = await run('reduced-motion', async (page) => {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  })
  check('[reduced motion] the sequence never arms', r.armed === false,
    r.armed ? 'window.__ttSamsara exists' : '')
  check('[reduced motion] the page scrolls normally — nothing is pinned',
    r.scroll.after > r.scroll.before + 100,
    `scrollY ${r.scroll.before} -> ${r.scroll.after}`)
  check('[reduced motion] Section 2 exists', r.room.present === true)
  check('[reduced motion] and can be scrolled to', r.room.sectionInView === true)
  // ⚠️ This is the fail-open promise, and it is the whole reason the note
  // exists. No sequence runs here, so no WebGL room is ever drawn — without
  // in-flow DOM Section 2 is a blank black panel a viewport tall. The note is
  // never lifted onto a fixed layer by anything, so `relative`/`static` is the
  // only correct answer; a `fixed` reading means something started managing it.
  check('[reduced motion] Section 2 has readable in-flow content',
    r.room.notePosition === 'relative' || r.room.notePosition === 'static',
    `note position: ${r.room.notePosition}`)
  check('[reduced motion] the note is actually on screen', r.room.noteInViewport === true,
    r.room.note ? `"${r.room.note}"` : 'no .tt-room-note found')
  check('[reduced motion] and fully opaque', r.room.noteOpacity === 1, `${r.room.noteOpacity}`)
  check('[reduced motion] the section is still a named landmark',
    !!r.room.accessibleName, `aria-label: ${r.room.accessibleName}`)
  check('[reduced motion] no page errors', r.errors.length === 0, r.errors.slice(0, 2).join(' | '))
}

// ── 2. WebGL unavailable ─────────────────────────────────────────────
//
// The mascot, the room and the whole cinematic depend on a GL context. If it
// cannot be created the sequence must simply not happen, and the page must
// remain an ordinary scrolling document rather than a pinned dead end.
{
  const r = await run('no-webgl', async (page) => {
    await page.evaluateOnNewDocument(() => {
      const fail = function () {
        return null
      }
      HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
        apply(target, thisArg, args) {
          if (typeof args[0] === 'string' && args[0].toLowerCase().includes('webgl')) return fail()
          return Reflect.apply(target, thisArg, args)
        },
      })
    })
  })
  check('[no webgl] the sequence never arms', r.armed === false,
    r.armed ? 'window.__ttSamsara exists' : '')
  check('[no webgl] the page scrolls normally — nothing is pinned',
    r.scroll.after > r.scroll.before + 100,
    `scrollY ${r.scroll.before} -> ${r.scroll.after}`)
  check('[no webgl] Section 2 exists', r.room.present === true)
  check('[no webgl] and can be scrolled to', r.room.sectionInView === true)
  check('[no webgl] the note is actually on screen', r.room.noteInViewport === true,
    r.room.note ? `"${r.room.note}"` : 'no .tt-room-note found')
  check('[no webgl] Section 2 has readable in-flow content',
    r.room.notePosition === 'relative' || r.room.notePosition === 'static',
    `note position: ${r.room.notePosition}`)
  check('[no webgl] and fully opaque', r.room.noteOpacity === 1, `${r.room.noteOpacity}`)
}

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nSection 2 survives every degraded path.',
)
process.exit(failures ? 1 : 0)
