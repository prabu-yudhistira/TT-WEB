// Fair visual comparison of the handoff: the video's final frame against the
// mesh while it is still FRONTAL.
//
// Rotation about Y does not change the mark's height, so the numeric size
// measurement is valid at any spin angle — but a screenshot taken seconds later
// catches the mark edge-on and reads as a mismatch to the eye. resetPose()
// zeroes the spin at the handoff and the idle rotation only resumes ~1.2s
// later, so this samples inside that window.
import puppeteer from './_puppeteer.mjs'
import { CHROME, ARGS, fresh } from './t9-lib.mjs'

const ORIGIN = 'http://localhost:3000'
const OUT = fresh('handoff-frontal')
const W = Number(process.argv[2] || 2560)
const H = Number(process.argv[3] || 1080)

const login = async () => {
  const r = await fetch(`${ORIGIN}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
  })
  return (await r.json()).token
}
const setIgnition = async (token, on) => {
  await fetch(`${ORIGIN}/api/globals/hero-effects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ ignitionEnabled: on }),
  })
}

const token = await login()
await setIgnition(token, false)
try {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H })
  await page.goto(`${ORIGIN}/en`, { waitUntil: 'domcontentloaded' })

  await page.waitForFunction(
    () => {
      const v = document.querySelector('video')
      return v && Number.isFinite(v.duration) && v.duration > 0
    },
    { timeout: 30000, polling: 50 },
  )
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const v = document.querySelector('video')
        const tick = () => {
          if (v.ended) return resolve()
          if (v.currentTime >= v.duration - 0.15) {
            v.pause()
            return resolve()
          }
          requestAnimationFrame(tick)
        }
        tick()
      }),
  )
  await new Promise((r) => setTimeout(r, 400))
  await page.screenshot({ path: `${OUT}/video.png` })

  await page.evaluate(() => document.querySelector('video').play())
  await page.waitForFunction(() => document.querySelector('video')?.ended === true, {
    timeout: 20000,
    polling: 30,
  })
  // Inside the frontal window: canvas crossfade is 0.4s, idle spin resumes ~1.2s.
  await new Promise((r) => setTimeout(r, 900))
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('div')) {
      if (d.style.fontStyle === 'italic' && d.style.whiteSpace === 'nowrap') d.style.display = 'none'
    }
    for (const c of document.querySelectorAll('canvas')) {
      if (c.style.pointerEvents === 'none') c.style.display = 'none'
    }
  })
  await page.screenshot({ path: `${OUT}/mesh.png` })
  await browser.close()
  console.log(`captured ${OUT}/video.png and ${OUT}/mesh.png at ${W}x${H}`)
} finally {
  await setIgnition(token, true)
  console.log('ignition restored to ON')
}
