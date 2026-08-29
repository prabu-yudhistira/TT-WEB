# Browser verification harness

Scripts that verify hero effects in a **real, foregrounded browser**. They live here
so they survive between sessions — recreating them from scratch has been a
recurring tax on this project — but they are **not** wired into any `npm` script
and the app deliberately takes no dependency on them.

## Why not the in-app browser pane

The pane reports the tab hidden, which throttles `requestAnimationFrame` to
~1 Hz. That stalls the **engine's own clock**, not merely the screenshot cadence
(measured: 13 frames in 13 real seconds), so the effect under test never runs.
Headless Chrome driven by `puppeteer-core` runs the tab foregrounded and at full
rate. Use it for anything animated.

## Running

These scripts need `puppeteer-core` and `ffmpeg-static`, which must **not** be
installed into the app. Copy them into a scratchpad directory that has both, and
run from there:

```bash
npm i puppeteer-core ffmpeg-static
node t9-draco-stall.mjs
```

The dev server must already be running (`npm run dev`, or the preview harness).
Override the target with `TT_URL`; the default is `http://localhost:3000/en`.

Chrome is launched with `--enable-unsafe-swiftshader --use-gl=angle`, i.e.
**software rasterisation**. Treat any fps figure these produce as a floor, never
as real-device performance.

## The scripts

| Script | What it does |
|---|---|
| `t9-lib.mjs` | Shared helpers: launch, error capture, the DOM word probe, frame metrics. |
| `t9-sheet.mjs` | Captures the transition via CDP screencast and tiles it into one contact sheet. |
| `t9-draco-stall.mjs` | **The regression test that matters most** — stalls the `.glb` so `startIgnition()` lands before `load()` resolves, then asserts the bridge still completes. |
| `t9-reduced-motion.mjs` | Asserts the reduced-motion path reaches the solid logo with no cage, and still fires `cue`/`done`. |
| `t9-reduced-motion-pose.mjs` | Asserts reduced motion holds the mark **completely still** and **frontal**. Guards the bug where `interactive` gated only the pointer handlers, leaving the idle spin turning at an arbitrary angle. |
| `t9-ring-profile.mjs` | Profiles ring/core ink across captured frames. Used to calibrate the thresholds the other tests assert on. |
| `preview-live-update.mjs` | Proves a Hero Effects edit reaches the admin preview iframe **without saving**, and that a mismatched-shape message is ignored when the URL's `?source=` doesn't match it. |
| `preview-context-leak.mjs` | Clicks the preview's "Replay intro" 25× and asserts the WebGL context is still live — regression guard for the context exhaustion fixed in `9190364`. |
| `satellites-capture.mjs` | Baseline health for the orbiting satellites: fps, ink on both canvases, motion between frames, label count, zero console errors. |
| `satellites-orbit-hold.mjs` | Orbit direction via the sign of the cross product of consecutive position vectors (screenshots are easy to get backwards through a tilted perspective projection); freeze + shake driven by the **real** `LogoEngine.getCharge()`, not a re-implementation. |
| `satellites-onscreen.mjs` | What fraction of the belt is on screen, and whether any label is clipped by a frame edge or overlaps another, at 1600×900 / 2560×1080 / 390×844. End-to-end proof for the placement rules unit-tested in `lib/satellites/labels.check.ts`. |
| `satellites-degradation.mjs` | Reduced motion is byte-stable **and** non-trivially inked (a `MIN_STATIC_INK` floor — see the trap below); mobile is animating. |
| `satellites-preview-live.mjs` | Proves a Satellites edit in `/admin` reaches the hero preview iframe **without saving** — the same real `postMessage` → `mergeData()` round-trip `preview-live-update.mjs` exercises, satellites-specific. |

## Two traps, both already paid for

**Stall only `logo.draco.glb`.** Stalling `draco_wasm_wrapper.js` or
`draco_decoder.wasm` hangs DRACOLoader's own worker bootstrap so the logo never
renders at all. That is a **test artifact**, not a product bug, and it has
already cost one session a false diagnosis.

**Tile frames before looking at them.** Single screenshots have hidden real
defects on this project twice — the ~70° oblique handoff, and the
sphere-projection chords — both obvious the moment frames were laid side by side.

**Hide the floating words before measuring the mark's geometry.** They sit
inside the centred crop, so an ink *bounding box* swallows them and reports the
mark as far wider than it is (measured: 1.61 vs a true 1.21). `inkFraction` and
`meanAbsDiff` tolerate them because they average over the crop; anything
measuring an extent does not. `handoff-frontal.mjs` and
`t9-reduced-motion-pose.mjs` both hide them first.

**Payload's live-preview `postMessage` requires `collectionSlug` or
`globalSlug`, or it silently discards the message.** `handleMessage()`
(`@payloadcms/live-preview`) returns `initialData` unchanged if both are
missing — no error, no console warning, the preview just never updates. Get
the envelope shape from the real sender
(`@payloadcms/ui`'s `LivePreviewWindow` source), not from the docs' minimal
example. Confirmed in `preview-live-update.mjs`.

**`mergeData()` is not a local merge — it is a real server round-trip.**
Every live update POSTs to `/api/globals/{slug}` or `/api/pages/{initialData.id}`
(method-overridden to GET) and returns *that response* as the new data. For
the collection case this means `useLivePreview`'s `initialData` must carry a
real `id`, or the endpoint resolves to `/api/{collection}/undefined` and every
live edit fails silently. Caught by reading `mergeData.js` directly, not by
the failure showing up as an error anywhere.

**A `MIN_STATIC_INK` floor matters as much as byte-stability for a reduced-motion
assertion.** Byte-stability alone passes happily on a blank canvas — that is
exactly how a real satellites defect stayed invisible: an earlier, wider orbit
band rendered ~76px of ink under reduced motion at 1440×900 (effectively one
satellite, everything else off-frame at its seeded angle), and a stability-only
check called that a pass. Assert both.

**Running `npm run build` alongside a live `npm run dev` corrupts `.next` for
the dev server.** Task 8's own build-check step (needed because this hero's
`admin-preview` route once failed `next build` while `next dev` compiled it
fine) left the still-running dev server serving a mix of dev and production
artifacts — `Cannot find module './vendor-chunks/gsap.js'`, 500s on every
route. Same symptom class as the `.next`-corruption gotcha documented
elsewhere in this project (stop the server, `rm -rf .next`, not just
`.next/cache`, restart clean) but a different trigger: not a version swap or a
force-kill, a production build run against a directory a dev server still has
open. If a verification run needs `npm run build`, expect to restart `npm run
dev` clean afterwards before trusting any subsequent browser check.

**A single transient label-overlap reading did not reproduce — since confirmed
clean on a genuinely warm server.** One run of `satellites-onscreen.mjs`,
taken on the very first request after the `.next` wipe above, reported one
overlapping label pair at 1600×900 (`avgLabelOverlaps 0.25`, one sample of
eight). At the time: 60 dense samples over the next 12s found none, and an
immediate re-run of the same script passed 0 overlaps at all three viewports.
Left as an open question pending a genuinely cold-start-free run. That run
happened during Task 10 (`ConstellationField`'s removal, on a freshly wiped
`.next` restarted cleanly and confirmed warm with two 200s before any browser
check ran) — 0 overlaps at all three viewports, no recurrence. Closed: the
placement algorithm's 14 passing unit assertions in `labels.check.ts` were
right, and the one FAIL was dev-server compile jitter, not a defect.

**A magic-ratio threshold against a continuously-orbiting scene is not
reproducible.** `satellites-preview-live.mjs` first compared total canvas ink
before/after a live edit against a hardcoded "5x" jump, under normal motion.
It failed once, post-`ConstellationField`-removal, at a ~4.7x jump — not
because the live edit stopped working, but because baseline ink itself swings
close to 2x between arbitrary moments: with several satellites orbiting
independently, how many happen to be near-camera at the instant of
measurement (their apparent radius is boosted up to ~4.6x by
`SAT_DEPTH_SCALE`) genuinely varies that much. Fixed the same way as the
cross-source check below — `prefers-reduced-motion: reduce` freezes the scene
to one static, byte-identical frame (`SatelliteEngine.drawStatic()` never
loops), which removes the confound rather than trying to out-guess it with a
looser threshold. Reproduced identically (`3890 → 3890 → 74806`) across
repeated runs afterward.

**Isolate a "did the guard hold" check from the hero's own idle animation.**
A before/after screenshot pair a few seconds apart shows a large delta from
ordinary idle-spin and floating-word drift alone, regardless of whether the
thing under test changed anything — a first version of
`preview-live-update.mjs`'s cross-source check failed this way (delta 29.8,
*larger* than the real effect). Emulating `prefers-reduced-motion` first
(same technique as `t9-reduced-motion-pose.mjs`) freezes the confound and
turns "should be identical" into a clean `0.000`.

## Choosing a metric

Screenshot diffing on this hero is easy to get wrong, because the mark
idle-spins continuously and that alone repaints most of the frame. Measured on
the real transition:

- **Whole-frame delta** — too noisy. The idle-spin control ranged 9–28 across
  runs depending on rotation phase, against ~36–44 for a separation.
- **Whole-frame ink coverage** — tracks *rotation phase*, not the effect. The
  mark's projected area swings ~9% when settled and far more mid-rotation.
- **Ring ink** (annulus outside the mark's silhouette) — the right detector for
  **separation**: idle spin leaves it flat at ~0.0004, a hold spikes it to
  ~0.11, because the shed panels sweep through the ring on their way off-frame.
  It does **not** detect the cage, which stays inside the mark's own extent.
- **Core ink** (centre crop) — the right detector for **the cage**, which
  densifies the middle: 0.512 with the cage up against 0.297 settled, i.e.
  **1.73×**, versus ~1.08× for idle spin alone.

Always wait for the scene to settle (`waitForQuiet`) before measuring. Sampling
during the bridge makes the "no effect" control catch the logo still
materialising, which swamps the very difference the test is trying to see.

## Mascot

Six scripts. Same rules as the rest of the harness — run from a dir with
`puppeteer-core`; the app takes no dependency on them.

| Script | Asserts |
|---|---|
| `mascot-capture.mjs` | orbit direction by the **sign of the 2D cross product** of consecutive position vectors (not by eye — a tilted perspective projection makes CW/CCW genuinely easy to reverse); ≥1 layer flip over the sampled arc; 0 console errors; writes a contact sheet |
| `mascot-occlusion.mjs` | body parked ON the mark contributes ≫ pixels in front vs behind (`LABEL_ENABLED=0`, so only the body is measured). Ratio ~1.7×, not near-total: the TT monogram has open counters, so a body behind it legitimately shows through |
| `mascot-sorting.mjs` | overlap-with-a-bead % and **wrong-sort %** across three viewports. The mascot is on its own canvas and can only sort per-layer against the beads; `HEIGHT 136` biases it toward the viewer so wrong-sort stays 0.0% despite ~1–2% of frames overlapping. Fails if wrong-sort ≥ 2% |
| `mascot-label.mjs` | mascot-word vs satellite-word collision % (the two are placed by different engines; `placeLabels`' `reserved` param is what keeps it near 0); frame-edge clip count must be 0 |
| `mascot-degradation.mjs` | reduced motion byte-stable + orbit frozen + non-empty; fps above the 30 software floor; scroll fades the label; a **404 on `mascot.draco.glb`** leaves the satellite canvases up with no page errors; a **10s stall** on the GLB does not delay the logo handoff (logo canvases up < 9 s) |
| `mascot-kill-switch.mjs` | `mascotEnabled` OFF via authenticated CMS write → no `[data-mascot]` canvas, no label node, no `window.__ttMascot`, `mascot.draco.glb` never fetched. ON → canvas present, one fetch. Both polarities |

Two traps, both already paid for:

- **Emulate `prefers-reduced-motion: reduce` before `mascot-occlusion` and
  `mascot-sorting`.** Otherwise the satellites keep orbiting between shots and
  their motion swamps the signal — the same confound documented for the
  live-preview guard above.
- **The occlusion ratio is ~1.7×, not ~10×, and that is correct.** The mark is
  an interlocked monogram; a body behind it shows through the counters. Do not
  "tighten" the threshold back toward a near-total ratio.

## Mascot eyes (`eyes-*.mjs`)

`eyes-render` · `eyes-legibility` · `eyes-clearance` · `eyes-beat` ·
`eyes-kill-switch` · `eyes-reduced-motion`, plus `eyes-zoom` (a tool, not a check).

Run order matters once: `eyes-legibility` consumes the crops `eyes-render` writes.
`eyes-clearance` is pure geometry and needs `node --import tsx`; the rest drive a
browser. As with every script here, `puppeteer-core` lives in the session
scratchpad and never in the app, so copy the script there to run it.

**Four traps, each paid for in real debugging time:**

1. **`BOB_PX` must be 0 for any pixel comparison.** With the default bob the
   body drifts vertically between screenshots and the diff measures *that*, not
   the eyes. It produced a near-uniform 44–62 across every expression — three
   assertions passing for the wrong reason.

2. **Wait for the condition, never sleep a fixed time, when asserting something
   HAPPENED.** A fixed 6s sleep in `mascot-kill-switch.mjs` raced a cold 530 KB
   GLB fetch and reported "model never fetched" on a build where it loads
   perfectly. The inverse also holds: when asserting nothing *ever* happens,
   only elapsed time can support it, so `eyes-reduced-motion` keeps its fixed
   wait deliberately.

3. **Zoom before diagnosing.** The crescent eyes were diagnosed as rendering
   "hollow rings" from a contact-sheet thumbnail, and the shader's core shading
   was changed to fix it. At 715px they were solid all along; the change made no
   visible difference and was reverted. `eyes-zoom.mjs <expression>` exists for
   exactly this.

4. **Never test a CMS-driven behaviour on `/dev/mascot`.** The bench holds its
   eye config in local React state, so a CMS value never reaches it and both
   polarities of a kill-switch test measure identically. Test those on `/en`.

**Two measurement notes specific to this display:**

- **Darkness, not brightness, identifies the eyes.** The mascot is BRASS —
  amber-gold all over — so a "lit amber pixel" count cannot separate the display
  from the body, and reads BACKWARDS when the socket covers brass that would
  otherwise be bright (measured: eyes ON 261, OFF 333). The socket is pure
  `#000000` and nothing else on the mascot is.
- **Freeze the scene before comparing two configurations.** Sampling the live
  orbit and taking the peak frame selects for the mascot passing over the dark
  logo — it measures the BACKGROUND, and swung 457 vs 807 between runs.
  `prefers-reduced-motion` pins it to one deterministic frame; `eyes-kill-switch`
  asserts both samples came from the same angle and spin.

**A silent-failure note:** feeding a quantized `position` to the object-space
mask makes every fragment fail — the shader compiles clean, nothing throws, and
the mascot shows its PAINTED eyes as if the feature were absent. "No console
errors" proves nothing here. `eyes-render.mjs` asserts on pixels for that reason.
