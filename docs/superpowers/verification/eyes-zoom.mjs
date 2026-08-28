/**
 * Render ONE expression large and crop tight to the face.
 *
 * NOT an assertion — a TOOL, and it exists because of a real mistake: during
 * tuning the crescents were diagnosed as rendering "hollow rings", and the
 * shader's core shading was changed to fix it. At 715px they turned out to be
 * SOLID all along; the ring was an artifact of judging a ~100px face in a
 * contact-sheet thumbnail. The shading change was reverted.
 *
 * ZOOM BEFORE DIAGNOSING.
 *
 * Usage: node docs/superpowers/verification/eyes-zoom.mjs <expression> [sizePx]
 */
import puppeteer from 'puppeteer-core'

const NAME = process.argv[2] || 'neutral'
const SIZE = Number(process.argv[3] || 760)

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 1100 },
})
const page = await browser.newPage()
await page.goto(
  `http://localhost:3000/en/dev/mascot?ENTRANCE_MS=200&SPIN_SPEED=0&SPEED_SCALE=0&SIZE=${SIZE}` +
    '&BOB_PX=0&TRAIL_ENABLED=0&LABEL_ENABLED=0&RADIUS=0.1&HEIGHT=0&DEPTH_SCALE=0',
  { waitUntil: 'networkidle2', timeout: 60000 },
)
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3500))

// RADIUS 0.1 parks the mascot over the mark, and the logo paints on top of it.
for (const t of ['show logo', 'show satellites']) {
  await page.evaluate((x) => {
    const l = [...document.querySelectorAll('label')].find((n) => n.innerText.includes(x))
    const b = l?.querySelector('input[type=checkbox]')
    if (b && b.checked) b.click()
  }, t)
}
await new Promise((r) => setTimeout(r, 700))
await page.evaluate((n) => window.__ttMascotExpr(n), NAME)
await new Promise((r) => setTimeout(r, 600))

const s = await page.evaluate(() => window.__ttMascot())
const d = s.diameterPx ?? SIZE
const half = Math.round(d * 0.42)
const out = `zoom-${NAME}.png`
await page.screenshot({
  path: out,
  clip: {
    x: Math.max(0, Math.round(s.pos.x - half)),
    y: Math.max(0, Math.round(s.pos.y - half)),
    width: half * 2,
    height: half * 2,
  },
})
console.log(`${NAME}: body ${d.toFixed(0)}px -> ${out}`)
await browser.close()
