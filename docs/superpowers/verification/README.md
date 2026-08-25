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
