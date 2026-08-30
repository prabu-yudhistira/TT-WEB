// Measures the video-to-mesh handoff size match at several viewport aspects.
//
// The video's last frame and the settled 3D mark should be the SAME on-screen
// size; any difference is the jump the owner reported. Ignition is switched off
// for the run so no cage sits on top of either measurement, and restored after.
//
// The video is paused on its final frame rather than caught in flight: the
// extrusion is still growing right up to the end, so a frame sampled "near" the
// end measures a logo that has not finished.
import puppeteer from './_puppeteer.mjs'
import { CHROME, ARGS, rawRGB, fresh } from './t9-lib.mjs'

const ORIGIN = 'http://localhost:3000'
const BASE = `${ORIGIN}/en`
const OUT = fresh('measure-handoff')

const VIEWPORTS = [
  { w: 1600, h: 900, note: 'exactly 16:9 — cover correction should be 1.00' },
  { w: 1920, h: 950, note: 'typical maximized desktop' },
  { w: 2560, h: 1080, note: 'ultrawide' },
]

const login = async () => {
  const r = await fetch(`${ORIGIN}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
  })
  if (!r.ok) throw new Error(`login failed ${r.status}`)
  return (await r.json()).token
}
const setIgnition = async (token, on) => {
  const r = await fetch(`${ORIGIN}/api/globals/hero-effects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ ignitionEnabled: on }),
  })
  if (!r.ok) throw new Error(`set ignition ${on} failed: ${r.status}`)
}

/** Vertical extent of dark ink, ignoring the page's corner text. */
function inkBBox(png, w, h) {
  const a = rawRGB(png, w, h)
  const x0 = Math.floor(w * 0.2)
  const x1 = Math.floor(w * 0.8)
  const y0 = Math.floor(h * 0.05)
  const y1 = Math.floor(h * 0.85)
  let top = Infinity
  let bot = -Infinity
  let left = Infinity
  let right = -Infinity
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]
      if (lum > 140) continue
      if (y < top) top = y
      if (y > bot) bot = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  if (!isFinite(top)) return null
  return { top, bot, left, right, height: bot - top, width: right - left, cy: (top + bot) / 2 }
}

const token = await login()
await setIgnition(token, false)
console.log('ignition temporarily OFF for measurement\n')

const rows = []
try {
  for (const vp of VIEWPORTS) {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })
    const page = await browser.newPage()
    await page.setViewport({ width: vp.w, height: vp.h })
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    // Park the video on its true final frame.
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video')
        return v && Number.isFinite(v.duration) && v.duration > 0
      },
      { timeout: 30000, polling: 50 },
    )
    // Let it PLAY to the final frame and pause there. Seeking a video that has
    // never decoded leaves the element transparent (there is no poster), so a
    // seek-then-screenshot measures blank paper, not the logo.
    const parked = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const v = document.querySelector('video')
          if (!v) return resolve('no video')
          const tick = () => {
            if (v.ended) return resolve('ended before we could pause')
            if (Number.isFinite(v.duration) && v.duration > 0 && v.currentTime >= v.duration - 0.15) {
              v.pause()
              return resolve(`paused at ${v.currentTime.toFixed(2)} / ${v.duration.toFixed(2)}`)
            }
            requestAnimationFrame(tick)
          }
          tick()
        }),
    )
    console.log(`    ${parked}`)
    await new Promise((r) => setTimeout(r, 400))

    const vPng = `${OUT}/${vp.w}x${vp.h}-video.png`
    await page.screenshot({ path: vPng })
    const videoBox = inkBBox(vPng, vp.w, vp.h)

    // Let the handoff happen, then settle.
    await page.evaluate(() => {
      const v = document.querySelector('video')
      v.play().catch(() => {})
    })
    await page.waitForFunction(() => document.querySelector('video')?.ended === true, {
      timeout: 20000,
      polling: 50,
    })
    await new Promise((r) => setTimeout(r, 3500))

    // The floating words and their strings are scattered around the mark and
    // would widen the mesh bbox and drag its centre. Hide them so the bbox is
    // the logo alone, which is what the video frame shows.
    await page.evaluate(() => {
      for (const d of document.querySelectorAll('div')) {
        if (d.style.fontStyle === 'italic' && d.style.whiteSpace === 'nowrap') d.style.display = 'none'
      }
      const canvases = [...document.querySelectorAll('canvas')]
      // the constellation's string canvas is the one with pointerEvents none
      for (const c of canvases) if (c.style.pointerEvents === 'none') c.style.display = 'none'
    })
    await new Promise((r) => setTimeout(r, 350))

    const mPng = `${OUT}/${vp.w}x${vp.h}-mesh.png`
    await page.screenshot({ path: mPng })
    const meshBox = inkBBox(mPng, vp.w, vp.h)
    await browser.close()

    const expectedCover = Math.max(1, vp.w / vp.h / (16 / 9))
    const ratio = videoBox && meshBox ? videoBox.height / meshBox.height : NaN
    rows.push({ vp, videoBox, meshBox, ratio, expectedCover })

    console.log(`--- ${vp.w}x${vp.h}  (${vp.note})`)
    console.log(`    video logo height: ${videoBox?.height}px   centre y ${videoBox?.cy}`)
    console.log(`    mesh  logo height: ${meshBox?.height}px   centre y ${meshBox?.cy}`)
    console.log(`    video/mesh ratio : ${ratio.toFixed(3)}   (cover factor ${expectedCover.toFixed(3)})`)
    console.log('')
  }
} finally {
  await setIgnition(token, true)
  console.log('ignition restored to ON')
}

console.log('\n=== summary ===')
let failed = 0
for (const r of rows) {
  const ok = Math.abs(r.ratio - 1) < 0.06
  if (!ok) failed++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${r.vp.w}x${r.vp.h}: video/mesh = ${r.ratio.toFixed(3)} (want ~1.00)`,
  )
}
process.exit(failed === 0 ? 0 : 1)
