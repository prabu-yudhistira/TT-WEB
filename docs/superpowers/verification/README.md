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

---

## 2026-08-30 — SAMSARA transition work

### The harness was unrunnable as committed

Every script here did `import puppeteer from 'puppeteer-core'`. That package is
deliberately **not** an app dependency (it lives in the session scratchpad), and
a bare specifier in a file that lives *here* can never resolve it — **ESM
resolves from the importing FILE's location upward, not from the working
directory**. Running from the scratchpad does not help.

Fixed with `_puppeteer.mjs`, a shared resolver that reaches across package roots
via `createRequire(pathToFileURL(...))`. Point it elsewhere with `TT_SCRATCH`.
Install first: `cd "<scratchpad>" && npm init -y && npm install puppeteer-core`.

### `samsara-orbit-unchanged.mjs` — key traces on ANGLE, never on time

Regression guard proving the SAMSARA mode surface added to `MascotEngine` is
additive. Baselined **before** the engine was edited; a guard captured after a
change proves nothing.

⚠️ Angle-**bucketing** was tried first and was not usable: it reported **3.665px
of drift against completely unchanged code**. Not an engine fault — 5° of a
511px-radius orbit is ~45px of arc, and with ~14 samples per bucket the mean
depends on where in that arc the frames landed (expected error ≈ arc/(2√n) ≈
6px). **Interpolating** between the samples bracketing each target angle removed
it: noise fell to **0.056px**, a 65× improvement, which makes a 0.75px tolerance
meaningful. A deliberate 3px nudge reads as 4.643px.

### `eyes-beat.mjs` — was flaky ~1 run in 3, on unchanged code

Two independent variables had to be pinned, and missing either flipped the
result:

1. **Charge.** During a hold the eyes are a *deterministic* function of charge
   (`neutral→wide` below `CHARGE_CROSSOVER`, `wide→blink` above). Charge
   saturates in ~950ms, so two fixed delays can both land at 1.00 — comparing a
   state against itself and deciding on pixel noise. Every observed failure
   reported `charge 1.00`.
2. **Facing.** SAMSARA spins at 113°/s and shows its face ~25% of each turn, so
   an instantaneous sample may be reading the back of its head.

⚠️ Two fixes that do **not** work, both tried and measured:
- *Max lit over a window while facing* — made it worse (3 of 4 failing). A
  window wide enough to guarantee a face pass also spans the charge ramp, so
  both readings converge on whatever the widest expression in the window was.
- *Polling for charge-band AND facing together* — failed 5 of 5. The band exists
  for ~430ms **once**, facing cycles on 3.2s, and after saturation the band
  never recurs.

What works: **release and re-press until the ramp lands on a face-on frame.**
Each attempt is a fresh ramp, turning a one-shot coincidence into a retry.
Signal went from a marginal 5691→4069 (or inverted 5372→5727) to a decisive
**17537→4720**, 5 runs out of 5.

### Running the whole sweep back-to-back is flaky — the scripts are not

Each script launches its own Chrome against the Next **dev** server, which
compiles routes on demand. Under repeated load this surfaces as
`TimeoutError: Navigation timeout of 60000 ms exceeded` — a *navigation*
failure, never an assertion failure. Different scripts fail on different runs,
and each passes in isolation. **Read the failure mode before believing a
regression:** a Node stack trace is environmental, a `FAIL <label>` line is real.

### `samsara-detail.mjs` — never score SAMSARA's eyes by counting amber pixels

The room swaps in a 200k-triangle model. The eye shader is injected through
`onBeforeCompile` on the MATERIALS, so a swap without re-running `patchEyes()`
leaves SAMSARA with no eyes — silently. Nothing throws, nothing logs.

⚠️ The obvious metric is wrong, and it passed the negative test. Counting
"amber" pixels (`R > 150 && R > B + 45`) reported **99,682 lit pixels on a build
with the eye shader deliberately removed**, because **SAMSARA is brass** and that
predicate matches most of its warm metal body. This is the third time this
project has measured the mascot instead of its eyes — the kill-switch check was
wrong the same way.

What discriminates is a **difference between two expressions**, cropped tight to
the face: if the shader is not injected, `wide` renders identically to `blink`.

⚠️ And the absolute threshold must clear the **rotation-jitter floor**. With the
shader removed the difference collapses to ~17.7, not to zero, because
`facing > 0.97` still admits a few degrees of spin. A threshold of 2 was tried
and passed a build with no eyes. Working builds measure 94–98; the floor is set
at 40.

## 2026-08-31 — Task 11, the React wiring

### `samsara-seam.mjs` — sample the ENGINE's frame, not the page's

Three separate false readings came out of one mistake: sampling engine state
from a `requestAnimationFrame` callback in the page.

Three rAF callbacks run per browser frame, in registration order — the engine's
loop, the sequence's loop, then the sampler. So a sampler reading a field that
the SEQUENCE mutates gets this frame's rendered pose labelled with next frame's
value.

- **`camera` read live reported a 6px seam** while the placement assertion on
  the same run read 0.000px. The engine had rendered the frame in ortho; the
  sequence swapped the camera afterwards; the sampler recorded "perspective".
- **The projected pose read live reported a 2,332px jump**, for the same reason
  one level down: the placer still held the previous frame's ortho values while
  the camera field had already flipped.

Fix: the engine writes ONE snapshot per rendered frame — position, size, orbit
angle, camera and mode together, at the end of `place()`, from `placer.position`
rather than `matrixWorld` (which has not been recomputed at that point). Scripts
read `__ttMascot().rendered`. Its live siblings `camera`/`mode` are kept, but
they are not what a seam is measured with.

### Do not loosen a tolerance to absorb a frame-selection error

The seam first missed by 3.5px at 1440×900, 4.9px at 1280×720 and 0.18px at
390×844 — the shape of a viewport-dependent bug, and it was one: the sweep's
smoothstep ended a sliver short of the far point, and an orbit radius of 511px
turns a sliver of angle into pixels. Under software raster the sampler also
drops frames, so the neighbour of the seam was sometimes the wrong frame
entirely and the number moved between runs.

Two fixes, neither of them the tolerance: the sequence now **parks the angle on
the far point exactly and yields one frame** before promoting, and the script
**selects the seam frame by the recorded orbit angle** instead of by index. The
residual went to 0.000px on all three viewports and stayed there across three
runs.

### The transit clock starts at the PROMOTION, not at `HALF_ORBIT_MS`

Only visible once the frame labelling above was correct. The promotion lands
30–50ms after `tMs` crosses `HALF_ORBIT_MS` — one frame to notice, one to settle
the angle, more if the clearance guard defers. Dividing from `half` evaluated
the first scripted frame at t ≈ 0.012, so SAMSARA arrived a step down the fall:
3.8px of size and 4.3px of x, in one frame, on all three viewports.

### ⚠️ `samsara-fps.mjs` was measuring a ~40px smudge, and the floor came from it

`__ttSamsaraRoom` deliberately did not swap the camera before Task 11, so the
room was drawn through the ORTHOGRAPHIC camera — whose frustum is the viewport
in CSS **pixels**, against a room ~42 **world** units across. The 52.1 fps
recorded at Task 8, and the 30 fps floor set from it, describe that smudge.

Correctly framed, on this machine:

| | orbit | room | |
|---|---|---|---|
| SwiftShader (CPU raster) | 42 | 16 | ~58% cost |
| Intel UHD 630, D3D11 | 23 | 24 | vsync-bound, no cost |
| **RTX 3050 Laptop, D3D11** | **515** | **460** | **11% cost** |

The last row is the real one: `--disable-frame-rate-limit`, with orbit and room
passes interleaved so GPU clock ramp cannot flatter either side (424/361,
579/519, 543/498). **460 fps is about 8× a 60Hz display.** The room costs roughly
a ninth of the frame budget on a mid-range laptop GPU and nothing measurable on
integrated, where both figures sit at the refresh ceiling.

The software row disagrees because full-viewport fill of PBR planes is exactly
the work a GPU does cheaply and a CPU rasteriser cannot — it is not a second
estimate of the same number. The floor is now 12 and its job has changed: a
tripwire for a catastrophic regression, which is all software raster can honestly
report. Any performance claim about this room needs the hardware rows.

**Measuring on the discrete GPU:** headless SwiftShader is the default here, and
plain `headless: false` picks the INTEGRATED adapter on this laptop. To reach the
3050: `headless: false` plus
`--use-angle=d3d11 --force_high_performance_gpu --force-gpu-preference=high-performance --disable-frame-rate-limit`,
and confirm with `WEBGL_debug_renderer_info` rather than assuming.

### `Material.needsUpdate` is not how you animate an opacity

The room's reveal ramp runs every frame of the fall. Setting `needsUpdate` there
unconditionally recompiles four shader programs sixty times a second. Opacity is
a uniform and needs no recompile; only `transparent` changes the render path, and
that flips exactly twice per run.

### `samsara-context-leak.mjs` — "replay 25 times" would have passed on anything

The SAMSARA bench replays by RESETTING the state machine, not by remounting the
canvas, so replay alone cannot leak a WebGL context and a script that only
replayed would be green on every possible implementation — the same shape as the
kill-switch check that passed because the canvas was gone while the bytes were
already on the wire.

What actually churns GPU resources on this bench is `rebuildRoom()`, which the
DEPTH slider triggers: it disposes a floor, four walls, a backdrop and their
materials and builds fresh ones. So the script interleaves both, and alternates
the depth value each cycle — setting the same number twice would be swallowed by
the slider's own 220ms debounce and quietly test nothing.

The failure signature of a real leak is Chrome's "Too many active WebGL contexts"
warning and the oldest context being dropped, which presents as a canvas still in
the DOM, still sized, no longer drawing. Hence the assertions: no such warning,
context obtainable and not lost, canvas count unchanged, **and the sequence still
reaches `landed` and renders at size** — the last one being what separates a live
context from a working one.
