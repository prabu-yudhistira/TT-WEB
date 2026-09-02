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
  // No waiting on __ttMascot: in the WebGL-off path it never appears, and that
  // is the point. A fixed settle covers the hero's intro either way.
  await new Promise((r) => setTimeout(r, 12000))

  const armed = await page.evaluate(() => typeof window.__ttSamsara === 'function')

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
    const h = el.querySelector('h2')
    const input = el.querySelector('input')
    const hb = h?.getBoundingClientRect()
    const cs = h ? getComputedStyle(h) : null
    const chat = el.querySelector('.tt-room-chat')
    return {
      present: true,
      sectionInView: r.top < window.innerHeight && r.bottom > 0,
      heading: h?.textContent ?? null,
      headingInViewport:
        !!hb && hb.top >= 0 && hb.bottom <= window.innerHeight && hb.width > 0 && hb.height > 0,
      headingOpacity: cs ? Number(cs.opacity) : null,
      chatPosition: chat ? getComputedStyle(chat).position : null,
      placeholder: input?.placeholder ?? null,
      inputDisabled: input ? input.disabled : null,
    }
  })

  await page.screenshot({ path: `eyeshots/degraded-${label}.png`, fullPage: false })
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
  // ⚠️ The chatbox must be IN FLOW here. It is lifted onto a fixed layer only
  // when the sequence writes data-tt-chatbox, and with no sequence running that
  // never happens — which is exactly the fail-open behaviour, and why the block
  // starts from in-flow rather than from hidden.
  check('[reduced motion] the chatbox is ordinary in-flow content',
    r.room.chatPosition === 'relative', `position: ${r.room.chatPosition}`)
  check('[reduced motion] its heading is actually on screen', r.room.headingInViewport === true)
  check('[reduced motion] and fully opaque', r.room.headingOpacity === 1, `${r.room.headingOpacity}`)
  check('[reduced motion] the stub input is present and disabled', r.room.inputDisabled === true)
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
  check('[no webgl] its heading is actually on screen', r.room.headingInViewport === true)
  check('[no webgl] the chatbox is ordinary in-flow content',
    r.room.chatPosition === 'relative', `position: ${r.room.chatPosition}`)
  check('[no webgl] the stub input is present and disabled', r.room.inputDisabled === true)
}

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nSection 2 survives every degraded path.',
)
process.exit(failures ? 1 : 0)
