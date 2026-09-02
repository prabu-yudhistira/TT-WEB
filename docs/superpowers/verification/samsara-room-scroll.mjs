/**
 * Scrolling inside the room must not erase SAMSARA.
 *
 * ⛔ THE BUG THIS EXISTS FOR. `MascotEngine.onScroll` computes
 * `scrollAlpha = 1 - scrollY / (SCROLL_FADE_VH * innerHeight)` and that alpha
 * gates the body, the eye display, the trail and the smoke. At SCROLL_FADE_VH
 * 0.6 it reaches zero after roughly half a screen.
 *
 * That is correct for the HERO — a mascot circling a mark you are scrolling away
 * from should fade. It is wrong in the ROOM, where the canvas is `position:
 * fixed`, covers the viewport, and the pin is released on landing so the page
 * scrolls freely underneath. Reported by the owner and reproduced exactly: at an
 * 800px viewport the eye socket and the smoke dimmed by scrollY 400 and SAMSARA
 * was GONE by 800, leaving an empty lit room — the room itself stayed, because
 * it is not gated by that alpha, which is what made it look like a rendering
 * fault rather than a fade.
 *
 * ⚠️ Measured in PIXELS across a scroll sweep, not by reading a flag. The engine
 * kept reporting mode `landed`, camera `perspective` and diameter 364px at every
 * scroll position while nothing was on screen — every piece of state said
 * healthy. Only the picture disagreed.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-room-scroll.mjs
 */
import puppeteer from './_puppeteer.mjs'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

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

/**
 * SAMSARA is warm brass against a graphite room, so "warm pixels" is a clean
 * proxy for the body being drawn at all. The smoke is warm too, which only ever
 * makes this count higher — it cannot mask a body that has vanished.
 */
const warmPixels = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let n = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r > 90 && r > b + 25 && g > b + 10) n++
  }
  return n
}

mkdirSync('samsarashots', { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.setViewport({ width: 1280, height: 800 })
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120000 })
await page.waitForFunction(() => typeof window.__ttSamsara === 'function', { timeout: 60000 })

const landed = await page.evaluate(async () => {
  for (let i = 0; i < 4; i++) {
    window.__ttSamsaraBeat('down')
    await new Promise((r) => setTimeout(r, 130))
  }
  const t0 = performance.now()
  while (performance.now() - t0 < 15000) {
    if (window.__ttSamsara().mode === 'landed') break
    await new Promise((r) => setTimeout(r, 120))
  }
  await new Promise((r) => setTimeout(r, 1200))
  return window.__ttSamsara().mode
})
check('reached the room', landed === 'landed', landed)

// The idle loop blinks, and closed eyes remove a large warm area. Pin the face
// so the sweep measures the BODY rather than the expression.
await page.evaluate(() => window.__ttMascotExpr('neutral'))
await new Promise((r) => setTimeout(r, 600))

const counts = []
for (const y of [0, 400, 800, 1200]) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  await new Promise((r) => setTimeout(r, 900))
  const shot = await page.screenshot()
  const px = await warmPixels(shot)
  counts.push({ y, px })
  await sharp(shot).toFile(`samsarashots/room-scroll-${y}.png`)
}

const base = counts[0].px
check('SAMSARA is drawn at the top of the room', base > 20000, `${base}px`)

for (const c of counts.slice(1)) {
  // Generous floor: the hover bob and the smoke move this around by a few
  // percent either way. Anything approaching the old behaviour — a fade to
  // nothing — is off by an order of magnitude, not by a margin.
  check(
    `and is still drawn after scrolling to ${c.y}`,
    c.px > base * 0.6,
    `${c.px}px vs ${base}px at the top`,
  )
}

/**
 * ── Downward scrolling is inert while landed ─────────────────────────
 *
 * Owner requirement 2026-09-02. Spec §6.7 leaves nothing below the room, so
 * scrolling down was 1,171px of travel behind a fixed, full-screen canvas: the
 * view never changed and the only effect was dragging the page off the room.
 *
 * ⚠️ Real wheel events, and dispatched at whatever is actually under the pointer
 * in the middle of the room. The cause here was subtle: `onWheel` already
 * called preventDefault on every event — 8 of 8, measured — so the DOCUMENT
 * never scrolled itself. What moved the page was LENIS, restarted by a
 * `releasePin()` on landing and doing its own smooth scrolling from those same
 * events. A test that only checked `defaultPrevented` would have reported this
 * as working.
 *
 * The upward half is not optional. With the pin held, a wheel gesture up is the
 * only way out of the room, so "down does nothing" and "up still leaves" have to
 * be asserted together — otherwise the fix for one is a trap.
 */
{
  const wheelAt = (dy, n) =>
    page.evaluate(
      async ([d, count]) => {
        const before = Math.round(window.scrollY)
        for (let i = 0; i < count; i++) {
          const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
          ;(el ?? document.body).dispatchEvent(
            new WheelEvent('wheel', { deltaY: d, bubbles: true, cancelable: true }),
          )
          await new Promise((r) => setTimeout(r, 90))
        }
        await new Promise((r) => setTimeout(r, 800))
        return { before, after: Math.round(window.scrollY), mode: window.__ttSamsara().mode }
      },
      [dy, n],
    )

  await page.evaluate(() => window.scrollTo(0, 0))
  await new Promise((r) => setTimeout(r, 500))

  const down = await wheelAt(200, 10)
  check('scrolling DOWN in the room moves nothing',
    down.after <= down.before + 4, `scrollY ${down.before} -> ${down.after}`)
  check('and leaves the sequence landed', down.mode === 'landed', down.mode)

  const again = await wheelAt(200, 10)
  check('and stays inert however long it is scrolled',
    again.after <= again.before + 4, `scrollY ${again.before} -> ${again.after}`)

  const up = await wheelAt(-200, 8)
  check('while scrolling UP still leaves the room', up.mode !== 'landed', `mode ${up.mode}`)
}

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nThe room survives being scrolled.',
)
process.exit(failures ? 1 : 0)
