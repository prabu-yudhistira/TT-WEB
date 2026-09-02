/**
 * Section 2's DOM: does the chatbox stub actually land where the owner put it?
 *
 * Spec §6.6 / §6.7, plan Task 14. The room is WebGL on a FIXED canvas and the
 * chatbox is ordinary DOM on top of it, so nothing in the layout engine knows
 * that SAMSARA is there. The composition — chatbox top-left on desktop, BELOW
 * the body in portrait — is enforced by a media query and a landing fraction
 * that live in two different files and were tuned at two different times.
 * Nothing but this script notices when they stop agreeing.
 *
 * ⚠️ The overlap assertion is the point. Everything else here (the section
 * exists, it is dark, it is one viewport tall) would still pass with the box
 * sitting squarely on SAMSARA's face.
 *
 * SAMSARA's silhouette is an ELLIPSE, not a circle — MASCOT_STRETCH_Y is 1.12 —
 * and `getBodyScreen()` reports the DRAWN height for exactly this reason, so the
 * clearance is measured against the real painted extent rather than the
 * scripted diameter.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-room-chatbox.mjs
 */
import puppeteer from './_puppeteer.mjs'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.TT_URL ?? 'http://localhost:3000/en'

/**
 * Breathing room between the box and the body, in px. Not zero: touching is
 * not a collision but it reads as one, and a value that only just clears at
 * 1440 will overlap at 1366.
 */
const MIN_GAP_PX = 12

const VIEWPORTS = [
  { w: 1440, h: 900, label: '1440x900', expect: 'left of SAMSARA' },
  { w: 1280, h: 720, label: '1280x720', expect: 'left of SAMSARA' },
  { w: 390, h: 844, label: '390x844 portrait', expect: 'below SAMSARA' },
]

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

for (const vp of VIEWPORTS) {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.setViewport({ width: vp.w, height: vp.h })
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120000 })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, {
    timeout: 120000,
  })
  await page.waitForFunction(() => typeof window.__ttSamsara === 'function', { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1200))

  // ── the section exists before anything else is worth asking ────────
  const section = await page.evaluate(() => {
    const el = document.querySelector('[data-block="samsaraRoom"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const input = el.querySelector('input')
    return {
      height: r.height,
      bg: cs.backgroundColor,
      labelledBy: el.getAttribute('aria-labelledby'),
      headingId: el.querySelector('h2')?.id ?? null,
      headingText: el.querySelector('h2')?.textContent ?? null,
      inputDisabled: input ? input.disabled : null,
      hasForm: !!el.querySelector('form'),
      viewportH: window.innerHeight,
    }
  })

  check(`[${vp.label}] the samsaraRoom section is in the DOM`, !!section)
  if (!section) {
    await page.close()
    continue
  }

  check(
    `[${vp.label}] it is one viewport tall`,
    Math.abs(section.height - section.viewportH) <= 1,
    `${Math.round(section.height)}px vs ${section.viewportH}px`,
  )
  // ROOM.BG_COLOR #08080A. Read from the config in the component, so this
  // catches the section being styled independently of the WebGL room it backs.
  check(
    `[${vp.label}] it is the room's own black`,
    section.bg === 'rgb(8, 8, 10)',
    section.bg,
  )
  check(
    `[${vp.label}] the heading labels the section`,
    !!section.labelledBy && section.labelledBy === section.headingId,
    `${section.labelledBy} / ${section.headingId}`,
  )
  check(`[${vp.label}] the stub input is disabled`, section.inputDisabled === true)
  // A <form> with no submit handler navigates on Enter and drops the visitor
  // out of the room. It arrives with the send handler, not before.
  check(`[${vp.label}] no form wraps the stub yet`, section.hasForm === false)

  // ── run the sequence into the room ─────────────────────────────────
  const landed = await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      window.__ttSamsaraBeat('down')
      await new Promise((r) => setTimeout(r, 120))
    }
    const t0 = performance.now()
    while (performance.now() - t0 < 12000) {
      if (window.__ttSamsara().mode === 'landed') break
      await new Promise((r) => setTimeout(r, 100))
    }
    await new Promise((r) => setTimeout(r, 600))
    return window.__ttSamsara().mode
  })
  check(`[${vp.label}] reached the room`, landed === 'landed', landed)

  // ── the composition ────────────────────────────────────────────────
  const geom = await page.evaluate(() => {
    const el = document.querySelector('[data-block="samsaraRoom"]')
    const node = el.querySelector('.tt-room-chat')
    const box = node.getBoundingClientRect()
    const cs = getComputedStyle(node)
    const m = window.__ttMascot()
    // The DRAWN extent, which MASCOT_STRETCH_Y makes taller than the scripted
    // diameter. Falls back to the scripted value if the engine ever stops
    // reporting it, so a rename fails loudly here rather than silently
    // measuring against a circle.
    const d = m.rendered.diameterPx
    return {
      box: { x: box.x, y: box.y, w: box.width, h: box.height },
      body: { cx: m.rendered.x, cy: m.rendered.y, rx: d / 2, ry: d / 2 },
      opacity: Number(cs.opacity),
      position: cs.position,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      heading: (() => {
        const h = node.querySelector('h2').getBoundingClientRect()
        return { x: h.x, y: h.y, w: h.width, h: h.height }
      })(),
    }
  })

  /**
   * ⚠️ THE ASSERTION THIS FILE EXISTS FOR, and it was added after the first
   * version shipped without it and passed on a broken build.
   *
   * The room is a FIXED canvas over a pinned page, so the samsaraRoom section
   * is still a whole viewport below the fold while SAMSARA is standing in it.
   * The first cut of the block left the chatbox in normal flow: it measured at
   * y=1283 in an 844px-tall viewport — completely off screen — and every
   * clearance check below passed, because a box nobody can see clears
   * everything. Distance from SAMSARA is only meaningful once the box is
   * actually on screen.
   */
  const onScreen =
    geom.box.y >= 0 &&
    geom.box.x >= 0 &&
    geom.box.y + geom.box.h <= geom.viewport.h &&
    geom.box.x + geom.box.w <= geom.viewport.w
  check(
    `[${vp.label}] the chatbox is ON SCREEN while the room is up`,
    onScreen,
    `box ${Math.round(geom.box.x)},${Math.round(geom.box.y)} ${Math.round(geom.box.w)}x${Math.round(geom.box.h)} in ${geom.viewport.w}x${geom.viewport.h}`,
  )
  check(
    `[${vp.label}] it was lifted onto the fixed layer`,
    geom.position === 'fixed',
    geom.position,
  )
  // The reveal is a transition on opacity; DELAY_MS has long passed by now.
  check(`[${vp.label}] and it has faded in`, geom.opacity > 0.9, geom.opacity.toFixed(2))
  /**
   * ⚠️ ALSO added after a passing run on a broken build, and it catches a
   * different failure from every check above.
   *
   * The section briefly carried `z-index: 1`. That made it a STACKING CONTEXT,
   * so the chatbox's own z-index 41 resolved inside it and the whole thing
   * painted UNDER the promoted canvas at 40. Every check above still passed:
   * the box was on screen, `position: fixed`, `opacity: 1`, correctly placed —
   * and completely invisible.
   *
   * ⚠️ `elementFromPoint` does NOT catch it, which is worth knowing before
   * reaching for the easy version of this test. The mascot canvas is
   * `pointer-events: none` — deliberately, so the room stays clickable through
   * it — and hit-testing skips it, happily returning the buried chatbox. That
   * version of this assertion was written, negative-tested against the real bug,
   * and passed. Only READING THE PIXELS tells the two states apart.
   *
   * The heading is near-white (#F6F1E7) on a room whose darkest walls are #08080A
   * and whose brightest surface here is a mid-grey floor, so peak luminance over
   * the heading's own box separates them with enormous margin.
   */
  const shot = await page.screenshot({
    clip: {
      x: Math.max(0, Math.round(geom.heading.x)),
      y: Math.max(0, Math.round(geom.heading.y)),
      width: Math.max(1, Math.round(geom.heading.w)),
      height: Math.max(1, Math.round(geom.heading.h)),
    },
  })
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
  let peak = 0
  for (let j = 0; j < data.length; j += info.channels) {
    peak = Math.max(peak, (data[j] + data[j + 1] + data[j + 2]) / 3)
  }
  check(
    `[${vp.label}] and its text is actually PAINTED, not buried under the canvas`,
    peak > 180,
    `peak luma ${peak.toFixed(0)} over the heading (text is 246, room walls are 8–90)`,
  )

  // Closest point on the box to the body's centre, then compare against the
  // silhouette radius. A rectangle/ellipse test, not centre-to-centre: the box
  // is wide and centre distance says nothing useful about its near edge.
  const nx = Math.max(geom.box.x, Math.min(geom.body.cx, geom.box.x + geom.box.w))
  const ny = Math.max(geom.box.y, Math.min(geom.body.cy, geom.box.y + geom.box.h))
  const gap = Math.hypot(geom.body.cx - nx, geom.body.cy - ny) - Math.max(geom.body.rx, geom.body.ry)

  check(
    `[${vp.label}] the chatbox clears SAMSARA (${vp.expect})`,
    gap >= MIN_GAP_PX,
    `gap ${gap.toFixed(1)}px (need ${MIN_GAP_PX})`,
  )

  // Direction, not just distance: "clears it" is satisfied by a box that has
  // drifted off the opposite edge, which is not the owner's composition.
  if (vp.w < 640) {
    check(
      `[${vp.label}] and sits BELOW it`,
      geom.box.y > geom.body.cy,
      `box top ${Math.round(geom.box.y)} vs body centre ${Math.round(geom.body.cy)}`,
    )
  } else {
    check(
      `[${vp.label}] and sits LEFT of it`,
      geom.box.x + geom.box.w < geom.body.cx,
      `box right ${Math.round(geom.box.x + geom.box.w)} vs body centre ${Math.round(geom.body.cx)}`,
    )
  }

  check(`[${vp.label}] no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

  await page.screenshot({ path: `samsarashots/room-${vp.w}x${vp.h}.png` })
  await page.close()
}

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nThe chatbox stub sits where the owner put it.',
)
process.exit(failures ? 1 : 0)
