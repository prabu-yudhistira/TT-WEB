/**
 * Every WebGL/2D canvas must LAY OUT at exactly its container's size.
 *
 * ⚠️ This pins a bug that is invisible at devicePixelRatio 1, which is every
 * headless run this harness has ever done.
 *
 * A <canvas> is a REPLACED element. For an absolutely-positioned replaced
 * element, CSS resolves `width: auto` to the element's INTRINSIC width and then
 * ignores one of left/right — so `position: absolute; inset: 0` does NOT
 * stretch a canvas the way it stretches a div. It falls back to its `width`/
 * `height` ATTRIBUTES, which renderers set to `cssSize x devicePixelRatio`.
 *
 * At dpr 1 the attributes happen to equal the container and everything looks
 * correct. At dpr 1.25 the canvas lays out 25% too large, anchored at its
 * top-left. The engine's own coordinates stay self-consistent — it is the
 * PRESENTATION that is scaled — so the scene renders inflated and pushed away
 * from the origin, while any pointer hit test that reads the real element box
 * stays where it should be. The symptom reads as "the click area is offset",
 * which sends you looking at the hit test, which is fine.
 *
 * MEASURED on the owner's machine at 125% Windows scaling, before the fix:
 * host 1188.8x729.6 against a canvas laying out at 1486x912. Ratio 1.25000.
 *
 * The fix in every case is to give the canvas an explicit CSS size —
 * `width: 100%; height: 100%` — or to write style.width/height from JS.
 * LogoCanvas always did the former and SatelliteEngine the latter; MascotLayer
 * did neither, and was the one that broke.
 *
 * Run at several ratios, because ONE of them passing proves nothing.
 */
import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.TT_URL ?? 'http://localhost:3000/en/dev/samsara'

/** CSS px. Sub-pixel rounding on fractional dpr is expected; 25% is not. */
const TOL_PX = 1.5

const RATIOS = [1, 1.25, 1.5, 2]

let failures = 0
const check = (label, cond, note = '') => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  } else {
    console.log(`ok    ${label}   ${note}`)
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

for (const dpr of RATIOS) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1204, height: 730, deviceScaleFactor: dpr })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => typeof window.__ttSamsara === 'function', { timeout: 120000 })
  // Land it, so the promoted (position: fixed) layer is measured too — that is
  // the state the room is actually seen in.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'replay')
    b?.click()
  })
  await new Promise((r) => setTimeout(r, 7000))

  const canvases = await page.evaluate(() =>
    [...document.querySelectorAll('canvas')].map((c) => {
      const host = c.parentElement
      const r = host.getBoundingClientRect()
      return {
        label: c.dataset.mascot !== undefined ? 'mascot' : (c.getAttribute('aria-label') ?? 'canvas'),
        hostW: r.width,
        hostH: r.height,
        cssW: c.clientWidth,
        cssH: c.clientHeight,
        bufW: c.width,
        bufH: c.height,
      }
    }),
  )

  check(`[dpr ${dpr}] found the canvases`, canvases.length >= 2, `${canvases.length}`)

  for (const c of canvases) {
    // A canvas whose host has no size yet (never shown) tells us nothing.
    if (c.hostW < 2 || c.hostH < 2) continue
    check(
      `[dpr ${dpr}] "${c.label}" lays out at its container's size`,
      Math.abs(c.cssW - c.hostW) <= TOL_PX && Math.abs(c.cssH - c.hostH) <= TOL_PX,
      `css ${c.cssW}x${c.cssH} vs host ${c.hostW.toFixed(1)}x${c.hostH.toFixed(1)} (ratio ${(c.cssW / c.hostW).toFixed(3)})`,
    )
    // And the buffer must still scale WITH dpr, or the fix would have been
    // "make it blurry" rather than "make it the right size".
    check(
      `[dpr ${dpr}] "${c.label}" still renders at full device resolution`,
      c.bufW >= Math.round(c.cssW * Math.min(dpr, 1.5)) - 2,
      `buffer ${c.bufW}x${c.bufH}`,
    )
  }

  await page.close()
}

await browser.close()
console.log(
  failures ? `\n${failures} check(s) failed.` : '\nEvery canvas presents at its container size.',
)
process.exit(failures ? 1 : 0)
