/**
 * The emitter orbs: they park bottom-left(ish), their four afterburners smoke
 * CONTINUOUSLY, and press-and-hold shakes the pair before it releases.
 *
 * Plan Task 11. §0000 shipped the orbs and never wrote this — the site has run
 * on eyeballing the bench ever since, which is exactly the situation
 * `samsara-burst.mjs`'s header warns about: unit tests on `emitterOrbs.check.ts`
 * and `orbSmoke.check.ts` prove the ARITHMETIC, not that a single pixel lands on
 * screen in the right place.
 *
 * ── Why the BENCH, not the homepage ──────────────────────────────────
 *
 * Every earlier samsara-*.mjs gate drives `/en` because that is production
 * behaviour. This one drives `/en/dev/samsara` instead, for a reason specific
 * to this feature: `EMITTERS.SHOW_PORTS` and `POKE.ENABLED` are CMS fields, and
 * the homepage reads whatever is currently seeded in the database — which may
 * or may not match `DEFAULT_SEQUENCE` (the freeze gate for these groups, plan
 * Task 15, has not run). The bench's `cfg` state starts from
 * `structuredClone(DEFAULT_SEQUENCE)` and only moves when a slider, a query
 * param, or `window.__ttSamsaraBench.set()` moves it — so it is the one place
 * this gate can drive a known configuration deterministically. `__ttHologram`,
 * `__ttSamsara` and `__ttSamsaraBeat` are installed by `SamsaraSequence`
 * wherever it mounts, bench included, so nothing else about the harness
 * changes.
 *
 * ── How the orbs are FOUND, not computed ─────────────────────────────
 *
 * There is no dev handle that reports an orb's screen position — only
 * `MascotEngine.hitsOrb()`, which is private to the pointer path. Recomputing
 * `orbParkedPose` + the camera projection here would test this file's copy of
 * that arithmetic, not the render. So: turn `EMITTERS.SHOW_PORTS` on — five
 * markers per orb, `depthTest: false`, rendered in two colours specifically "so
 * they cannot be confused" (emitterScene.ts) — and find them by COLOUR in a
 * screenshot, the same principle `samsara-burst.mjs` uses for the smoke itself.
 * The two clusters split cleanly on x: NEAR parks at X_FRAC 0.12, FAR at 0.57,
 * a viewport-wide gap apart.
 *
 * Their centroid then doubles as the click point for the press-and-hold check
 * — closer to the true body centre than either marker alone, and the whole
 * reason `hitsOrb()` reads FIVE points per orb rather than one.
 *
 * Run: node --import tsx docs/superpowers/verification/samsara-emitters.mjs
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

// Gates write here, not into eyeshots/ — see samsara-burst.mjs's header.
mkdirSync('samsarashots', { recursive: true })

/** Euclidean distance in RGB, for matching a marker's exact unlit colour. */
const closeTo = (r, g, b, [tr, tg, tb], tol) =>
  Math.hypot(r - tr, g - tg, b - tb) <= tol

/**
 * Every pixel matching either marker colour, as {x, y} points.
 *
 * ⚠️ Both colours together, on purpose. The five markers per orb (four ports
 * plus the lens, emitterScene.ts) sit within a few pixels of the orb's own
 * centre at these depths, so pooling green and pink and then clustering on x
 * gives a centroid closer to the true body centre than either colour alone —
 * and it is the body centre `hitsOrb()` actually tests against.
 */
const findMarkerPixels = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const pts = []
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * info.channels
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (closeTo(r, g, b, [0x33, 0xff, 0x88], 40) || closeTo(r, g, b, [0xff, 0x44, 0x88], 40)) {
      pts.push({ x: p % info.width, y: Math.floor(p / info.width) })
    }
  }
  return pts
}

/**
 * Split marker points into two orbs by the largest gap on x, then return each
 * cluster's centroid sorted near-first (smaller x — NEAR parks at X_FRAC 0.12,
 * well left of FAR's 0.57).
 *
 * A gap split rather than k-means: two orbs at a viewport-wide X_FRAC apart are
 * not a hard clustering problem, and a fixed-k library is more machinery than
 * the geometry needs.
 */
const clusterOrbs = (pts) => {
  if (pts.length < 2) return []
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
  const groups = [xs.slice(0, splitAt), xs.slice(splitAt)]
  return groups
    .filter((g) => g.length > 0)
    .map((g) => ({
      x: g.reduce((s, p) => s + p.x, 0) / g.length,
      y: g.reduce((s, p) => s + p.y, 0) / g.length,
      n: g.length,
    }))
    .sort((a, b) => a.x - b.x)
}

/**
 * Pixels lit above the room's own ambient floor, in a box.
 *
 * ⚠️ NOT a colour match, and deliberately a low bar. The afterburner puffs
 * (PUFF_COLOR '#F0E6D1') are blended with ORDINARY alpha at PUFF_OPACITY 0.25 —
 * unlike the shafts and the glass, this material carries no
 * `blending: AdditiveBlending` — so a single puff over the graphite room
 * (#08080A walls, mid-grey floor) barely lifts a pixel out of the noise.
 * Measured here: the room's own ambient floor in this corner sits at
 * brightness 30-50; a threshold of 55 catches anything lit past that without
 * needing the puffs to be individually bright.
 *
 * The false positives this invites — the shaft's core glow, highlights on the
 * orb's own shell — are exactly why this is never used as an absolute count.
 * See litPixels' caller: it is always a BEFORE/AFTER of the same box, with
 * THRUST_RATE the only thing that changed.
 */
const litPixels = async (buf, box) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  // ⚠️ FLOORED. box comes from a marker CENTROID (an average of pixel
  // coordinates), so its bounds are fractional. A loop that starts at a
  // fractional y and steps by integers never touches an integer index again —
  // `data[589.85 * width + x]` is `undefined` for every single pixel, not an
  // out-of-range value, so the whole scan silently reports zero. Cost this
  // check its first afternoon: the render was fine and every "before/after"
  // sample compared undefined to undefined.
  const [x0, y0, x1, y1] = box.map(Math.floor)
  let n = 0
  for (let y = Math.max(0, y0); y < Math.min(info.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(info.width, x1); x++) {
      const i = (y * info.width + x) * info.channels
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if ((r + g + b) / 3 > 55) n++
    }
  }
  return n
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
await page.setViewport({ width: W, height: H })
await page.goto(BENCH, { waitUntil: 'networkidle0', timeout: 120000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, {
  timeout: 120000,
})
check('the bench dev handle is exposed', await page.evaluate(() => !!window.__ttSamsaraBench))

// Turn the markers on before entering, so they are already live the moment the
// orbs park.
await page.evaluate(() => window.__ttSamsaraBench.set('EMITTERS.SHOW_PORTS', true))
await new Promise((r) => setTimeout(r, 150))

// ── into the room, collecting the hologram's phase machine as it runs ──
//
// Same driving technique as samsara-burst.mjs: real synthetic beats via the
// dev handle, polled against the ENGINE's own mode rather than a fixed delay.
const phaseLog = []
const landed = await page.evaluate(async () => {
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
check('reached the room', landed === 'landed', landed)

check('the hologram dev handle is exposed', await page.evaluate(() => typeof window.__ttHologram === 'function'))

// Poll the phase machine until it reaches 'live' (dormant -> entering -> parked
// -> emitting -> forming -> live is ~4.5s of engine time — see
// HologramController.ts), recording every distinct value seen in order.
{
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < 20000) {
    const phase = await page.evaluate(() => window.__ttHologram().phase)
    if (phase !== last) {
      phaseLog.push(phase)
      last = phase
    }
    if (phase === 'live') break
    await new Promise((r) => setTimeout(r, 80))
  }
}
console.log('phases observed:', phaseLog.join(' -> '))

/**
 * A SUBSEQUENCE check, not equality. Polling is not guaranteed to land exactly
 * on 'entering' as the very first sample — the beats loop above already spent
 * some engine time reaching 'landed' — so the assertion is "these appear in
 * this relative order", not "this is the whole list from the start".
 */
const isSubsequence = (needle, haystack) => {
  let i = 0
  for (const v of haystack) {
    if (v === needle[i]) i++
    if (i === needle.length) return true
  }
  return i === needle.length
}
check(
  'the phase machine runs parked -> emitting -> forming -> live in order',
  isSubsequence(['parked', 'emitting', 'forming', 'live'], phaseLog),
  phaseLog.join(' -> '),
)
check('and settles on the terminal live phase', phaseLog.at(-1) === 'live', phaseLog.at(-1))

// ── where the orbs actually parked ──────────────────────────────────
const portsShot = await page.screenshot()
await sharp(portsShot).toFile('samsarashots/emitters-ports.png')
const markerPts = await findMarkerPixels(portsShot)
const orbs = clusterOrbs(markerPts)

check('both orbs are found by their SHOW_PORTS markers', orbs.length === 2, `${orbs.length} cluster(s)`)

if (orbs.length === 2) {
  const [near, far] = orbs
  console.log(
    `near orb  ~(${near.x.toFixed(0)}, ${near.y.toFixed(0)})  ${near.n}px`,
    `\nfar orb   ~(${far.x.toFixed(0)}, ${far.y.toFixed(0)})  ${far.n}px`,
  )
  // DEFAULT_SEQUENCE.EMITTERS: NEAR Y_FRAC 0.85, FAR Y_FRAC 0.92 — both firmly
  // in the bottom of the frame. A generous 0.65 floor rather than asserting
  // near those exact fractions, which is the render proving the CONFIG again.
  check('the near orb parks in the lower part of the frame', near.y / H > 0.65, `y/H ${(near.y / H).toFixed(2)}`)
  check('the far orb parks in the lower part of the frame', far.y / H > 0.65, `y/H ${(far.y / H).toFixed(2)}`)
  // Only the NEAR orb (X_FRAC 0.12) is asserted as "left" — FAR parks at 0.57,
  // just right of centre, and claiming otherwise would be the render disagreeing
  // with the very config it is supposed to confirm.
  check('the near orb parks on the left of the frame', near.x / W < 0.35, `x/W ${(near.x / W).toFixed(2)}`)

  // ── continuous smoke: THRUST_RATE as an A/B switch, not a colour hunt ──
  //
  // The first version of this check measured absolute brightness in a box
  // guessed to sit "below" each orb, and it failed both orbs at every sample —
  // not because there was no smoke, but because there was no smoke THERE.
  // NEAR_ROT/FAR_ROT rotate PLUME_OUT/PLUME_Y with the body, so the visible
  // plume drifts down-and-LEFT on screen, not straight down, and differently
  // for each orb; a screenshot confirmed faint wisps just outside the guessed
  // box. Guessing a direction is exactly the "measuring a raster by eye" this
  // project's own handoff warns off — see §0000's panel-redraw postmortem.
  //
  // So: stop guessing where, and stop guessing how bright. THRUST_RATE is a
  // CMS field the bench can drive directly, so turn it off, let the existing
  // pool fully die (PUFF_LIFE_MS 1000ms), and compare a big box AROUND each
  // orb — big enough to hold the plume in any direction — against that true
  // zero. Whatever else lives in that box (the orb's own shell, the shaft's
  // core glow) is identical in both samples and cancels out of the
  // comparison; only THRUST_RATE changed.
  //
  // ⚠️ HOLOGRAM.FLICKER_DEPTH=0 for the SAME reason, and it is not optional.
  // 'live' runs a PERMANENT periodic dip (flickerAt(), on HOLOGRAM.FLICKER_MS —
  // a few seconds — independent of the orbs entirely). Measured directly: it
  // swings this box's lit-pixel count by MORE than the smoke does, so an
  // on/off pair sampled a moment apart can land on different points of that
  // cycle and read backwards — the first version of this check did exactly
  // that, twice, on both orbs. Killing the amplitude removes the confound
  // rather than averaging around it.
  await page.evaluate(() => window.__ttSamsaraBench.set('EMITTERS.SHOW_PORTS', false))
  await page.evaluate(() => window.__ttSamsaraBench.set('HOLOGRAM.FLICKER_DEPTH', 0))
  const defaultRate = await page.evaluate(() => window.__ttSamsaraBench.get().EMITTERS.THRUST_RATE)
  await new Promise((r) => setTimeout(r, 300))

  const bigBox = (o) => [o.x - 150, o.y - 150, o.x + 150, o.y + 150]
  const litAt = async (shot) => ({
    near: await litPixels(shot, bigBox(near)),
    far: await litPixels(shot, bigBox(far)),
  })

  await new Promise((r) => setTimeout(r, 600))
  const on1Shot = await page.screenshot()
  await sharp(on1Shot).toFile('samsarashots/emitters-thrust-on1.png')
  const on1 = await litAt(on1Shot)

  await page.evaluate((v) => window.__ttSamsaraBench.set('EMITTERS.THRUST_RATE', v), 0)
  await new Promise((r) => setTimeout(r, 1700))
  const offShot = await page.screenshot()
  await sharp(offShot).toFile('samsarashots/emitters-thrust-off.png')
  const off = await litAt(offShot)

  // Back on — recovering proves this is a running emission the toggle can
  // start again, not the first capture happening to catch a one-off puff.
  await page.evaluate((v) => window.__ttSamsaraBench.set('EMITTERS.THRUST_RATE', v), defaultRate)
  await new Promise((r) => setTimeout(r, 1700))
  const onShot2 = await page.screenshot()
  await sharp(onShot2).toFile('samsarashots/emitters-thrust-on2.png')
  const on2 = await litAt(onShot2)

  console.log(
    `near afterburner: on ${on1.near} -> off ${off.near} -> on ${on2.near}`,
    `\nfar afterburner:  on ${on1.far} -> off ${off.far} -> on ${on2.far}`,
  )

  const MARGIN = 150
  check(
    'the near orb sheds smoke — THRUST_RATE=0 measurably clears the box',
    on1.near > off.near + MARGIN,
    `on ${on1.near} vs off ${off.near}`,
  )
  check(
    'and it starts again — not a one-shot the first capture happened to catch',
    on2.near > off.near + MARGIN,
    `off ${off.near} vs on ${on2.near}`,
  )
  check(
    'the far orb sheds smoke — THRUST_RATE=0 measurably clears the box',
    on1.far > off.far + MARGIN,
    `on ${on1.far} vs off ${off.far}`,
  )
  check(
    'and it starts again — not a one-shot the first capture happened to catch',
    on2.far > off.far + MARGIN,
    `off ${off.far} vs on ${on2.far}`,
  )

  // ── press and hold the near orb ─────────────────────────────────────
  //
  // A REAL pointer, not a synthetic call into PokeController — onOrbDown/onOrbUp
  // are window-level pointerdown/pointerup listeners with a hit test
  // (SamsaraSequence.tsx), so this exercises the same path a visitor's mouse
  // does, HIT_SLOP included.
  const poke = () => page.evaluate(() => window.__ttHologram().poke)

  await page.mouse.move(near.x, near.y)
  await page.mouse.down()
  const early = await (async () => {
    await new Promise((r) => setTimeout(r, 200))
    return poke()
  })()
  check('holding builds the shake before it fires', early.phase === 'holding', JSON.stringify(early))
  check(
    'the shake is partway built, not instantly full',
    early.shake > 0 && early.shake < 0.95,
    `shake ${early.shake.toFixed(2)}`,
  )
  check('and the screen has not started flickering yet', early.dip === 0, `dip ${early.dip}`)

  // POKE.SHAKE_MS is 475ms by default; 200ms already spent above.
  await new Promise((r) => setTimeout(r, 350))
  let fired = await poke()
  /**
   * ⚠️ POLL for the condition, not a fixed delay past it — same rule
   * samsara-kill-switch.mjs's own header states. `dip()` free-runs its cycle
   * clock from zero the instant `fired` flips true, and the waveform is
   * legitimately zero at that exact frame; a single fixed-delay sample landed
   * on it once and reported a false "never dips".
   */
  {
    const t0 = Date.now()
    while ((fired.phase !== 'firing' || fired.dip === 0) && Date.now() - t0 < 1500) {
      await new Promise((r) => setTimeout(r, 40))
      fired = await poke()
    }
  }
  check('the hold fires the flicker once SHAKE_MS has passed', fired.phase === 'firing', JSON.stringify(fired))
  check('the shake is at (or pinned to) full amplitude', fired.shake >= 0.95, `shake ${fired.shake.toFixed(2)}`)
  check('and the screen is now dipping', fired.dip > 0, `dip ${fired.dip.toFixed(2)}`)

  await page.mouse.up()
  /**
   * POKE.RELEASE_MS is 420ms by default. `dip()`'s ENVELOPE decays linearly
   * over that window, but the waveform it multiplies is a flicker — "real
   * darkness roughly half the time" by design (orbPoke.ts) — so a SINGLE
   * instantaneous sample mid-release can legitimately land on one of the
   * waveform's own zero-crossings and read as "already cut" when it is not.
   * The first version of this check did exactly that.
   *
   * So: take the MAX over a short window right after release (the envelope is
   * still near its held value there) and the MAX over a window near the end of
   * RELEASE_MS (the envelope should have decayed toward zero) — an envelope
   * that is fading shows early > late; one that was cut dead shows near-zero
   * in BOTH windows.
   */
  const releaseTrack = []
  {
    const t0 = Date.now()
    while (Date.now() - t0 < 550) {
      releaseTrack.push({ t: Date.now() - t0, ...(await poke()) })
      await new Promise((r) => setTimeout(r, 30))
    }
  }
  const maxOver = (lo, hi, key) =>
    Math.max(0, ...releaseTrack.filter((s) => s.t >= lo && s.t < hi).map((s) => s[key]))
  const earlyShake = maxOver(0, 150, 'shake')
  const lateShake = maxOver(320, 500, 'shake')
  const earlyDip = maxOver(0, 150, 'dip')
  const lateDip = maxOver(320, 500, 'dip')
  check(
    'the shake decays rather than stopping dead on release',
    earlyShake > 0.15 && lateShake < earlyShake * 0.7,
    `shake envelope ${earlyShake.toFixed(2)} -> ${lateShake.toFixed(2)}`,
  )
  check(
    'and the dip FADES over RELEASE_MS rather than being cut at release',
    earlyDip > 0.05 && lateDip < earlyDip * 0.7,
    `dip envelope ${earlyDip.toFixed(2)} -> ${lateDip.toFixed(2)}`,
  )

  await new Promise((r) => setTimeout(r, 200))
  const settled = await poke()
  check('the shake and the flicker both settle back to idle', settled.phase === 'idle' && settled.shake === 0 && settled.dip === 0, JSON.stringify(settled))

  // ── negative: POKE.ENABLED=0 must leave the press completely inert ──
  //
  // Discriminating on purpose, per samsara-kill-switch.mjs's own argument: a
  // press-and-hold check that has never been PROVEN able to fail is not
  // evidence it tests the right thing.
  await page.evaluate(() => window.__ttSamsaraBench.set('POKE.ENABLED', false))
  await new Promise((r) => setTimeout(r, 150))
  await page.mouse.move(near.x, near.y)
  await page.mouse.down()
  await new Promise((r) => setTimeout(r, 700))
  const disabledMid = await poke()
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 100))
  const disabledEnd = await poke()
  check(
    '[POKE.ENABLED=0] a full-length hold never builds a shake',
    disabledMid.phase === 'idle' && disabledMid.shake === 0 && disabledMid.dip === 0,
    JSON.stringify(disabledMid),
  )
  check(
    '[POKE.ENABLED=0] and stays inert after release too',
    disabledEnd.phase === 'idle' && disabledEnd.shake === 0 && disabledEnd.dip === 0,
    JSON.stringify(disabledEnd),
  )
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nThe emitter orbs park, smoke continuously, and answer a press.')
process.exit(failures ? 1 : 0)
