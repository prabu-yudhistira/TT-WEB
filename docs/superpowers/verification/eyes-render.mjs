/**
 * Every expression must RENDER, and all 91 pairs must be visually distinct.
 *
 * This is the guard against the display's documented silent failure: feeding a
 * quantized `position` to the object-space mask makes every fragment fail, the
 * shader compiles clean, nothing throws, and the mascot simply shows its
 * PAINTED eyes as if the feature were absent. "No console errors" proves
 * nothing here — only pixels do.
 *
 * Run: node docs/superpowers/verification/eyes-render.mjs
 * Requires: npm run dev on :3000
 */
import puppeteer from './_puppeteer.mjs'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')
import { mkdirSync } from 'node:fs'

const OUT = (process.env.TT_SHOTS ?? 'eyeshots') + '/'
mkdirSync(OUT, { recursive: true })

// ⚠️ BOB_PX=0 is load-bearing, not cosmetic. With the default bob the body
// drifts vertically between screenshots and every pixel difference measures
// THAT rather than the eyes — it once produced a near-uniform 44-62 across
// every expression, i.e. three assertions passing for the wrong reason.
const URL =
  'http://localhost:3000/en/dev/mascot?ENTRANCE_MS=200&SPIN_SPEED=0&SPEED_SCALE=0' +
  '&SIZE=340&BOB_PX=0&TRAIL_ENABLED=0&LABEL_ENABLED=0'

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 4000))

const s = await page.evaluate(() => window.__ttMascot())
const half = 130
const clip = {
  x: Math.max(0, Math.round(s.pos.x - half)),
  y: Math.max(0, Math.round(s.pos.y - half)),
  width: half * 2,
  height: half * 2,
}

const names = await page.evaluate(() => window.__ttMascotExpr('neutral'))
const shots = []
for (const name of names) {
  await page.evaluate((n) => window.__ttMascotExpr(n), name)
  await new Promise((r) => setTimeout(r, 350))
  const file = `${OUT}${name}.png`
  await page.screenshot({ path: file, clip })
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
  // Lit amber pixels: clearly red>green>blue and bright. The PAINTED eyes are
  // dark amber in shadow; the lit display is far brighter.
  let lit = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 150 && data[i] > data[i + 2] + 45 && data[i + 1] > data[i + 2] + 15) lit++
  }
  shots.push({ name, lit, data, info, file })
  console.log(`  ${name.padEnd(15)} lit px = ${lit}`)
}

const dist = (a, b) => {
  let d = 0
  for (let i = 0; i < a.data.length; i += a.info.channels) {
    d += Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2])
  }
  return d / (a.data.length / a.info.channels) / 3
}

// Contact sheet — single screenshots have hidden real defects on this project
// more than once.
const cols = 4
const TH = 260
const tiles = []
for (let i = 0; i < shots.length; i++) {
  tiles.push({
    input: await sharp(shots[i].file).resize(TH, TH).toBuffer(),
    left: (i % cols) * TH,
    top: Math.floor(i / cols) * TH,
  })
}
await sharp({
  create: { width: cols * TH, height: Math.ceil(shots.length / cols) * TH, channels: 3, background: '#222' },
}).composite(tiles).png().toFile(`${OUT}sheet.png`)

await browser.close()

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

check('14 expressions registered', shots.length === 14, `got ${shots.length}`)

// 1. The display draws at all.
const dark = shots.filter((x) => x.lit < 40)
check('every expression is lit', dark.length === 0, dark.map((x) => x.name).join(', '))

// 2. Every expression differs from neutral.
const neutral = shots.find((x) => x.name === 'neutral')
const flat = shots.filter((x) => x.name !== 'neutral' && dist(neutral, x) < 1)
check('all differ from neutral', flat.length === 0, flat.map((x) => x.name).join(', '))

// 3. No two expressions are the same picture.
const collisions = []
for (let i = 0; i < shots.length; i++) {
  for (let j = i + 1; j < shots.length; j++) {
    if (dist(shots[i], shots[j]) < 1) collisions.push(`${shots[i].name}=${shots[j].name}`)
  }
}
check('all pairs distinct', collisions.length === 0, collisions.join(', '))

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`\nsheet: ${OUT}sheet.png`)
console.log(failures ? `\n${failures} check(s) failed.` : '\nEye render checks passed.')
process.exit(failures ? 1 : 0)
