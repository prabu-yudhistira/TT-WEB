// Two assertions screenshots cannot make:
//   1. the orbit really turns counter-clockwise on screen
//   2. press-and-hold on the mark stops the orbit and starts a shake, driven
//      by the REAL LogoEngine separation charge (not a re-implementation)
//
// Direction is measured by the sign of the 2D cross product of consecutive
// position vectors about the orbit centre. Canvas Y grows downward, so a
// NEGATIVE cross is counter-clockwise as the viewer sees it. Getting this
// backwards by eye through a tilted perspective projection is easy — this
// project's own first pass at the CCW default was verified this way rather
// than by watching a screenshot, deliberately.

import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.TT_URL ?? 'http://localhost:3000/en/dev/satellites'
const SHOTS = process.env.TT_SHOTS ?? 'shots'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.setViewport({ width: 1600, height: 900 })
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 8000))

const snap = () => page.evaluate(() => window.__ttSatellites?.() ?? null)

// ── 1. direction ────────────────────────────────────────────────────
const a = await snap()
await new Promise((r) => setTimeout(r, 260))
const b = await snap()

let crossSum = 0
let counted = 0
for (let i = 0; i < a.sats.length; i++) {
  const p = a.sats[i]
  const q = b.sats[i]
  if (!Number.isFinite(p.x) || !Number.isFinite(q.x)) continue
  const ax = p.x - a.cx
  const ay = p.y - a.cy
  const bx = q.x - b.cx
  const by = q.y - b.cy
  crossSum += ax * by - ay * bx
  counted++
}
const direction = crossSum < 0 ? 'counter-clockwise' : 'clockwise'

// ── 2. hold: freeze + shake ─────────────────────────────────────────
// Press on the mark's centre. calibration puts it at CENTER_X=0.5 of the
// viewport, slightly below the vertical middle.
const box = await page.evaluate(() => {
  const s = window.__ttSatellites()
  return { x: s.cx, y: s.cy }
})

await page.mouse.move(box.x, box.y)
await page.mouse.down()
await new Promise((r) => setTimeout(r, 1400)) // past CHARGE_MS (950)

const chargeNow = (await snap()).charge
const h1 = await snap()
await new Promise((r) => setTimeout(r, 400))
const h2 = await snap()

// While held the satellites should jitter about a fixed point, not travel.
// Compare mean displacement while held against mean displacement while free.
const meanDisp = (s1, s2) => {
  let sum = 0
  let n = 0
  for (let i = 0; i < s1.sats.length; i++) {
    const p = s1.sats[i]
    const q = s2.sats[i]
    if (!Number.isFinite(p.x) || !Number.isFinite(q.x)) continue
    sum += Math.hypot(q.x - p.x, q.y - p.y)
    n++
  }
  return n ? sum / n : 0
}
const heldDisp = meanDisp(h1, h2)

await page.mouse.up()
await new Promise((r) => setTimeout(r, 1500)) // let reform finish
const f1 = await snap()
await new Promise((r) => setTimeout(r, 400))
const f2 = await snap()
const freeDisp = meanDisp(f1, f2)

await page.screenshot({ path: `${SHOTS}/hold-released.png` }).catch(() => {})
await browser.close()

const report = {
  direction,
  crossSum: Math.round(crossSum),
  satsCounted: counted,
  chargeWhileHeld: Number(chargeNow.toFixed(3)),
  meanTravelHeld_px: Number(heldDisp.toFixed(2)),
  meanTravelFree_px: Number(freeDisp.toFixed(2)),
  errors,
}
console.log(JSON.stringify(report, null, 2))

let failures = 0
const check = (label, cond) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

check('at least one satellite tracked', counted > 0)
check('orbit runs counter-clockwise (ORBIT_DIR default)', direction === 'counter-clockwise')
check('charge reaches ~1.0 through the real LogoEngine', chargeNow > 0.95)
check('held travel is well below free travel (frozen)', heldDisp < freeDisp * 0.5)
check('held travel is non-zero (shaking, not motionless)', heldDisp > 0.5)
check('zero console errors', errors.length === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nOrbit direction and hold coupling verified.')
process.exit(failures ? 1 : 0)
