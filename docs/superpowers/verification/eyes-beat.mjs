/**
 * The beat: one expression per orbit pass, resolving back to neutral, plus the
 * press-and-hold reaction.
 *
 * The engine does not publish its eye uniforms, so the face is sampled through
 * rendered pixels: a run of frames is captured while the mascot spins normally
 * and each frame is scored for lit area. Neutral is the widest resting shape,
 * so the beat shows up as variation in that trace rather than a flat line.
 *
 * Run: node docs/superpowers/verification/eyes-beat.mjs
 * Requires: npm run dev on :3000
 */
import puppeteer from './_puppeteer.mjs'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

let failures = 0
const check = (label, ok, detail) => {
  console.log((ok ? 'ok    ' : 'FAIL  ') + label + (detail ? '   ' + detail : ''))
  if (!ok) failures++
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// Parked in place and enlarged, but the SPIN still runs: the beat is driven by
// cos(spin) crossing the facing threshold, so freezing the spin would freeze
// the beat along with it. BOB_PX 0 so the body does not drift between frames.
await page.goto(
  'http://localhost:3000/en/dev/mascot?ENTRANCE_MS=200&SPEED_SCALE=0&SIZE=340&BOB_PX=0&TRAIL_ENABLED=0&LABEL_ENABLED=0&DEPTH_SCALE=0',
  { waitUntil: 'networkidle2', timeout: 60000 },
)
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3000))
// Make sure nothing is pinned from a previous script in the same browser.
await page.evaluate(() => window.__ttMascotExpr(null))
// The logo stays VISIBLE and interactive on purpose: it is what the
// press-and-hold gesture acts on, and the mascot reads its separation charge
// through chargeRef. Hiding it made the gesture a no-op and the hold assertion
// compared two frames of an ordinary glance instead.
await new Promise((r) => setTimeout(r, 800))

const s0 = await page.evaluate(() => window.__ttMascot())
const half = 120
const clip = {
  x: Math.max(0, Math.round(s0.pos.x - half)),
  y: Math.max(0, Math.round(s0.pos.y - half)),
  width: half * 2,
  height: half * 2,
}

const litOf = async () => {
  const buf = await page.screenshot({ clip })
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let lit = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 150 && data[i] > data[i + 2] + 45) lit++
  }
  return lit
}

// One revolution is 3.2s at SPIN_SPEED 113, so ~8s covers several passes.
const trace = []
for (let i = 0; i < 40; i++) {
  const facing = await page.evaluate(() => Math.cos(window.__ttMascot().spin))
  trace.push({ facing, lit: facing > 0.3 ? await litOf() : null })
  await new Promise((r) => setTimeout(r, 200))
}

const facingFrames = trace.filter((t) => t.lit !== null)
check('face turned toward the viewer during the run', facingFrames.length > 3, facingFrames.length + ' frames')

const lits = facingFrames.map((t) => t.lit)
const spread = Math.max(...lits) - Math.min(...lits)
// A dead beat would hold one shape and produce a near-flat trace.
check('the face changes shape while facing', spread > 300, 'lit spread ' + spread)

// Press-and-hold: eyes widen, then squeeze shut at the peak.
//
// Press the CENTRE of the viewport, which is where the mark sits. Targeting
// page.$('canvas') picks the first canvas in the DOM — a satellite layer with
// pointer-events:none — so the gesture never reached the logo at all.
// ⚠️ Sample the PEAK lit area over a window while the face is toward the
// viewer — never a single instant.
//
// This check used to take one instantaneous litOf() for mid and one for late.
// SAMSARA spins at 113 deg/s and its face points at the viewer only ~25% of
// each turn, so whether a sample caught the face or the back of the head
// dominated the reading: measured, the check failed roughly 1 run in 3 on
// UNCHANGED code, reporting "lit 5285 -> 5473" purely from spin phase. That is
// the same background-not-subject error that made the mascot kill-switch check
// wrong three times.
//
// The rest of this file already gates on facing > 0.3. This now does too, and
// takes the max over a window so both readings describe the same thing: the
// eyes at their most visible.
// Sample the first frame that satisfies BOTH a charge band and facing.
//
// Two independent variables had to be pinned, and missing either made this
// check fail ~1 run in 3 on UNCHANGED code:
//
//  1. CHARGE. During a hold the eyes are a deterministic function of charge —
//     neutral->wide below CHARGE_CROSSOVER, wide->blink above it. Charge
//     saturates in ~950ms, so two fixed delays can easily BOTH land at 1.00,
//     comparing a state against itself and deciding on pixel noise. Every
//     observed failure reported "charge 1.00".
//  2. FACING. SAMSARA spins at 113 deg/s and shows its face ~25% of each turn,
//     so an instantaneous sample may be reading the back of its head.
//
// Waiting for an explicit band fixes (1); the facing gate fixes (2). Sampling
// the FIRST qualifying frame rather than a max over a window matters too — a
// window wide enough to guarantee a face pass also spans the charge ramp, which
// reintroduces exactly the ambiguity being removed.
const sample = () =>
  page.evaluate(() => ({
    charge: window.__ttMascot().charge,
    facing: Math.cos(window.__ttMascot().spin),
  }))

// ⚠️ The low-charge frame has to be RE-CREATED, not waited for.
//
// Charge ramps 0 -> 1 in ~950ms and then stays pinned at 1 for as long as the
// button is down, so the 0.25–0.7 band exists for roughly 430ms and never
// recurs. Facing cycles on a 3.2s period. Simply polling for both conditions
// catches them together about a quarter of the time and then waits forever —
// measured, that failed 5 runs out of 5.
//
// So release and re-press until the ramp lands on a face-on frame. Each attempt
// is a fresh ramp, which turns a one-shot coincidence into a retry.
let mid = { lit: 0, charge: -1, ok: false }
for (let attempt = 0; attempt < 10 && !mid.ok; attempt++) {
  await page.mouse.move(640, 400)
  await page.mouse.down()
  const t0 = Date.now()
  while (Date.now() - t0 < 1200) {
    const s = await sample()
    if (s.charge >= 0.25 && s.charge <= 0.7 && s.facing > 0.3) {
      mid = { lit: await litOf(), charge: s.charge, ok: true }
      break
    }
    if (s.charge > 0.7) break // ramp missed this pass
    await new Promise((r) => setTimeout(r, 40))
  }
  if (!mid.ok) {
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 500)) // let the charge decay
  }
}

// Still holding from the successful attempt. Saturate, then wait for the face.
let late = { lit: 0, charge: -1, ok: false }
if (mid.ok) {
  const t1 = Date.now()
  while (Date.now() - t1 < 6000) {
    const s = await sample()
    if (s.charge >= 0.95 && s.facing > 0.3) {
      late = { lit: await litOf(), charge: s.charge, ok: true }
      break
    }
    await new Promise((r) => setTimeout(r, 60))
  }
}
await page.mouse.up()

const midCharge = mid.charge
const lateCharge = late.charge
const midHold = mid.lit
const lateHold = late.lit

check('caught a low-charge and a high-charge frame, both face-on',
  mid.ok && late.ok, 'mid ' + midCharge.toFixed(2) + ', late ' + lateCharge.toFixed(2))

// Assert the GESTURE first. Without this a dead press produces a confusing
// pixel comparison rather than naming its own cause.
check('the hold gesture reaches the mascot', lateCharge > 0.7,
  'charge ' + midCharge.toFixed(2) + ' -> ' + lateCharge.toFixed(2))
check('hold squeezes the eyes shut at the peak', lateHold < midHold,
  'lit ' + midHold + ' -> ' + lateHold + ' at charge ' + lateCharge.toFixed(2))
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? failures + ' check(s) failed.' : 'Eye beat checks passed.')
process.exit(failures ? 1 : 0)
