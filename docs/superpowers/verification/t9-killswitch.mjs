// Verifies the CMS kill switch actually disables the ignition, on the real hero.
//
// The bug this guards: SketchIntro signals near-end UNCONDITIONALLY (a skipped
// or failed video must still let the cage come up), so gating only the lead
// time left `overlay` going true regardless of config. With ignition disabled
// nothing patches the skin, so raising the canvas above the still-playing video
// popped the solid logo over the last second of the sketch — strictly worse
// than the plain crossfade the switch promises to restore.
//
// The signature is DOM-observable and needs no pixels: LogoStage's canvas
// wrapper goes to zIndex 3 when, and only when, `overlay` is true.
//
// Runs BOTH polarities, so the probe is proven to be able to see the thing it
// claims is absent: with ignition ON the wrapper must rise before video end,
// with it OFF it must not.
import puppeteer from './_puppeteer.mjs'
import { CHROME, ARGS, BASE } from './t9-lib.mjs'

const ORIGIN = new URL(BASE).origin
const EMAIL = 'admin@tampa-taruno.local'
const PASSWORD = 'tampataruno-2026'

const login = async () => {
  const res = await fetch(`${ORIGIN}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  const { token } = await res.json()
  if (!token) throw new Error('login returned no token')
  return token
}

const setEnabled = async (token, value) => {
  const res = await fetch(`${ORIGIN}/api/globals/hero-effects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ ignitionEnabled: value }),
  })
  if (!res.ok) throw new Error(`update failed: ${res.status} ${await res.text()}`)
  const check = await (await fetch(`${ORIGIN}/api/globals/hero-effects`)).json()
  if (check.ignitionEnabled !== value) {
    throw new Error(`readback mismatch: wanted ${value}, got ${check.ignitionEnabled}`)
  }
  // Sanity: a partial write must not null sibling groups.
  if (!check.ignitionTiming || typeof check.ignitionTiming.ignitionMs !== 'number') {
    throw new Error('partial update wiped ignitionTiming — sibling groups did not survive')
  }
  return check
}

/**
 * Watches the canvas wrapper's z-index for the whole of the video, and reports
 * whether it ever rose above the video before playback ended.
 */
const observe = async (label) => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })
  const page = await browser.newPage()
  await page.setViewport({ width: 900, height: 700 })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const findWrapper = () => {
          const c = document.querySelector('canvas')
          return c ? c.closest('div[style*="z-index"]') || c.parentElement : null
        }
        const out = { raisedBeforeEnd: false, raisedAt: null, endedAt: null, maxZ: 0, sawVideo: false }
        const t0 = performance.now()
        const tick = () => {
          const v = document.querySelector('video')
          const w = findWrapper()
          if (v) out.sawVideo = true
          if (w) {
            const z = parseInt(getComputedStyle(w).zIndex || '0', 10) || 0
            if (z > out.maxZ) out.maxZ = z
            if (z >= 3 && out.raisedAt === null) {
              out.raisedAt = performance.now() - t0
              if (v && !v.ended) out.raisedBeforeEnd = true
            }
          }
          if (v && v.ended && out.endedAt === null) out.endedAt = performance.now() - t0
          if (out.endedAt !== null && performance.now() - t0 > out.endedAt + 800) return resolve(out)
          if (performance.now() - t0 > 40000) return resolve(out)
          requestAnimationFrame(tick)
        }
        tick()
      }),
  )
  await browser.close()
  return { label, ...result, errors }
}

let token
let restored = false
try {
  token = await login()
  console.log('logged in')

  // --- polarity A: ignition ON (the shipped default) ---
  await setEnabled(token, true)
  const on = await observe('ignition ON')
  console.log('ON :', JSON.stringify(on))

  // --- polarity B: ignition OFF (the kill switch) ---
  await setEnabled(token, false)
  const off = await observe('ignition OFF')
  console.log('OFF:', JSON.stringify(off))

  await setEnabled(token, true)
  restored = true
  console.log('restored ignitionEnabled = true')

  const checks = [
    ['probe works: with ignition ON the canvas rises over the video', on.raisedBeforeEnd, `raised at ${Math.round(on.raisedAt ?? -1)}ms, video ended ${Math.round(on.endedAt ?? -1)}ms`],
    ['kill switch works: with ignition OFF it never does', !off.raisedBeforeEnd, `maxZ ${off.maxZ}, raisedAt ${off.raisedAt === null ? 'never' : Math.round(off.raisedAt)}`],
    ['both runs actually had a video to observe', on.sawVideo && off.sawVideo],
    ['no console errors either way', on.errors.length === 0 && off.errors.length === 0, [...on.errors, ...off.errors].slice(0, 3).join(' | ')],
  ]
  let failed = 0
  for (const [label, ok, detail] of checks) {
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  }
  console.log(failed === 0 ? '\nAll assertions passed.' : `\n${failed} assertion(s) FAILED.`)
  process.exit(failed === 0 ? 0 : 1)
} catch (err) {
  console.error('ERROR:', err.message)
  process.exit(1)
} finally {
  // Never leave the owner's CMS on the test value.
  if (token && !restored) {
    try {
      await setEnabled(token, true)
      console.log('restored ignitionEnabled = true (via finally)')
    } catch (e) {
      console.error('!! COULD NOT RESTORE ignitionEnabled — set it back in /admin:', e.message)
    }
  }
}
