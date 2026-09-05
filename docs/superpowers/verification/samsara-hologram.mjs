/**
 * The holographic screen: the DOM contract, the phase machine underneath it,
 * press-and-hold's flicker, and the reduced-motion bail-out.
 *
 * Plan Task 12. §0000 shipped the hologram and never wrote this — companion to
 * `samsara-emitters.mjs` (Task 11), which covers the orbs themselves (parking,
 * smoke). This file is the screen's own contract:
 *
 *   1. HologramController's phase machine — dormant -> entering -> parked ->
 *      emitting -> forming -> live (live terminal) — actually reaches 'live'
 *      in order, driven by real beats into the room.
 *   2. spec §5.7's DOM contract: `data-tt-hologram` and the four `--tt-holo-*`
 *      custom properties, read from `window.__ttHologram()` and from the DOM
 *      directly — PRESENCE lifts only at 'forming'/'live' (SamsaraSequence.tsx's
 *      own words), VALUE tracks the engine's rendered projection every frame.
 *   3. Press-and-hold: the shake builds, the flicker fires and — the specific
 *      thing spec calls out — CONTINUES for as long as the hold does, not once
 *      and done; the dip fades over RELEASE_MS on release rather than cutting;
 *      and the published rect never moves while it dips ("the flicker touches
 *      OPACITY ONLY — never the transform, never visibility, never the phase").
 *   4. `prefers-reduced-motion: reduce` — the hologram must never exist at all.
 *
 * ── Why the BENCH, not the homepage (for 2 and 3) ─────────────────────
 *
 * Same reasoning as samsara-emitters.mjs: `/en` reads whatever the CMS global
 * currently holds, which may not match `DEFAULT_SEQUENCE` (the freeze gate for
 * HOLOGRAM/POKE, plan Task 15, has not run). The bench's `cfg` starts from
 * `structuredClone(DEFAULT_SEQUENCE)`, so it is the one place this gate can
 * drive a known configuration. `__ttHologram`, `__ttSamsara` and
 * `__ttSamsaraBeat` are installed by `SamsaraSequence` wherever it mounts.
 *
 * The reduced-motion check (4) is the one exception that does NOT need the
 * bench's determinism — `window.matchMedia('(prefers-reduced-motion: reduce)')`
 * is checked FIRST in SamsaraSequence's effect, before `armed` is even read
 * (SamsaraSequence.tsx), so it bails out identically wherever the component is
 * mounted. Run on the bench anyway, for one less browser context to launch.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-hologram.mjs
 */
import puppeteer from './_puppeteer.mjs'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const ORIGIN = process.env.TT_ORIGIN ?? 'http://localhost:3000'
const BENCH = `${ORIGIN}/en/dev/samsara`
const W = 1440
const H = 900

let failures = 0
const check = (label, cond, note = '') => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  } else {
    console.log(`ok    ${label}   ${note}`)
  }
}

mkdirSync('samsarashots', { recursive: true })

/**
 * Drive four synthetic beats down, then wait for the engine's OWN mode —
 * never a fixed delay. Same technique as samsara-burst.mjs.
 */
const driveIntoRoom = (page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      window.__ttSamsaraBeat('down')
      await new Promise((r) => setTimeout(r, 120))
    }
    const t0 = performance.now()
    while (performance.now() - t0 < 15000) {
      if (window.__ttSamsara().mode === 'landed') break
      await new Promise((r) => setTimeout(r, 100))
    }
    return window.__ttSamsara().mode
  })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── minimal orb-marker finder — trimmed from samsara-emitters.mjs ─────
//
// Only needed here to get ONE valid click point for the press-and-hold check;
// this file does not care which orb it is or where either one parks (that is
// samsara-emitters.mjs's job).
const closeTo = (r, g, b, [tr, tg, tb], tol) => Math.hypot(r - tr, g - tg, b - tb) <= tol
const findMarkerPixels = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const pts = []
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * info.channels
    if (
      closeTo(data[i], data[i + 1], data[i + 2], [0x33, 0xff, 0x88], 40) ||
      closeTo(data[i], data[i + 1], data[i + 2], [0xff, 0x44, 0x88], 40)
    ) {
      pts.push({ x: p % info.width, y: Math.floor(p / info.width) })
    }
  }
  return pts
}
const clusterOne = (pts) => {
  if (pts.length < 2) return null
  const xs = [...pts].sort((a, b) => a.x - b.x)
  let splitAt = 0
  let bestGap = -1
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i].x - xs[i - 1].x
    if (gap > bestGap) {
      bestGap = gap
      splitAt = i
    }
  }
  const g = xs.slice(0, splitAt)
  if (g.length === 0) return null
  return { x: g.reduce((s, p) => s + p.x, 0) / g.length, y: g.reduce((s, p) => s + p.y, 0) / g.length }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

// ── 1. reduced motion: the hologram must never exist ──────────────────
{
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: W, height: H })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.goto(BENCH, { waitUntil: 'networkidle0', timeout: 120000 })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 120000 })

  // Real beats, exactly as a visitor's wheel would drive them — under a
  // working build these alone are enough to reach 'landed' and start the
  // hologram. Six seconds is generously past the ~800ms the bench itself
  // takes to arm, so "never" and "not yet" are told apart honestly.
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) {
      window.__ttSamsaraBeat?.('down')
      await new Promise((r) => setTimeout(r, 120))
    }
  })
  await sleep(6000)

  const state = await page.evaluate(() => ({
    samsara: typeof window.__ttSamsara,
    hologram: typeof window.__ttHologram,
    attr: document.documentElement.dataset.ttHologram ?? null,
  }))
  check('[reduced motion] the sequence never arms', state.samsara !== 'function', state.samsara)
  check('[reduced motion] the hologram dev handle never exists', state.hologram !== 'function', state.hologram)
  check('[reduced motion] no data-tt-hologram attribute is ever written', state.attr === null, `attr: ${state.attr}`)
  check('[reduced motion] no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
  await page.close()
}

// ── 2/3. the phase machine, the DOM contract, and press-and-hold ──────
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
await page.setViewport({ width: W, height: H })
await page.goto(BENCH, { waitUntil: 'networkidle0', timeout: 120000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 120000 })
check('the bench dev handle is exposed', await page.evaluate(() => !!window.__ttSamsaraBench))

await page.evaluate(() => window.__ttSamsaraBench.set('EMITTERS.SHOW_PORTS', true))

const landed = await driveIntoRoom(page)
check('reached the room', landed === 'landed', landed)
check('the hologram dev handle is exposed', await page.evaluate(() => typeof window.__ttHologram === 'function'))

/**
 * Poll `__ttHologram()` — phase, rect and attr in one call — until 'live',
 * recording every sample. One pass gives us both the phase-order check and
 * the DOM-contract check, rather than polling twice for two different things.
 */
const samples = []
{
  const t0 = Date.now()
  while (Date.now() - t0 < 20000) {
    const h = await page.evaluate(() => window.__ttHologram())
    samples.push(h)
    if (h.phase === 'live') break
    await sleep(70)
  }
}
// Adjacent-repeat collapse of the raw sequence — not a Set, which would also
// (harmlessly here, but wrongly in general) drop a phase that recurs after
// the machine has moved on, and this is a state machine, not a bag of values.
const phaseLog = []
for (const s of samples) if (phaseLog.at(-1) !== s.phase) phaseLog.push(s.phase)
console.log('phases observed:', phaseLog.join(' -> '))

const isSubsequence = (needle, haystack) => {
  let i = 0
  for (const v of haystack) {
    if (v === needle[i]) i++
    if (i === needle.length) return true
  }
  return i === needle.length
}
check(
  'the phase machine runs entering -> parked -> emitting -> forming -> live in order',
  isSubsequence(['entering', 'parked', 'emitting', 'forming', 'live'], phaseLog),
  phaseLog.join(' -> '),
)
check('and settles on the terminal live phase', phaseLog.at(-1) === 'live', phaseLog.at(-1))

/**
 * The DOM contract, spec §5.7: "PRESENCE lifts, VALUE animates."
 *
 * `attr` must equal the phase name exactly when phase is 'forming' or 'live',
 * and be absent every other sampled phase — checked over EVERY sample taken
 * during the climb, not just the final one, so an attribute that flickered on
 * early (or never turned off before 'forming') is caught.
 */
{
  let violations = 0
  for (const s of samples) {
    const shouldBePresent = s.phase === 'forming' || s.phase === 'live'
    const isCorrect = shouldBePresent ? s.attr === s.phase : s.attr === null
    if (!isCorrect) violations++
  }
  check(
    'data-tt-hologram is present ONLY during forming/live, and matches the phase',
    violations === 0,
    `${violations} of ${samples.length} sample(s) violated the contract`,
  )
}

const liveSample = samples.at(-1)
check('a rect is published once live', !!liveSample.rect, JSON.stringify(liveSample.rect))

const readCssVars = () =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const num = (v) => Number(cs.getPropertyValue(v).replace('px', '').trim())
    return { x: num('--tt-holo-x'), y: num('--tt-holo-y'), w: num('--tt-holo-w'), h: num('--tt-holo-h') }
  })

const cssVars1 = await readCssVars()
check(
  'the --tt-holo-* custom properties match the published rect',
  ['x', 'y', 'w', 'h'].every((k) => Math.abs(cssVars1[k] - liveSample.rect[k]) < 0.6),
  `css ${JSON.stringify(cssVars1)} vs rect ${JSON.stringify(liveSample.rect)}`,
)
check('the rect has real, positive size', liveSample.rect.w > 10 && liveSample.rect.h > 10, JSON.stringify(liveSample.rect))

/**
 * "VALUE animates" — proven by actually changing the input, not asserted from
 * a single static frame. The projected rect depends on the viewport (it is
 * the four screen corners projected through THIS camera at THIS aspect), so
 * resizing must move it. A rect that stayed put here would mean the DOM
 * contract is a one-time snapshot rather than a live per-frame publish.
 */
await page.setViewport({ width: 1024, height: 900 })
await sleep(500)
const resized = await page.evaluate(() => window.__ttHologram())
const cssVars2 = await readCssVars()
check(
  'resizing the viewport moves the published rect — it is live, not memoised',
  ['x', 'y', 'w', 'h'].some((k) => Math.abs(resized.rect[k] - liveSample.rect[k]) > 5),
  `before ${JSON.stringify(liveSample.rect)} -> after ${JSON.stringify(resized.rect)}`,
)
check(
  'and the CSS vars kept up with it',
  ['x', 'y', 'w', 'h'].every((k) => Math.abs(cssVars2[k] - resized.rect[k]) < 0.6),
  `css ${JSON.stringify(cssVars2)} vs rect ${JSON.stringify(resized.rect)}`,
)

// Back to the size the marker-based click point below assumes.
await page.setViewport({ width: W, height: H })
await sleep(500)

// ── find a click point on one of the orbs ──────────────────────────────
const portsShot = await page.screenshot()
await sharp(portsShot).toFile('samsarashots/hologram-ports.png')
const orb = clusterOne(await findMarkerPixels(portsShot))
check('an orb is found to press', !!orb, JSON.stringify(orb))
await page.evaluate(() => window.__ttSamsaraBench.set('EMITTERS.SHOW_PORTS', false))

if (orb) {
  const poke = () => page.evaluate(() => window.__ttHologram())

  await page.mouse.move(orb.x, orb.y)
  await page.mouse.down()

  // POKE.SHAKE_MS is 475ms by default. Poll for the condition — dip() free-
  // runs its cycle clock from zero the instant `fired` flips true, and the
  // waveform is legitimately zero at that exact frame.
  let fired = await poke()
  {
    const t0 = Date.now()
    while ((fired.poke.phase !== 'firing' || fired.poke.dip === 0) && Date.now() - t0 < 2000) {
      await sleep(40)
      fired = await poke()
    }
  }
  check('the hold fires the flicker once SHAKE_MS has passed', fired.poke.phase === 'firing', JSON.stringify(fired.poke))
  check('and the screen is dipping', fired.poke.dip > 0, `dip ${fired.poke.dip.toFixed(2)}`)

  /**
   * "The published rect and the live state must be byte-identical during a
   * dip" — SamsaraSequence.tsx's own words, because this screen will carry
   * subtitles and buttons that must not jitter every time the flicker breathes.
   * The flicker changes OPACITY only; phase and rect must be untouched.
   */
  check('the phase stays live while flickering', fired.phase === 'live', fired.phase)
  check(
    'and the rect does not move a single pixel while it dips',
    ['x', 'y', 'w', 'h'].every((k) => fired.rect[k] === liveSample.rect[k]),
    `${JSON.stringify(fired.rect)} vs ${JSON.stringify(liveSample.rect)}`,
  )

  /**
   * "Continuous... until release" (orbPoke.ts, and the owner's own 2026-09-05
   * decision recorded there) — so keep holding well past one FLICKER_MS
   * (400ms default) and require an actual PEAK, then a TROUGH after it, then
   * a second PEAK after that: proof the waveform keeps oscillating on its own
   * while the press is still down, rather than firing once and settling.
   */
  const track = []
  {
    const t0 = Date.now()
    while (Date.now() - t0 < 1400) {
      track.push(await poke().then((h) => h.poke.dip))
      await sleep(30)
    }
  }
  let peak1 = -1
  let trough = -1
  let peak2 = -1
  for (let i = 0; i < track.length; i++) {
    if (peak1 === -1 && track[i] > 0.35) peak1 = i
    else if (peak1 !== -1 && trough === -1 && track[i] < 0.1) trough = i
    else if (trough !== -1 && peak2 === -1 && track[i] > 0.35) peak2 = i
  }
  check(
    'the flicker keeps oscillating (peak -> trough -> peak) while still held',
    peak1 !== -1 && trough !== -1 && peak2 !== -1,
    `dip trace: ${track.map((v) => v.toFixed(2)).join(' ')}`,
  )

  // ── release: fades, does not cut ───────────────────────────────────
  await page.mouse.up()
  /**
   * A window comparison ("early" vs "late") was tried first and is NOT
   * reliable here: the waveform's own troughs run ~120-150ms (visible in the
   * hold trace above), close to a third of RELEASE_MS itself, so an "early"
   * window can land entirely inside a trough that has nothing to do with the
   * envelope fading — and did, on this exact run. What the envelope actually
   * controls is the CEILING each oscillation can reach, not any one instant.
   *
   * So: find the highest dip reached ANYWHERE across RELEASE_MS (POKE.RELEASE_MS
   * is 420ms by default — one full FLICKER_MS cycle is guaranteed to fit, so a
   * peak WILL appear somewhere in there if the envelope has not been cut to
   * zero) against the highest reached in the TAIL, which is forced to true zero
   * once `fadeMs >= RELEASE_MS` clears `fired` — a real fade shows a clear peak
   * followed by a diminished tail; a cut shows near-zero everywhere.
   */
  const releaseTrack = []
  {
    const t0 = Date.now()
    while (Date.now() - t0 < 550) {
      releaseTrack.push({ t: Date.now() - t0, ...(await poke()).poke })
      await sleep(30)
    }
  }
  const maxOver = (lo, hi, key) =>
    Math.max(0, ...releaseTrack.filter((s) => s.t >= lo && s.t < hi).map((s) => s[key]))
  const peakDuringRelease = maxOver(0, 420, 'dip')
  const tailDip = maxOver(380, 550, 'dip')
  check(
    'the dip FADES over RELEASE_MS rather than being cut at release',
    peakDuringRelease > 0.15 && tailDip < peakDuringRelease * 0.5,
    `peak during release ${peakDuringRelease.toFixed(2)}, tail ${tailDip.toFixed(2)}`,
  )

  await sleep(200)
  const settled = await poke()
  check(
    'the flicker settles back to idle, and the screen is still live',
    settled.poke.phase === 'idle' && settled.poke.dip === 0 && settled.phase === 'live',
    JSON.stringify(settled),
  )
  check(
    'the rect is unchanged after the whole press/release cycle',
    ['x', 'y', 'w', 'h'].every((k) => settled.rect[k] === liveSample.rect[k]),
    `${JSON.stringify(settled.rect)} vs ${JSON.stringify(liveSample.rect)}`,
  )
}

// ── leaving the room removes the attribute ─────────────────────────────
//
// SamsaraSequence.tsx's cleanup comment: "a torn-down sequence must leave the
// page exactly as one that never had a hologram, which is no attribute at
// all." Driven by real beats back up, the same way samsara-burst.mjs proves
// nothing leaks into the hero orbit.
const back = await page.evaluate(async () => {
  for (let i = 0; i < 4; i++) {
    window.__ttSamsaraBeat('up')
    await new Promise((r) => setTimeout(r, 120))
  }
  const t0 = performance.now()
  while (performance.now() - t0 < 12000) {
    if (window.__ttSamsara().mode === 'idle') break
    await new Promise((r) => setTimeout(r, 100))
  }
  await new Promise((r) => setTimeout(r, 300))
  return { mode: window.__ttSamsara().mode, attr: document.documentElement.dataset.ttHologram ?? null }
})
check('scrolling back out returns to idle', back.mode === 'idle', back.mode)
check('and data-tt-hologram is removed — no attribute left dangling', back.attr === null, `attr: ${back.attr}`)

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()
console.log(
  failures
    ? `\n${failures} check(s) failed.`
    : '\nThe hologram\u2019s phase machine, DOM contract and press-and-hold all hold up.',
)
process.exit(failures ? 1 : 0)
