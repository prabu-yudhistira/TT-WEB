# Hero Orbiting Satellites — Design

**Date:** 2026-08-26 · **Sub-project 3 of 3** of the hero-effects upgrade
**Status:** prototype built and owner-approved on screen; this spec documents the approved
result and what the real build must add
**Supersedes:** [2026-08-10-orbiting-orbs-design.md](./2026-08-10-orbiting-orbs-design.md) —
that design was built through 7 of 10 tasks and rejected on visual grounds. Do not build it.
**Prototype branch:** `feat/hero-satellites`, commits `dff31de..8d6e712`

Replaces `ConstellationField` with coloured spheres orbiting the 3D mark, each carrying one
CMS word.

## 1. Why this spec exists in this order

The 2026-08-10 orbiting-orbs build passed every technical gate — all check suites green,
typecheck clean at every commit, SSR 200 on both locales, no console errors — and was
rejected anyway, after 7 of 10 tasks, because it did not look the way the owner had
pictured. The written spec had been approved; approving a description turned out not to be
the same as approving how it looked.

So this sub-project inverted the order deliberately, with the owner's explicit agreement:
**a throwaway prototype went on screen first, behind a live tuning bench, and this spec was
written afterwards around values the owner tuned and signed off.** Section 5's numbers are
not proposals. They are the approved look, measured off a running hero.

Anything in this document that was *not* validated on screen is marked as such.

## 2. Owner's decisions (2026-08-26)

| Decision | Value |
|---|---|
| Words | **Kept, carried by the satellites.** Chosen over decoupling them, with the sparse-look risk stated and accepted. |
| Dust field | **None.** A dense dust disk was built and shown; the owner chose satellites alone. |
| Satellite look | **Shaded 3D spheres** — highlight, terminator, rim light, specular. Not flat discs. |
| Count | **Follows the word list.** Add a word, get a satellite. No cap. |
| Orbit direction | **Counter-clockwise.** |
| Orbit width | **Wide** — deliberately overflowing the frame on desktop. |
| Labels | **Always visible**, not hover-revealed. |
| Hold coupling | **Freeze + shake.** Holding the mark stops the orbits and sets the satellites trembling. |
| Palette | **Coloured-pencil conversion** of the owner's own hue picks — see §6. |
| Mobile | **Its own radii**, so the belt fits a portrait frame. |
| Architecture | **2D canvas, not three.js.** See §4. |

## 3. What the prototype already proves

Built and verified in headless Chrome (the in-app browser pane throttles `requestAnimationFrame`
to ~1 Hz and cannot see this class of effect at all — see
`docs/superpowers/verification/README.md`):

- 57–91 fps under software rasterisation, so a real GPU is a floor above that
- Occlusion works: satellites pass behind the mark and re-emerge in front
- Counter-clockwise confirmed by the sign of the 2D cross product of consecutive position
  vectors about the orbit centre, across all 12 satellites — not by eye
- Hold coupling confirmed against the real `LogoEngine`: charge reaches 1.0, mean travel
  between samples drops 144.5 px → 7.9 px, and the residual is the shake
- Reduced motion byte-stable across 1.8 s (identical ink counts, genuinely static)
- Satellite count tracks the word list: 3 → 3, 18 → 18, blank lines ignored, empty → 0
- Zero console errors throughout

## 4. Architecture

**Two stacked 2D canvases with the logo's own WebGL canvas between them.**

```
z 0   back canvas    particles with z >= 0   (the logo paints over them)
z 0   LogoStage      existing, unmodified, LATER in the DOM so it wins
z 2   front canvas   particles with z < 0, plus the word labels
```

The container must have **no `z-index` of its own**. A positioned element with `z-index: auto`
does not create a stacking context, so the two canvases join the hero section's stacking
context and can straddle a sibling. Give that div a z-index and the sandwich collapses.

### Why not three.js, given the mark is already a three.js scene

| | 2D canvas sandwich | Orbs in the logo's scene (the 2026-08-10 approach) |
|---|---|---|
| Occlusion | Free — DOM paint order | Needed a bespoke depth-only pass, because every logo material sets `depthWrite:false` |
| Trails | One `destination-out` fill per frame | Needs a render target |
| Point sizing | Plain canvas arcs | `gl_PointSize`, the trap that cost the ignition 5.9 fps |
| Blast radius | `LogoEngine` untouched | Engine surgery |

The one real coupling is that the orbit centre must track the mark's true on-screen box.
That is now `logoScreenBox()` in `lib/three/calibration.ts`, which folds in both the
`object-fit: cover` correction for windows wider than 16:9 and the mobile height fraction.
`ConstellationField` computes the same thing inline today; the build should switch it to the
shared helper.

### Modules

```
src/lib/satellites/
  types.ts              SatelliteConfig + frozen DEFAULT_SATELLITES   (+ .check.ts)
  SatelliteEngine.ts    simulation, projection, rendering, labels     (+ .check.ts)
  resolveSatellites.ts  CMS <-> engine mapping                        (+ .check.ts)   NEW
src/components/hero/
  SatelliteField.tsx    React wrapper, three DOM nodes, lifecycle
```

Parallel sibling of `shatter/` and `ignition/`, sharing only `mulberry32` and `CALIB` — the
pattern the 2026-08-10 whole-branch review validated. The three new check suites join
`npm run verify:config`, taking it from 7 suites to 10.

### Motion model

Ported from `_ASSETS/Web-components/Black Hole — Originkit.js`, with the centre sphere
removed because the mark is the centre.

Per satellite: orbital plane in XZ → inclination about X (plus a per-satellite offset) →
roll about the view axis → perspective divide. Sign of the resulting `z` selects the canvas.
Angular speed follows the reference's Keplerian falloff `v ∝ 1/√r`.

**Known consequence of that falloff, accepted:** satellites at different radii travel at
different speeds, so an initially even phase distribution drifts into clumps. This is
physically correct and visually clumpy. A narrow radius band suppresses it; the approved
config uses a wide one and accepts the clumping.

## 5. Approved configuration

Frozen in `DEFAULT_SATELLITES`. Tuned live and handed back by the owner.

| Group | Values |
|---|---|
| Geometry | `INNER_RADIUS 3` · `OUTER_RADIUS 1.6` · `TILT 20°` · `TILT_SIDEWAY 160°` · `PERSPECTIVE 1300` |
| Mobile geometry | `MOBILE_INNER_RADIUS 1.5` · `MOBILE_OUTER_RADIUS 0.78` |
| Motion | `ORBIT_SPEED 2.2` · `ORBIT_DIR -1` (CCW) · `SAT_SPEED_SCALE 0.8` · `TRAIL 42` |
| Satellites | `SAT_SIZE 4` · `SAT_ALPHA 0.95` · `SAT_SHADE 1` · `SAT_DEPTH_SCALE 1` · `SAT_STREAK 1` · `SAT_RING 1.1` |
| Orbit band | `SAT_RADIUS_MIN 0.74` · `SAT_RADIUS_MAX 1.28` · `SAT_TILT_SPREAD 15°` |
| Labels | `LABEL_MODE always` · `LABEL_SIZE 12` · `LABEL_COLOR #2B2A27` · `LABEL_OFFSET 14` |
| Hold | `HOLD_FREEZE true` · `HOLD_SHAKE_PX 3` · `HOLD_SHAKE_SPEED 1.1` |
| Behaviour | `ENTRANCE_MS 1600` · `SCROLL_FADE_VH 0.6` · `SEED 20260826` |
| Dust | `DUST_COUNT 0` — retained, off |

Two values deserve flagging to whoever tunes this next:

- **`OUTER_RADIUS 1.6` sits exactly on the bench slider's ceiling.** The owner may have
  wanted wider and been unable to ask for it. Widen the range before this becomes a CMS
  field, or the same trap that left `wireSpeed` pinned at its CMS max of 6 on the ignition
  repeats here.
- **`SAT_RADIUS_MAX 1.28` is deliberately above 1**, so the widest orbits sit *outside* the
  nominal outer radius and leave frame.

### Frame overflow is intentional, but text must not be cut

At these radii a large part of the belt is off-frame at any instant — measured 73–77% of
satellites on screen on desktop. A sphere leaving frame reads as depth and is wanted.

A **word** sliced by the frame edge reads as a rendering bug, and that was happening to 3.9
of 12 labels on a laptop and 7 of 12 on a phone. Labels therefore fade out over the last
48 px before any edge, using a width cached at style time rather than measured per frame.
After the fix: 0.1, 0.1 and 0 clipped labels at 1600×900, 2560×1080 and 390×844.

## 6. Palette

The site was deliberately reduced to a single Atelier palette — paper `#F6F1E7`, graphite
`#2B2A27`, red-pencil `#8E1114` — when the Obsidian appearance was removed on 2026-07-13.
The owner's tuned satellite colours were thirteen saturated screen hues, which is a different
visual language from everything else on the page.

Resolved by keeping the owner's hue choices and their order, and converting them to what a
coloured pencil actually lays down on cream paper. This reconciles the two: *coloured pencils
on paper* is the Atelier concept, and the hero video is already drawn in coloured pencil. The
difference was saturation, not the idea.

Conversion, applied in HSL and reproducible rather than hand-picked:

- hue kept, warmed 3–4° toward the paper's own cast
- saturation capped at **0.52** — pigment on paper never reaches a screen primary
- lightness clamped to **0.30–0.46**, the band that holds against `#F6F1E7` without going muddy
- achromatic picks left alone, except pure black, which lifts to graphite: graphite on paper
  never reads as true black

```
#000000 → #2B2A27    #ffd500 → #b2a438    #f96d3e → #b25d38    #23e126 → #3fb238
#0f8a75 → #287e6a    #04b1b4 → #2e928d    #13118d → #292d81    #2B2A27 → #2B2A27
#b04803 → #8f592d    #145c0a → #347425    #118d1f → #29812d    #b400cc → #8a329e
#bd0000 → #95342f
```

The saturated originals stay one click away in the bench for comparison.

## 7. CMS design

This is the substantial new work. The prototype has **no** CMS surface by design.

### 7.1 Appearance → `hero-effects` global

A new **Satellites** group on the existing `hero-effects` global, alongside the separation and
ignition groups. Not localized — these are numbers, identical in EN and ID. Every field
range-clamped to match the bench sliders, and **the bench must not be able to produce a value
the CMS rejects**; a bench that can is worse than no bench.

Mapped to the engine by `resolveSatellites.ts`, mirroring `resolveIgnition.ts` /
`resolveSeparation.ts`, with a round-trip check that perturbs **every** mapped field to a
non-default value first. Round-tripping defaults against themselves is a near-tautology — the
2026-08-09 review caught exactly that in `resolveSeparation.check.ts`.

### 7.2 Colour belongs to the slot, not the word

The obvious design — a colour field on each `floatingWords` row — does not work here, for two
reasons:

1. `floatingWords` is **localized**. A colour attached to a word would be per-locale, so
   setting EN colours would leave ID untouched. Colours are not language.
2. The owner explicitly replaced Payload's row editor with a one-word-per-line textarea in
   PR #2 because 18 array rows were unwieldy. Adding per-row colour pickers walks that back.

**Therefore: colour is a property of the orbit slot, not of the word.** An ordered,
non-localized colour list lives on the `hero-effects` global; satellite *i* takes colour *i*,
cycling if the word list is longer. "Satellite 3 is teal" holds regardless of which word it
currently carries or which locale is being viewed.

Consequence to document in the admin UI: reordering words does not reorder colours.

### 7.3 Count and words

No new field. The satellite count already follows `floatingWords`, which is already editable
at `/admin` in the textarea editor from PR #2, already localized, and already read by the
hero. This half needs no work.

### 7.4 Kill switch

A `satellitesEnabled` checkbox, following `separationEnabled`/`ignitionEnabled`.

**It must gate the field itself, not merely its parameters.** Both prior sub-projects shipped a
bug of exactly this shape — a switch that turned out to gate only a lead time or only a
parameter path, leaving the effect running in a worse state than the switch promised to
restore. Verify both polarities against the live hero by flipping the real CMS value, not by
reasoning about the code.

## 8. Replacing ConstellationField

The owner chose satellites carrying the words, so `ConstellationField` is superseded on the
homepage hero.

Recommended sequence, and **not** a straight delete in the same commit:

1. Ship satellites behind `satellitesEnabled`, with the constellation still present.
2. Switch the default over once the owner has seen it live on the real homepage.
3. Remove `ConstellationField` in its own commit, after the owner confirms.

The prototype's `?satellites=` query switch is throwaway and must not ship.

`ConstellationField` also owns behaviour the satellites do not currently replace: the
`data-constellation-avoid` exclusion zones that keep words off the headline and header. The
satellites ignore those entirely — at the approved radii the belt clears the headline anyway,
but that is a property of the current numbers, not a guarantee. If the owner ever narrows the
orbit, words will start colliding with the headline. **Decide during the build whether to port
avoidance or to document the constraint.**

## 9. Degradation

- **Reduced motion:** static field, no rAF loop, no trails. Non-negotiable on this project —
  an idle spin that ignored the preference read as total site breakage in August, and the site
  honours it in 19 places.
- **Scroll:** dissolves over the first 0.6 viewport heights.
- **No WebGL:** the field is 2D canvas and survives a failed `LogoEngine` independently. It
  should keep running; verify it does.

**⚠ Open defect, found while measuring and not yet fixed.** Under reduced motion at
1440×900 the field renders **76 px of ink total** — effectively one satellite. The static
frame draws satellites at their seeded angles, and at the approved wide radii nearly all of
them fall outside the viewport. A reduced-motion visitor therefore sees an essentially empty
hero. The build must decide what a static satellite field should look like: most likely its
own narrower radii, chosen so the still composition actually reads, rather than reusing the
animated geometry. This needs an owner opinion, since it is a visual question.

## 10. Verification

Headless Chrome via `puppeteer-core` from the session scratchpad. **The in-app browser pane
cannot verify this** — it reports the tab hidden, throttling `requestAnimationFrame` to ~1 Hz,
which stalls the engine's own clock rather than just screenshot cadence.

Scripts written for the prototype, to be promoted into
`docs/superpowers/verification/` alongside the ignition harness:

| Script | Asserts |
|---|---|
| `capture-satellites.mjs` | fps, per-canvas ink, ink changes between frames, label count, console errors |
| `check-orbit-hold.mjs` | orbit direction by cross-product sign; freeze + shake against the real charge |
| `check-onscreen.mjs` | on-screen fraction and clipped-label count across three viewports |
| `check-words.mjs` | satellite count tracks the word list, including 0 and above the old cap |
| `check-save.mjs` | bench state survives reload; partial saves load without undefined knobs |
| `check-degradation.mjs` | reduced motion byte-stable; mobile animating |

Numeric assertions over screenshots wherever possible. Orbit direction through a tilted
perspective projection is genuinely easy to get backwards by eye, and the prototype's own
first word-count test passed for the wrong reason until the test bug was found.

Plus the project's standing gates: `tsc --noEmit`, `verify:config`, SSR 200 on both locales,
and a real `npm run build` — `useSearchParams` in the admin preview only failed under
`next build`, never under `next dev`.

## 11. Out of scope

- Bringing the dust field back. The code stays, defaulted to 0.
- Orbit trace lines. The streak trails already draw the paths.
- Porting the 2026-08-10 orbs modules. That branch stays unmerged as reference only.
- Any change to the separation or ignition effects. This consumes their charge signal; it does
  not alter them.
