/**
 * Regression guard for Task 7: proves the SAMSARA mode surface added to
 * MascotEngine is genuinely ADDITIVE and the shipped orbit is unchanged.
 *
 * Written and baselined BEFORE the engine is edited. That ordering is the whole
 * point — a guard captured after the change proves nothing.
 *
 * ⚠️ Keyed on ANGLE, not on time. The orbit advances by real elapsed dt, so two
 * runs never line up frame-for-frame and a time-indexed trace would report
 * differences that are only scheduling jitter. But the mapping angle -> screen
 * position is a pure function of the projection, so bucketing samples by angle
 * gives a comparison that is stable across runs and still catches any real
 * change to where the mascot is placed.
 *
 * ⚠️ Must run against real headless Chrome. The in-app browser pane reports the
 * tab hidden and throttles rAF to ~1Hz, which stalls the engine's own clock —
 * 13 frames in 13 real seconds, measured.
 *
 *   node docs/superpowers/verification/samsara-orbit-unchanged.mjs --write-baseline
 *   node docs/superpowers/verification/samsara-orbit-unchanged.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
// fileURLToPath, not .pathname: this repo lives under "TAMPA TARUNO" and a
// file:// pathname percent-encodes the space, producing a path fs cannot open.
import { fileURLToPath } from 'node:url'

const SCRATCH =
  process.env.TT_SCRATCH ??
  'C:/Users/YUDHISTIRA/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/d0ca22db-692e-419a-99b2-f64c186473d0/scratchpad'
const puppeteer = createRequire(`file:///${SCRATCH.replace(/\\/g, '/')}/package.json`)('puppeteer-core')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// NOTE: not named URL — that shadows the global URL constructor used just below.
const PAGE_URL = process.env.TT_URL ?? 'http://localhost:3000/en'
const BASELINE = fileURLToPath(new URL('./samsara-orbit-baseline.json', import.meta.url))
const WRITE = process.argv.includes('--write-baseline')

const BUCKETS = 72 // 5 degrees each
const SAMPLE_MS = 9000
const TOL_PX = 0.75

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 90000 })

await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 90000 })

// Sample inside the page, driven by rAF, so we get every frame rather than one
// per round trip.
const samples = await page.evaluate(
  (ms) =>
    new Promise((resolve) => {
      const out = []
      const t0 = performance.now()
      const tick = () => {
        const m = window.__ttMascot()
        if (m && m.pos && Number.isFinite(m.pos.x)) {
          out.push({
            angle: m.angle,
            x: m.pos.x,
            y: m.pos.y,
            d: m.diameterPx,
            behind: !!m.behind,
          })
        }
        if (performance.now() - t0 < ms) requestAnimationFrame(tick)
        else resolve(out)
      }
      requestAnimationFrame(tick)
    }),
  SAMPLE_MS,
)

await browser.close()

if (samples.length < 200) {
  console.error(`FAIL  only ${samples.length} frames captured — the clock is being throttled.`)
  console.error('      This must run in real headless Chrome, not the in-app browser pane.')
  process.exit(1)
}

// ⚠️ INTERPOLATE at exact target angles. Do NOT average within angle buckets.
//
// Bucket-averaging was tried first and was too noisy to be a guard: it reported
// 3.665px of drift against completely UNCHANGED code. The cause is not the
// engine — 5° of a 511px-radius orbit is ~45px of arc travel, and with ~14
// samples per bucket the bucket mean depends on where in that arc the frames
// happened to land. Expected error ~ arc/(2*sqrt(n)) ~ 6px, which brackets what
// was measured.
//
// Interpolating between the two samples that bracket each target angle removes
// that error entirely, because the angle -> position mapping is smooth.
const TAU = Math.PI * 2
const norm = (a) => ((a % TAU) + TAU) % TAU

// Every crossing of every target angle, interpolated, then averaged. Averaging
// AFTER interpolation is noise-free: each crossing already lands on the exact
// target angle.
const targets = Array.from({ length: BUCKETS }, (_, i) => (i * TAU) / BUCKETS)
const hits = Array.from({ length: BUCKETS }, () => [])

for (let i = 1; i < samples.length; i++) {
  const a0 = norm(samples[i - 1].angle)
  const a1 = norm(samples[i].angle)
  // Skip the wrap frame rather than trying to interpolate across it.
  if (Math.abs(a1 - a0) > Math.PI) continue
  const lo = Math.min(a0, a1)
  const hi = Math.max(a0, a1)
  for (let k = 0; k < BUCKETS; k++) {
    const t = targets[k]
    if (t < lo || t > hi || hi - lo < 1e-9) continue
    const f = (t - a0) / (a1 - a0)
    const s0 = samples[i - 1]
    const s1 = samples[i]
    hits[k].push({
      x: s0.x + (s1.x - s0.x) * f,
      y: s0.y + (s1.y - s0.y) * f,
      d: s0.d + (s1.d - s0.d) * f,
      behind: f < 0.5 ? s0.behind : s1.behind,
    })
  }
}

const trace = hits.map((h) => {
  if (h.length === 0) return null
  const n = h.length
  return {
    x: h.reduce((a, b) => a + b.x, 0) / n,
    y: h.reduce((a, b) => a + b.y, 0) / n,
    d: h.reduce((a, b) => a + b.d, 0) / n,
    behind: h.filter((b) => b.behind).length / n > 0.5,
    n,
  }
})
const covered = trace.filter(Boolean).length

if (WRITE) {
  writeFileSync(BASELINE, JSON.stringify({ BUCKETS, covered, trace }, null, 2))
  console.log(`baseline written: ${covered}/${BUCKETS} angle buckets from ${samples.length} frames`)
  console.log(`  -> ${BASELINE}`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error(`FAIL  no baseline at ${BASELINE}. Run with --write-baseline BEFORE editing the engine.`)
  process.exit(1)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
let failures = 0
const check = (label, cond) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

check(`orbit coverage held (${covered} vs ${base.covered} buckets)`, covered >= base.covered - 2)

let worstXY = 0
let worstD = 0
let behindMismatches = 0
let compared = 0
for (let i = 0; i < BUCKETS; i++) {
  const a = base.trace[i]
  const b = trace[i]
  if (!a || !b) continue
  compared++
  worstXY = Math.max(worstXY, Math.hypot(a.x - b.x, a.y - b.y))
  worstD = Math.max(worstD, Math.abs(a.d - b.d))
  if (a.behind !== b.behind) behindMismatches++
}

check(`enough buckets compared (${compared})`, compared >= BUCKETS * 0.8)
check(`orbit position unchanged (worst ${worstXY.toFixed(3)}px <= ${TOL_PX})`, worstXY <= TOL_PX)
check(`on-screen size unchanged (worst ${worstD.toFixed(3)}px <= ${TOL_PX})`, worstD <= TOL_PX)
check(`depth sorting unchanged (${behindMismatches} bucket mismatches)`, behindMismatches === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nOrbit is unchanged.')
process.exit(failures ? 1 : 0)
