/**
 * mascotEyesEnabled OFF must restore the mascot's ORIGINAL PAINTED EYES —
 * not merely blank the display. A switch that leaves the socket darkening
 * compiled in would cover the painted ovals and leave the face a black disc,
 * which is WORSE than the state the switch promises to restore. This bug class
 * (a switch that half-disables) has shipped THREE times on this project.
 *
 * ⚠️ Probes the real HOMEPAGE, never /dev/mascot. The bench holds its eye
 * config in local React state seeded from DEFAULT_MASCOT_EYES, so the CMS value
 * does not reach it and a bench-based test passes identically in both
 * polarities — which is exactly how the first version of this script failed.
 *
 * The mascot orbits and spins, so a live frame proves nothing: its face is
 * toward the viewer only about a quarter of each turn, and the background
 * behind it changes as it passes the mark. Both samples are taken under
 * prefers-reduced-motion, which pins it to one deterministic static frame —
 * see the note on sample() below.
 *
 * Run: node docs/superpowers/verification/eyes-kill-switch.mjs
 * Requires: npm run dev on :3000
 */
import puppeteer from './_puppeteer.mjs'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

const BASE = 'http://localhost:3000'
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

const token = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
})
  .then((r) => r.json())
  .then((j) => j.token)
if (!token) throw new Error('login failed — is the dev server up and seeded?')

const setEnabled = (v) =>
  fetch(`${BASE}/api/globals/hero-effects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ mascotEyesEnabled: v }),
  }).then((r) => r.json())

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  // 1x deliberately. deviceScaleFactor 3 was tried to oversample the small
  // frozen frame and moved the crop off the mascot entirely (mean luma 233.7 =
  // bare paper), so it measured background in both polarities.
  defaultViewport: { width: 1440, height: 900 },
})

/**
 * ⚠️ Sampled under prefers-reduced-motion, which is what makes this
 * comparable at all.
 *
 * A first attempt sampled the LIVE orbit and took the peak frame. The numbers
 * swung wildly between runs (457 vs 807 "dark" pixels) because picking the
 * extreme frame selects for the mascot passing over the dark logo, not for the
 * socket being visible — it measured the BACKGROUND. Reduced motion pins the
 * mascot to angle 0, spin 0 (face-on) and one deterministic static frame, so
 * ON and OFF differ only by the thing under test. Same technique the
 * satellites' preview-live check uses, and for the same reason.
 *
 * The discriminator is DARKNESS, not amber brightness. The mascot is BRASS —
 * amber-gold all over — so counting "bright amber" pixels cannot tell the lit
 * display from the body it sits on; measured, it read BACKWARDS (ON 261, OFF
 * 333) because the socket covers brass that would otherwise be bright. The
 * socket is pure #000000 and nothing else on the mascot is.
 */
async function sample(tag) {
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.goto(`${BASE}/en`, { waitUntil: 'networkidle2', timeout: 60000 })
  // Wait for the CONDITION, never a fixed sleep: a cold 530 KB GLB fetch has
  // raced a fixed 6s wait on this project before and produced a false failure.
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 3000))

  const s = await page.evaluate(() => window.__ttMascot())
  const d = s.diameterPx ?? 28
  const half = Math.max(10, Math.round(d * 0.4))
  const clip = {
    x: Math.max(0, Math.round(s.pos.x - half)),
    y: Math.max(0, Math.round(s.pos.y - half)),
    width: half * 2,
    height: half * 2,
  }
  const buf = await page.screenshot({ clip, path: `killswitch-${tag.trim()}.png` })
  await page.close()

  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let dark = 0
  let sum = 0
  let n = 0
  for (let j = 0; j < data.length; j += info.channels) {
    sum += (data[j] + data[j + 1] + data[j + 2]) / 3
    n++
    if (data[j] < 40 && data[j + 1] < 40 && data[j + 2] < 40) dark++
  }
  const out = { dark, mean: sum / n, spin: s.spin, angle: s.angle }
  console.log(
    `  ${tag}: socket-dark px ${dark}  mean luma ${out.mean.toFixed(1)}  ` +
      `(frozen at angle ${s.angle?.toFixed(2)}, spin ${s.spin?.toFixed(2)})`,
  )
  return out
}

try {
  await setEnabled(true)
  const on = await sample('ON ')
  await setEnabled(false)
  const off = await sample('OFF')

  check('both samples are the same frozen frame', on.spin === off.spin && on.angle === off.angle,
    `angle ${on.angle} / ${off.angle}`)
  // Reduced motion pins the mascot to angle 0 — the FAR side of the orbit and
  // its smallest on-screen size, 12.6px, where a fully covered faceplate is
  // only ~31px and antialiasing against bright brass leaves ~13 truly black
  // pixels. Small, but the floor is a measured 0 with the switch off, and a
  // switch that works at the worst size works at every other one.
  check('ON draws the socket', on.dark >= 8, `${on.dark} near-black px`)
  // The load-bearing assertion. OFF must not merely dim the eyes — the socket
  // darkening must be GONE, leaving the brass faceplate and its painted ovals.
  // A half-disabled switch would leave a black disc here, which is worse than
  // the state the switch promises to restore.
  check(
    'OFF removes the socket entirely',
    off.dark < Math.max(8, on.dark * 0.25),
    `${off.dark} vs ON ${on.dark}`,
  )
  check(
    'OFF is brighter — the brass faceplate is uncovered',
    off.mean > on.mean,
    `off ${off.mean.toFixed(1)} vs on ${on.mean.toFixed(1)}`,
  )
} finally {
  await setEnabled(true) // leave it on
  await browser.close()
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nEye kill switch verified both ways.')
process.exit(failures ? 1 : 0)
