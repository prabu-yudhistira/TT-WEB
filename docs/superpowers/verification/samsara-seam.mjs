/**
 * The ortho → perspective handoff must be invisible.
 *
 * Spec §11.2, plan Task 11 step 5. Highest-consequence unknown in the whole
 * feature (§12 risk 1): the orbit's camera is orthographic in CSS-pixel units,
 * the room's is perspective, and on one frame SAMSARA crosses between them. If
 * its projected size or position steps, the fall reads as a cut.
 *
 * ⚠️ WHAT IS MEASURED, and why the obvious thing is not enough.
 *
 * `__ttMascot().pos` is the pose the script ASKED for. Sampling only that would
 * report a flawless seam on a build where the perspective placement was wrong
 * and the room rendered empty — which is exactly the failure this file exists
 * to catch, and exactly what happened the first time the room's dev handle
 * swapped cameras. So the assertions run against `projected`: the placer's real
 * world transform pushed back through whichever camera is live. Those two
 * numbers agree only if the conversion into world units is correct.
 *
 * Both sides come from `__ttMascot().rendered`, the engine's own per-frame
 * snapshot, rather than from its live fields. Reading `cameraMode` live labels a
 * frame with the camera the NEXT frame will use, which reported this seam as a
 * 6px jump while the placement check read 0.000px on the same run.
 *
 * ⚠️ Sampling runs INSIDE the page, on its own rAF. Polling over CDP samples at
 * whatever rate the protocol manages and would miss the one frame that matters.
 *
 * The beats are fired through `__ttSamsaraBeat` rather than as synthetic wheel
 * events. Gesture normalisation is pinned by `gestures.check.ts` against
 * synthetic hardware streams already; what is under test here is the handoff,
 * and driving it deterministically is what makes a sub-pixel assertion
 * meaningful rather than a race against a debounce.
 */
import puppeteer from './_puppeteer.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.TT_URL ?? 'http://localhost:3000/en'

/** Sub-pixel, per §11.2. One pixel is already visible on a hard cut. */
const TOL_PX = 1

const VIEWPORTS = [
  { w: 1440, h: 900, label: '1440x900' },
  { w: 1280, h: 720, label: '1280x720' },
  { w: 390, h: 844, label: '390x844 portrait' },
]

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

for (const vp of VIEWPORTS) {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.setViewport({ width: vp.w, height: vp.h })
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120000 })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, {
    timeout: 120000,
  })
  // The sequence arms on the hero going live, which is behind the 7.67s sketch
  // intro plus the ignition. Wait for the handle itself rather than a duration.
  await page.waitForFunction(() => typeof window.__ttSamsara === 'function', { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1500))

  // ── record every frame from the commit through the landing ──────────
  const samples = await page.evaluate(async () => {
    const out = []
    let stop = false
    const tick = () => {
      const m = window.__ttMascot()
      const s = window.__ttSamsara()
      out.push({
        t: performance.now(),
        mode: s.mode,
        promoted: s.promoted,
        // From the engine's per-frame record, never its live fields: the
        // camera is swapped by the sequence's rAF, which runs after the
        // engine's, so a live read labels THIS frame's pose with the NEXT
        // frame's camera.
        camera: m.rendered.camera,
        engineMode: m.rendered.mode,
        orbitAngle: m.rendered.orbitAngle,
        want: { x: m.pos.x, y: m.pos.y, d: m.diameterPx },
        got: { x: m.rendered.x, y: m.rendered.y, d: m.rendered.diameterPx },
      })
      if (!stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // Four beats: three charge, then the commit.
    for (let i = 0; i < 4; i++) {
      window.__ttSamsaraBeat('down')
      await new Promise((r) => setTimeout(r, 120))
    }
    // Long enough for the whole cinematic (~3.4s) plus headroom.
    await new Promise((r) => setTimeout(r, 6000))
    stop = true
    return out
  })

  check(`[${vp.label}] no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  check(`[${vp.label}] captured frames`, samples.length > 60, `${samples.length} frames`)

  // Keyed on the ENGINE's camera, not the sequence's `promoted` flag: the flag
  // flips in the sequence's rAF, the camera in the engine's, and the seam is
  // whatever the RENDERER did — which is what `projected` records.
  const firstPromoted = samples.findIndex((s) => s.camera === 'perspective')
  check(`[${vp.label}] the promotion happened`, firstPromoted > 0, `frame ${firstPromoted}`)

  const landed = samples.some((s) => s.mode === 'landed')
  check(`[${vp.label}] reached landed`, landed)

  if (firstPromoted > 0) {
    // ⚠️ NOT `samples[firstPromoted - 1]`, and the difference is a whole class of
    // false failure. Under software rasterisation this page runs at ~17fps and
    // the sampler drops frames, so the neighbour of the first perspective frame
    // is sometimes the sweep's last frame — still a sliver short of the far
    // point — rather than the settled one. That reported 2.96px of "seam jump"
    // on code whose placement check simultaneously read 0.000px, and it moved
    // between runs. The variable to pin is WHICH FRAME IS THE SEAM, not the
    // tolerance: take the last ortho frame the engine actually rendered at the
    // far point, which is the pose transitPoseAt(0) is defined against.
    const FAR = Math.PI / 2
    const settledOrtho = samples
      .slice(0, firstPromoted)
      .filter((s) => s.camera === 'ortho' && Math.abs(s.orbitAngle - FAR) < 1e-9)
    check(
      `[${vp.label}] the sweep settled on the far point before promoting`,
      settledOrtho.length > 0,
      `${settledOrtho.length} settled ortho frame(s)`,
    )
    const before = settledOrtho[settledOrtho.length - 1] ?? samples[firstPromoted - 1]
    const after = samples[firstPromoted]

    check(
      `[${vp.label}] the camera really swapped`,
      before.camera === 'ortho' && after.camera === 'perspective',
      `${before.camera} -> ${after.camera}`,
    )

    // ── the seam itself ────────────────────────────────────────────────
    const dx = Math.abs(after.got.x - before.got.x)
    const dy = Math.abs(after.got.y - before.got.y)
    const dd = Math.abs(after.got.d - before.got.d)
    check(
      `[${vp.label}] x is continuous across the handoff`,
      dx <= TOL_PX,
      `${before.got.x.toFixed(2)} -> ${after.got.x.toFixed(2)} (${dx.toFixed(3)}px)`,
    )
    check(
      `[${vp.label}] y is continuous across the handoff`,
      dy <= TOL_PX,
      `${before.got.y.toFixed(2)} -> ${after.got.y.toFixed(2)} (${dy.toFixed(3)}px)`,
    )
    check(
      `[${vp.label}] size is continuous across the handoff`,
      dd <= TOL_PX,
      `${before.got.d.toFixed(2)} -> ${after.got.d.toFixed(2)} (${dd.toFixed(3)}px)`,
    )
  }

  // ── the placement is right, not merely continuous ───────────────────
  //
  // Every perspective frame: does the body actually render where the script put
  // it? An empty room and a perfect seam are compatible; this is what separates
  // them.
  const persp = samples.filter((s) => s.camera === 'perspective')
  let worst = { x: 0, y: 0, d: 0 }
  for (const s of persp) {
    worst = {
      x: Math.max(worst.x, Math.abs(s.got.x - s.want.x)),
      y: Math.max(worst.y, Math.abs(s.got.y - s.want.y)),
      d: Math.max(worst.d, Math.abs(s.got.d - s.want.d)),
    }
  }
  check(`[${vp.label}] ran perspective frames`, persp.length > 20, `${persp.length} frames`)
  check(
    `[${vp.label}] perspective placement matches the script`,
    worst.x <= TOL_PX && worst.y <= TOL_PX && worst.d <= TOL_PX,
    `worst dx ${worst.x.toFixed(3)} dy ${worst.y.toFixed(3)} dd ${worst.d.toFixed(3)}`,
  )

  // ── and it actually arrives ─────────────────────────────────────────
  const last = samples[samples.length - 1]
  check(
    `[${vp.label}] lands at ${Math.round(0.4 * vp.h)}px (40% of viewport height)`,
    Math.abs(last.got.d - 0.4 * vp.h) < 8,
    `${last.got.d.toFixed(1)}px`,
  )

  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nThe SAMSARA handoff is seamless.')
process.exit(failures ? 1 : 0)
