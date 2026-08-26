// Clicking "Replay intro" remounts the hero, which rebuilds a WebGL context.
// Browsers cap live contexts at ~16 and this project has shipped
// FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS once already (fixed in 9190364), so
// repeated replays must not accumulate contexts.
import puppeteer from 'puppeteer-core'
import { CHROME, ARGS, report } from './t9-lib.mjs'

const BASE = process.env.TT_URL_ORIGIN || 'http://localhost:3000'
const CLICKS = 25

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })
const page = await browser.newPage()
await page.setViewport({ width: 1000, height: 700 })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e.message)))

await page.goto(`${BASE}/en/admin-preview/hero?source=hero-effects`, {
  waitUntil: 'domcontentloaded',
})
await page.waitForSelector('canvas', { timeout: 20000 })

for (let i = 0; i < CLICKS; i++) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /replay/i.test(x.textContent || ''),
    )
    b?.click()
  })
  await new Promise((r) => setTimeout(r, 350))
}
await new Promise((r) => setTimeout(r, 2500))

// The canvas must still hold a LIVE context after all those rebuilds.
const alive = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return { hasCanvas: false, live: false }
  let gl = null
  try {
    gl = c.getContext('webgl2') || c.getContext('webgl')
  } catch {
    return { hasCanvas: true, live: false }
  }
  return { hasCanvas: true, live: !!gl && !gl.isContextLost() }
})

const exhausted = errors.filter((e) =>
  /EXHAUSTED|context lost|Too many active WebGL|CONTEXT_LOST/i.test(e),
)

console.log(`after ${CLICKS} replays:`, JSON.stringify(alive), '| errors:', errors.length)

const checks = [
  ['the canvas survives repeated replays', alive.hasCanvas === true],
  ['its WebGL context is still live', alive.live === true],
  ['no context-exhaustion errors', exhausted.length === 0, exhausted.slice(0, 2).join(' | ')],
]

const failed = report(checks)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
