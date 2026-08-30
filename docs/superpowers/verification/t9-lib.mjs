// Shared helpers for the Task 9 ignition browser tests.
//
// Why headless Chrome and not the in-app browser pane: the pane reports the tab
// hidden, which throttles requestAnimationFrame to ~1Hz. That stalls the
// ENGINE'S OWN CLOCK, not merely the screenshot cadence, so the effect under
// test never runs. Measured last session: 13 frames in 13 real seconds.
import puppeteer from './_puppeteer.mjs'
import ffmpeg from 'ffmpeg-static'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export const BASE = process.env.TT_URL || 'http://localhost:3000/en'

// swiftshader = software rasterisation. Treat any fps figure as a FLOOR, never
// as real-device performance.
export const ARGS = [
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--hide-scrollbars',
]

export function fresh(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

export async function launch(extraArgs = []) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [...ARGS, ...extraArgs],
  })
}

/** Collects console errors and page errors for later assertion. */
export function watchErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  return errors
}

/**
 * Marks when the sketch video ends. `error` counts too — a video that fails to
 * play never fires `ended`, and the hero deliberately treats that as done.
 */
export async function trackVideoEnd(page) {
  await page.evaluate(() => {
    window.__ttEnded = false
    window.__ttEndedAt = null
    const attach = () => {
      const v = document.querySelector('video')
      if (!v) return setTimeout(attach, 40)
      const mark = () => {
        if (window.__ttEnded) return
        window.__ttEnded = true
        window.__ttEndedAt = performance.now()
      }
      if (v.ended) mark()
      v.addEventListener('ended', mark)
      v.addEventListener('error', mark)
    }
    attach()
  })
}

/**
 * The floating words are real DOM elements whose inline opacity stays 0 until
 * ConstellationField's `active` prop goes true — and `active` is driven by
 * LogoStage's onLive, which fires on the ignition's `cue` event and nothing
 * else. So a visible word is a DIRECT observation that `cue` fired, not an
 * inference from pixels.
 */
export const WORD_PROBE = `(() => {
  const els = [...document.querySelectorAll('div')].filter(
    (d) => d.style.fontStyle === 'italic' && d.style.whiteSpace === 'nowrap',
  )
  const lit = els.filter((d) => parseFloat(d.style.opacity || '0') > 0.01)
  return { total: els.length, lit: lit.length, max: Math.max(0, ...els.map((d) => parseFloat(d.style.opacity || '0'))) }
})()`

export async function probeWords(page) {
  return page.evaluate(WORD_PROBE)
}

/** Centre of the logo canvas, in page coordinates. */
export async function canvasCentre(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }
  })
}

/**
 * Decodes a PNG to raw RGB via ffmpeg-static. There is no image library in this
 * scratchpad and ffmpeg is already here from the reference analysis.
 */
export function rawRGB(pngPath, w, h) {
  return execFileSync(
    ffmpeg,
    ['-v', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-'],
    { maxBuffer: 1 << 28 },
  )
}

/**
 * Mean absolute per-channel difference between two frames, restricted to a
 * centred crop so page furniture (header, scroll cue) cannot dominate.
 */
export function meanAbsDiff(aPath, bPath, w, h, cropFrac = 0.6) {
  const a = rawRGB(aPath, w, h)
  const b = rawRGB(bPath, w, h)
  const x0 = Math.floor((w * (1 - cropFrac)) / 2)
  const x1 = w - x0
  const y0 = Math.floor((h * (1 - cropFrac)) / 2)
  const y1 = h - y0
  let sum = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      n += 3
    }
  }
  return sum / n
}

/**
 * Share of the centred crop covered by ink (anything meaningfully darker than
 * the paper). A raw frame-to-frame delta cannot tell a separation from the idle
 * spin, which also repaints most of the mark; ink coverage can, because
 * separation carries the skin panels off-frame entirely while a rotation keeps
 * roughly the same amount of ink on screen.
 */
export function inkFraction(pngPath, w, h, cropFrac = 0.6, threshold = 170) {
  const a = rawRGB(pngPath, w, h)
  const x0 = Math.floor((w * (1 - cropFrac)) / 2)
  const x1 = w - x0
  const y0 = Math.floor((h * (1 - cropFrac)) / 2)
  const y1 = h - y0
  let ink = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 3
      const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]
      if (lum < threshold) ink++
      n++
    }
  }
  return ink / n
}

/**
 * Ink coverage inside an annulus centred on the logo.
 *
 * This is the discriminator that works. Whole-frame ink tracks the rotation
 * phase — the mark's projected area swings widely as it turns, so a spinning
 * logo alone moves that number as much as a separation does. But the ring sits
 * OUTSIDE the mark's silhouette: idle spin never puts ink there, while a
 * separation sweeps the shed panels straight through it on their way off-frame
 * (SPREAD_FRAC 1.6 reaches the frame edges by ~350ms).
 */
export function ringInk(pngPath, w, h, centre, rInnerFrac = 0.32, rOuterFrac = 0.44, threshold = 170) {
  const a = rawRGB(pngPath, w, h)
  const cx = centre.x
  const cy = centre.y
  const rIn = rInnerFrac * h
  const rOut = rOuterFrac * h
  let ink = 0
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d < rIn || d > rOut) continue
      const i = (y * w + x) * 3
      const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]
      if (lum < threshold) ink++
      n++
    }
  }
  return n ? ink / n : 0
}

/**
 * Blocks until consecutive frames stop changing much — i.e. the bridge has
 * finished and the mark is merely idle-spinning. Measuring before this point
 * makes the "no hold" control window catch the logo still materialising, which
 * swamps the very difference the test is trying to see.
 *
 * The scene never goes fully static (the idle spin is continuous), so the
 * threshold is "no more than the spin", not zero.
 */
export async function waitForQuiet(page, dir, w, h, opts = {}) {
  const { threshold = 16, pairGapMs = 1300, timeout = 30000 } = opts
  const t0 = Date.now()
  let i = 0
  let prev = null
  let last = Infinity
  while (Date.now() - t0 < timeout) {
    const p = `${dir}/quiet-${String(i).padStart(2, '0')}.png`
    await page.screenshot({ path: p })
    if (prev) {
      last = meanAbsDiff(prev, p, w, h)
      if (last < threshold) return { quiet: true, delta: last, waited: Date.now() - t0 }
    }
    prev = p
    i++
    await new Promise((r) => setTimeout(r, pairGapMs))
  }
  return { quiet: false, delta: last, waited: Date.now() - t0 }
}

export function report(checks) {
  let failed = 0
  for (const [label, ok, detail] of checks) {
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  }
  console.log(failed === 0 ? '\nAll assertions passed.' : `\n${failed} assertion(s) FAILED.`)
  return failed
}
