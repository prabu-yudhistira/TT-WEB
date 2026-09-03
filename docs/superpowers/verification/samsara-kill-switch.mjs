/**
 * `sequenceEnabled: false` must remove the transition ENTIRELY — spec §5.10.
 *
 * ⚠️ Not "present but inert". A kill switch that left an effect half-running has
 * shipped TWICE on this project — once gating only a lead time, once gating only
 * a parameter path — each leaving the site in a state WORSE than the switch
 * promised to restore. So the OFF assertions are about the things that would
 * still be true of a half-disabled build: the wheel listener, the pin, the
 * promoted canvas, and whether Section 2 can actually be reached.
 *
 * ── Two things that make this test awkward, and why it is shaped this way ──
 *
 * 1. THE SWITCH ONLY EXISTS IN THE CMS. `resolveSamsara` prefers saved global
 *    data over code defaults, so editing `DEFAULT_SEQUENCE.ENABLED` does nothing
 *    once the global has been seeded. Driving it any other way would be testing
 *    a path the owner never uses.
 *
 * 2. A WRITE MUST GO THROUGH THE RUNNING SERVER. `unstable_cache` persists to
 *    disk, and `revalidateTag` is a documented no-op outside a Next request
 *    context — so a script that pokes the database directly leaves the page
 *    serving the old value. Writing through the authenticated REST API runs the
 *    global's own `afterChange` hook inside a real request, which invalidates
 *    the tag properly.
 *
 * ⚠️ IT RESTORES THE SWITCH IN A `finally`. If this script is killed between the
 * disable and the restore, the site stays disabled — set it back in /admin, or
 * re-run this.
 *
 * ⚠️ AND IT IS PROVEN ABLE TO FAIL. Plan Task 17 step 3: a check that has never
 * gone red is not evidence, and this project's mascot kill-switch check was
 * wrong three separate times before it was right. Run:
 *
 *     TT_BREAK_KILL=1 node --import tsx docs/.../samsara-kill-switch.mjs
 *
 * which runs every OFF assertion WITHOUT actually disabling the sequence. All of
 * them must go red; any that stays green is not testing what it claims to.
 *
 * Run: node --env-file=.env --import tsx docs/superpowers/verification/samsara-kill-switch.mjs
 */
import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const ORIGIN = process.env.TT_ORIGIN ?? 'http://localhost:3000'
const BASE = `${ORIGIN}/en`
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@tampa-taruno.local'
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'tampataruno-2026'
/** Deliberate sabotage — see the header. */
const BREAK = process.env.TT_BREAK_KILL === '1'

let failures = 0
/**
 * How many of the SWITCH-DISCRIMINATING checks failed.
 *
 * ⚠️ Not every [off] assertion is one. "Section 2 is still reachable" must hold
 * with the switch ON as well — that is the entire point of fail-open — so
 * demanding that it go red under TT_BREAK_KILL would be demanding the site be
 * broken. The first version of this file counted them together and reported
 * "only 2 of 7 went red" as if five checks were worthless, when really two
 * kinds of assertion had been mixed. They are tagged apart now.
 */
let discriminatingFailures = 0
const check = (label, cond, note = '', discriminating = false) => {
  if (!cond) {
    failures++
    if (discriminating) discriminatingFailures++
    console.error(`FAIL  ${label}   ${note}`)
  } else {
    console.log(`ok    ${label}   ${note}`)
  }
}

// ── authenticate once ────────────────────────────────────────────────
const login = await fetch(`${ORIGIN}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!login.ok) {
  console.error(`Could not log in as ${EMAIL} (${login.status}).`)
  console.error('Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, or run with --env-file=.env.')
  process.exit(1)
}
const token = (await login.json()).token

const setEnabled = async (value) => {
  const res = await fetch(`${ORIGIN}/api/globals/samsara-sequence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ sequenceEnabled: value }),
  })
  if (!res.ok) throw new Error(`could not set sequenceEnabled=${value}: ${res.status}`)
  // Read it back rather than trusting the write — the whole test is meaningless
  // if the flag did not actually move.
  const now = await (await fetch(`${ORIGIN}/api/globals/samsara-sequence`)).json()
  if (now.sequenceEnabled !== value) throw new Error(`sequenceEnabled did not become ${value}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

/** Load the homepage and report everything the two polarities differ on. */
const inspect = async () => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120000 })
  // The hero's intro gates arming either way, so "not yet" and "never" need the
  // same wait before they can be told apart.

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

  // Real wheel gestures, and the document only moves when nothing swallowed
  // them — which is what makes a pin observable. `window.scrollBy` alone walks
  // straight past the listener and would call a jammed page healthy.
  const scroll = await page.evaluate(async () => {
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 400))
    const before = window.scrollY
    const target =
      document.querySelector('[data-hero], header, main')?.firstElementChild ?? document.body
    for (let i = 0; i < 14; i++) {
      const ev = new WheelEvent('wheel', { deltaY: 180, bubbles: true, cancelable: true })
      target.dispatchEvent(ev)
      if (!ev.defaultPrevented) window.scrollBy(0, 180)
      await new Promise((r) => setTimeout(r, 90))
    }
    await new Promise((r) => setTimeout(r, 700))
    return { before, after: window.scrollY }
  })

  /**
   * ⚠️ Try to drive it into the room BEFORE measuring promotion.
   *
   * With the switch off there is no handle and this does nothing, which is the
   * result being tested. With it on, this is what makes `hostPosition` actually
   * differ between the polarities — it only changes after the commit. Measured
   * without it, that check read identically in both states and was silently
   * testing nothing.
   */
  await page.evaluate(async () => {
    if (typeof window.__ttSamsaraBeat !== 'function') return
    for (let i = 0; i < 4; i++) {
      window.__ttSamsaraBeat('down')
      await new Promise((r) => setTimeout(r, 130))
    }
    const t0 = performance.now()
    while (performance.now() - t0 < 14000) {
      if (window.__ttSamsara().mode === 'landed') break
      await new Promise((r) => setTimeout(r, 120))
    }
    await new Promise((r) => setTimeout(r, 800))
  })

  const room = await page.evaluate(async () => {
    const el = document.querySelector('[data-block="samsaraRoom"]')
    if (!el) return { present: false }
    el.scrollIntoView({ block: 'start' })
    await new Promise((r) => setTimeout(r, 700))
    const n = el.querySelector('.tt-room-note')
    const nb = n?.getBoundingClientRect()
    return {
      present: true,
      noteInViewport: !!nb && nb.top >= 0 && nb.bottom <= window.innerHeight && nb.height > 0,
      notePosition: n ? getComputedStyle(n).position : null,
    }
  })

  // The canvas host is promoted to `fixed` for the room. With the switch off it
  // must never leave `absolute` — a promoted canvas over a page that cannot
  // enter the room is the exact "half-disabled" state this file guards.
  // ⚠️ EVERY canvas, not the first one. The page has several — the logo, the
  // satellites, the mascot — and querySelector("canvas") returns the LOGO, whose
  // host is absolute in both polarities. Measured that way this check read
  // "absolute" even with SAMSARA standing in the room, and was the one assertion
  // that stayed green under TT_BREAK_KILL.
  const hostPosition = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('canvas')]
      .map((c) => c.parentElement)
      .filter(Boolean)
      .map((el) => getComputedStyle(el).position)
    return hosts.includes('fixed') ? 'fixed' : hosts.join('/')
  })

  await page.close()
  return { armed, scroll, room, hostPosition, errors }
}

let restored = false
try {
  if (BREAK) {
    console.log('\n⚠️  TT_BREAK_KILL=1 — the switch is NOT being flipped.')
    console.log('    Every [off] assertion below must FAIL. A green one is a lie.\n')
  } else {
    await setEnabled(false)
  }

  // ── OFF ────────────────────────────────────────────────────────────
  {
    const r = await inspect()
    // ── switch-discriminating: these MUST differ between the polarities ──
    check('[off] the sequence does not arm', r.armed === false,
      r.armed ? 'window.__ttSamsara exists' : '', true)
    check('[off] no wheel handler swallows the scroll',
      r.scroll.after > r.scroll.before + 100,
      `scrollY ${r.scroll.before} -> ${r.scroll.after}`, true)
    check('[off] the canvas never promotes to fixed', r.hostPosition !== 'fixed',
      `position: ${r.hostPosition}`, true)

    /**
     * ── invariants: true in BOTH polarities. Fail-open is the whole promise,
     * so these must NOT go red under TT_BREAK_KILL. ──
     *
     * ⚠️ Section 2's readable content used to be a DISCRIMINATING check: the
     * chatbox was lifted to `fixed` and `data-tt-chatbox` was written only when
     * the sequence ran, so both differed between the polarities. The chatbox is
     * gone (2026-09-03) and the note that replaced it is plain in-flow DOM that
     * nothing promotes, so it reads identically in both states — which makes it
     * an invariant and NOT evidence that the switch works. Demanding it go red
     * would be demanding the site be broken.
     *
     * That leaves three discriminating checks above. If a future change gives
     * Section 2 sequence-driven DOM again (the holographic screen will), add it
     * back to the discriminating set rather than leaving it here.
     */
    check('[off] Section 2 is still reachable and readable',
      r.room.present === true && r.room.noteInViewport === true)
    check('[off] and its content is ordinary in-flow DOM',
      r.room.notePosition === 'relative' || r.room.notePosition === 'static',
      `note position: ${r.room.notePosition}`)
    check('[off] no page errors', r.errors.length === 0, r.errors.slice(0, 2).join(' | '))
  }

  // ── ON again ───────────────────────────────────────────────────────
  //
  // The other polarity, and not a formality: it is what proves the OFF result
  // came from the switch rather than from something else being broken.
  if (!BREAK) {
    await setEnabled(true)
    restored = true
    const r = await inspect()
    check('[on] the sequence arms', r.armed === true)
    check('[on] and the pin is back — wheel gestures no longer scroll the page',
      r.scroll.after <= r.scroll.before + 8,
      `scrollY ${r.scroll.before} -> ${r.scroll.after}`)
    check('[on] no page errors', r.errors.length === 0, r.errors.slice(0, 2).join(' | '))
  }
} finally {
  if (!BREAK && !restored) {
    try {
      await setEnabled(true)
      console.log('\n(the sequence was re-enabled during cleanup)')
    } catch (e) {
      console.error('\n⚠️  COULD NOT RESTORE sequenceEnabled — set it back on in /admin.', e)
    }
  }
  await browser.close()
}

if (BREAK) {
  // Was 5 until 2026-09-03. The chatbox's two discriminating assertions (the
  // `data-tt-chatbox` layer being claimed, and the box lifting to `fixed`) went
  // with the chatbox itself; the note that replaced it is in-flow in both
  // polarities and is an invariant, not evidence. Three remain: arming, the
  // scroll pin, and the canvas promotion.
  const WANT = 3
  const ok = discriminatingFailures === WANT
  console.log(
    ok
      ? `\nGood: all ${WANT} switch-discriminating assertions went red against a RUNNING`
        + ' sequence, so each one is really testing the switch.'
      : `\nBAD: ${discriminatingFailures} of ${WANT} discriminating assertions went red.`
        + ' One that stays green here is not testing anything.',
  )
  process.exit(ok ? 0 : 1)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nThe kill switch removes the sequence.')
process.exit(failures ? 1 : 0)
