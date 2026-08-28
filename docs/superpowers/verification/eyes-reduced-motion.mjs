/**
 * Under prefers-reduced-motion the mascot renders a single static frame. The
 * eyes must be present and NEUTRAL in it — not blank, and not frozen
 * mid-glance. This site honours the preference in 19 places; a visitor who
 * asked for stillness must not get a blinking face.
 *
 * An earlier effect on this project shipped a "static frame" that was very
 * nearly empty, so non-emptiness is asserted explicitly rather than assumed.
 *
 * Run: node docs/superpowers/verification/eyes-reduced-motion.mjs
 */
import puppeteer from 'puppeteer-core'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await page.goto(
  'http://localhost:3000/en/dev/mascot?ENTRANCE_MS=0&SIZE=340&DEPTH_SCALE=0&TRAIL_ENABLED=0&LABEL_ENABLED=0',
  { waitUntil: 'networkidle2', timeout: 60000 },
)
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3000))
await page.evaluate(() => {
  const l = [...document.querySelectorAll('label')].find((n) => n.innerText.includes('show logo'))
  const b = l?.querySelector('input[type=checkbox]')
  if (b && b.checked) b.click()
})
await new Promise((r) => setTimeout(r, 800))

const s = await page.evaluate(() => window.__ttMascot())
const half = 120
const clip = {
  x: Math.max(0, Math.round(s.pos.x - half)),
  y: Math.max(0, Math.round(s.pos.y - half)),
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

const a = await litOf()
// A fixed wait is CORRECT here, unlike everywhere else in this harness: the
// assertion is that nothing ever happens, and only elapsed time can support it.
await new Promise((r) => setTimeout(r, 2500))
const b = await litOf()
const spin = await page.evaluate(() => window.__ttMascot().spin)

check('static frame is not blank', a > 200, a + ' lit px')
check('frame does not change over 2.5s', Math.abs(a - b) < 30, a + ' -> ' + b)
check('spin is not advancing', spin === 0, 'spin ' + spin)

await browser.close()
console.log(failures ? failures + ' check(s) failed.' : 'Eye reduced-motion checks passed.')
process.exit(failures ? 1 : 0)
