# Hero Orbiting Mascot — Design

**Date:** 2026-08-28
**Status:** prototype built and owner-tuned on screen; this spec documents the approved result
and what the real build must add.
**Prototype branch:** `feat/hero-mascot` (working tree, not yet committed at time of writing)
**Relation to prior work:** additive. The satellites
([2026-08-26-hero-satellites-design.md](./2026-08-26-hero-satellites-design.md)) stay exactly
as shipped. This adds one hard-coded object orbiting the same belt, and extracts the belt's
projection into a shared module so the two cannot drift apart.

Adds the TAMPA TARUNO mascot (`_ASSETS/`… `Mascot.glb`) as a single object orbiting the 3D
mark alongside the satellites, carrying the word **SAMSARA**, trailing glowing gold dust,
CMS-tuned end to end, and built so a later scroll-driven fly-out can hook in without a
rewrite.

---

## 1. Why this spec exists in this order

The 2026-08-10 orbiting-orbs build passed every technical gate and was rejected anyway, after
7 of 10 tasks, purely on how it looked. The satellites sub-project fixed that by inverting the
order: prototype on screen first, spec written around tuned values. This sub-project did the
same.

**A throwaway prototype (`MascotEngine`, `MascotLayer`, `/dev/mascot` bench) went on screen
first. The owner tuned it live across several rounds** — size, orbit radius, height off the
plane, spin speed, then a full switch of the trail from a solid ribbon to a gold-dust particle
field, then additive vs normal blending, then the label. Section 5's numbers are the values
handed back, measured off a running hero. They are not proposals.

Anything in this document not validated on screen is marked as such.

## 2. Owner's decisions (2026-08-28)

| Decision | Value |
|---|---|
| What it is | **One hard-coded object**, not a population. Not driven by any list. |
| Orbit | **Shares the satellites' belt** — same tilt, roll, perspective, direction, hold-freeze. Its own radius, height, speed, size, spin. |
| Where in the belt | `RADIUS 0.71` — **inside** the satellite band (0.5–0.8), not outside it, lifted clear by `HEIGHT 136`. The original brief said "outermost"; the owner tuned it inward. |
| Size | **Small**, ~28 px base — a fast-spinning bead, not a large body. |
| Spin | **Fast** — `SPIN_SPEED 113°/s`, roughly one turn every 3 s, independent of the orbit. |
| Visual treatment | **Photoreal brass, as authored.** A knowing departure from the Atelier palette, same call as the saturated satellite colours. |
| Trail | **Glowing gold dust** — a shed particle field, not a ribbon. `TRAIL_ADDITIVE true` with a brightened dust colour `#FDB721`. |
| Label | **SAMSARA**, styled exactly like a satellite word. Its own fixed field, not taken from `floatingWords`. |
| `samsara` in the hero words | **Removed from `floatingWords`** so the word appears once, on the mascot. Satellite colour list shifted to keep every remaining word its tuned colour (done 2026-08-28, live CMS + code default). |
| Sound | **Deferred.** The site has no audio layer; sound is its own later spec. |
| Fly-out on scroll | **Deferred.** The destination section ("manifesto replaced by a mouse-reactive storytelling concept") does not exist yet. Build the exit toward it when it does. |
| Architecture | **Its own WebGL layer** (option B of three considered). See §4. |

## 3. What the prototype already proves

Built and verified in headless Chrome via `puppeteer-core` — the in-app browser pane throttles
`requestAnimationFrame` to ~1 Hz and cannot see this class of effect
(`docs/superpowers/verification/README.md`).

- **Loads.** The decimated Draco + WebP + `KHR_texture_transform` GLB (531 KB) loads in
  three.js with no new decoder — the app already runs `DRACOLoader` against `/draco/` for the
  logo, and the wasm is warm by the time the mascot is requested.
- **Orbits with the belt.** Counter-clockwise confirmed by the sign of the 2D cross product of
  consecutive position vectors about the orbit centre — not by eye.
- **Occlusion works.** The single canvas flips between `z 0` and `z 2` as the mascot crosses
  behind and in front of the mark. 3 flips per orbit, every one at the orbit's widest
  horizontal excursion (`sin θ = 0`), so the flip is never visible. Measured: a body parked on
  the mark contributes 2.4× more visible pixels in front than behind, the residual being the
  monogram's own open counters.
- **Never sorts wrongly against a bead.** 0.0% wrong-sorting across 420 samples at three
  viewports, despite 13.6% of frames overlapping a bead — see §11.
- **Kill switch is real.** `ENABLED` off → **no canvas in the DOM and the 531 KB model never
  fetched**, verified in both polarities.
- **Reduced motion.** Byte-stable single frame, orbit does not advance, mascot still placed on
  screen (non-empty).
- **Frame rate.** 49–59 fps under software rasterisation, so a real GPU is a floor above that.
- **Label collides 0.8% of frames** with a satellite word, down from 13.3% before the
  cross-engine reservation was added — see §7.
- Zero console errors throughout.

## 4. Architecture

### 4.1 Its own WebGL layer

Three options were weighed:

| | A — pre-rendered sprite atlas | **B — own WebGL layer (chosen)** | C — inside `LogoEngine` |
|---|---|---|---|
| Ships | ~0.3–1 MB atlas | 531 KB Draco GLB | 531 KB Draco GLB |
| Occlusion | free (canvas sandwich) | z-index flip on one canvas | **bespoke depth-only pass** — every logo material sets `depthWrite:false` |
| Trail | free | own mechanism (particle field) | render target |
| New GL contexts | 0 | 1 | 0 |
| Arbitrary 3D later (fly-out) | **no** — baked spin/lighting | yes | yes |
| Blast radius | none | new sibling module | surgery on a signed-off file |

**B was chosen for the fly-out.** The deferred scroll exit and the mouse-reactive storytelling
section the owner described will almost certainly need real 3D transforms — a pre-rendered
atlas would have to be thrown away at that point. C is rejected outright: it repeats the
2026-08-10 orbs mistake of paying for a depth-only pass, and piles a third responsibility onto
a file already carrying separation and ignition.

B's costs, accepted: one extra WebGL context on the hero, and the trail is no longer free.

### 4.2 Canvas and occlusion

**One `<canvas>`, whose `z-index` flips:**

```
z 0   behind the mark   (LogoStage is LATER in the DOM, so it paints over)
z 2   in front of the mark
```

One canvas suffices because there is exactly **one** mascot. This is not a general
depth-sorting scheme — see §11 for the one case it cannot handle.

Like `SatelliteField`, the root `<div>` must have **no `z-index` of its own**: a positioned
element with `z-index: auto` does not create a stacking context, so the canvas joins the
hero's stacking context and can straddle `LogoStage`. `MascotLayer` **must be placed before
`<LogoStage>`** in the hero's DOM, for the same reason `SatelliteField` is.

The flip is driven by the sign of the projected `z` and is always invisible: the crossing
happens where `sin(angle) = 0`, which is the orbit's furthest point from the mark
horizontally. The mascot is at maximum distance from the logo at the exact frame it changes
layer.

### 4.3 Orthographic camera in CSS pixel units

The mascot is **not given its own camera model**. It is positioned by calling the same
`projectOrbit()` the satellites use, then placed at those screen coordinates directly. An
orthographic camera sized to the viewport in CSS pixels makes that placement exact and makes
`SIZE` mean **literal on-screen pixels**, not an abstract multiplier.

Cost, accepted: no perspective foreshortening *within* the mascot. Invisible at ~28–65 px on
screen. If the fly-out wants a dramatic rush toward camera, only this camera and `place()`
change — nothing else in the layer.

### 4.4 Shared projection — the anti-drift guarantee

`src/lib/satellites/project.ts` (**new, already extracted in the prototype**) holds two pure
functions, both previously inline in `SatelliteEngine`:

- `projectOrbit(plane, cx, cy, radius, angle, height, tiltRad)` → `{ x, y, z, scale }`
- `orbitGeometry(beltRadii, W, H, box, mobile)` → `{ cx, cy, hh, innerR, outerR }`

`SatelliteEngine` now delegates to both. `MascotEngine` calls both with the **same
`SatelliteConfig`** for the plane and the outer radius. Consequences:

- The mascot **cannot** be desynced from the belt by editing it — `TILT`, `TILT_SIDEWAY`,
  `PERSPECTIVE` are inherited, not duplicated. This is why they are absent from `MascotConfig`
  (§7.2), the same reasoning as "colour belongs to the orbit slot, not the word".
- The mascot's `RADIUS` is a fraction of the satellites' live `OUTER_RADIUS`, computed by the
  shared helper, so retuning the belt moves the mascot with it rather than leaving it stranded.

`SatelliteEngine`'s own behaviour is unchanged — verified: all 500 existing `verify:config`
assertions still pass after the extraction.

### 4.5 Modules

```
src/lib/mascot/
  types.ts           MascotConfig + frozen DEFAULT_MASCOT              (+ .check.ts  NEW)
  MascotEngine.ts     scene, ortho camera, orbit, spin, dust, label    (+ .check.ts  NEW for pure bits)
  resolveMascot.ts    CMS <-> engine mapping                           (NEW, + .check.ts)
src/components/hero/
  MascotLayer.tsx     React wrapper, one canvas + one label node, lifecycle
src/lib/satellites/
  project.ts          shared projectOrbit + orbitGeometry              (NEW — already in prototype)
  labels.ts           placeLabels gained a `reserved` parameter        (already in prototype)
scripts/
  build-mascot.mjs    source GLB -> public/models/mascot.draco.glb     (in repo — see §8)
```

Parallel sibling of `satellites/`, `shatter/`, `ignition/`. The new check suites join
`npm run verify:config`.

## 5. Approved configuration

Frozen in `DEFAULT_MASCOT` (`src/lib/mascot/types.ts`). Tuned live and handed back by the
owner 2026-08-28.

| Group | Values |
|---|---|
| Orbit | `RADIUS 0.71` · `MOBILE_RADIUS 0.55` · `HEIGHT 136` · `TILT_OFFSET 0` · `PHASE 88°` · `SPEED_SCALE 0.52` |
| Size / look | `SIZE 28` · `MOBILE_SIZE 18` · `DEPTH_SCALE 0.3` · `OPACITY 1` · `ENV_INTENSITY 1` · `LIGHT_INTENSITY 1.5` |
| Spin | `SPIN_SPEED 113°/s` · `SPIN_TILT 12°` · `BOB_PX 0` · `BOB_SECONDS 8.8` |
| Trail | `TRAIL_SECONDS 1.4` · `TRAIL_DENSITY 130/s` · `TRAIL_SIZE 10` · `TRAIL_SPREAD 6.5` · `TRAIL_DRIFT 25` · `TRAIL_GLOW 0.95` · `TRAIL_TWINKLE 0.45` · `TRAIL_OPACITY 0.75` · `TRAIL_ADDITIVE true` · `TRAIL_COLOR #FDB721` · `TRAIL_CORE_COLOR #FFFCD6` |
| Label | `LABEL_TEXT "SAMSARA"` · `LABEL_SIZE 12` · `LABEL_COLOR #2B2A27` · `LABEL_OFFSET 14` · `LABEL_HALO 0` |
| Hold | `HOLD_FREEZE true` · `HOLD_SHAKE_PX 1.5` · `HOLD_SHAKE_SPEED 1` |
| Behaviour | `ENTRANCE_MS 1600` · `SCROLL_FADE_VH 0.6` |

### 5.1 `HEIGHT 136` is load-bearing, not decorative

`RADIUS 0.71` places the mascot **inside** the satellite band (0.5–0.8 of `OUTER_RADIUS`),
where a body on its own layer could sort wrongly against a bead. It does not, because
`HEIGHT 136` shifts the mascot's depth by `−HEIGHT · sin(TILT) ≈ −46 px`, biasing it
consistently toward the viewer. So whenever it overlaps a bead on screen, it genuinely is the
nearer object.

Measured: **13.6% of frames overlap a bead, 0.0% sort wrongly**, across 420 samples at
1440×900 / 1280×800 / 390×844.

**Constraint for the build and for CMS ranges:** `HEIGHT` must stay positive. At or below 0
the guarantee is gone and the layer limitation in §11 becomes visible. The CMS field's minimum
should not reach 0, or should carry a warning.

### 5.2 `DEPTH_SCALE 0.3`, not the satellites' 0.9

`SAT_DEPTH_SCALE 0.9` is tuned for 4 px beads, where the resulting ~4.5× swing at closest
approach reads as depth. Applied to a body of any real size the same number is overwhelming —
an 84 px mascot ballooned to ~380 px for a third of every orbit (measured, an early prototype
bug). The perspective divide alone already swings this belt 0.70×–1.78×; `DEPTH_SCALE` only
nudges it.

### 5.3 Generous CMS ranges

Every bench slider was given wide headroom deliberately. This project has already shipped an
owner-approved value sitting exactly on its own CMS ceiling (the ignition's `wireSpeed`,
flagged across three sessions). A slider that stops where taste was still heading made the
decision. `SPIN_SPEED` in particular runs to ±180°/s; the approved 113 is comfortably inside
it.

## 6. The gold-dust trail

The wake is a shed particle field, not a ribbon — the owner's explicit switch after seeing the
ribbon on screen.

### 6.1 Mechanism

Motes are emitted at the mascot's **real** position each frame (hold-shake jitter included, on
purpose), each with:

- random radial scatter up to `TRAIL_SPREAD` at birth
- a random drift direction at `TRAIL_DRIFT · (0.35–1.0)` px/s
- lifetime `TRAIL_SECONDS · (0.7–1.3)`, size `TRAIL_SIZE · (0.55–1.45)`
- fade in over the first 12% of life, out over the rest — a mote that pops in at full
  brightness reads as a glitch
- a per-mote `TRAIL_TWINKLE` brightness flicker

Fixed pool of `MAX_MOTES`, ring-buffer cursor, buffers allocated once. The prototype uses 900;
the build should size it to `ceil(TRAIL_DENSITY_max × TRAIL_SECONDS_max × 1.3)` so the CMS
cannot ask for more live motes than the pool holds. Dead motes are culled in the **vertex**
stage — a fragment `discard` still pays full rasterisation cost, the trap that cost the
ignition's first ember pass 5.9 fps. A frame-stall clamp caps emission at 40 motes/frame so a
restored tab does not dump a blob at one point.

### 6.2 "Glowing" without additive dependence

`gl_PointSize` is set to literal pixels because the camera is orthographic in CSS pixel units.
**Do not** convert it to the usual perspective idiom `300.0 / -mv.z` — that assumes a far
larger world scale and is exactly what produced ~437 px points and 5.9 fps in the ignition.

Each mote's fragment shader mixes a hot core (`pow(1−r, 3) · TRAIL_GLOW`) toward
`TRAIL_CORE_COLOR` inside a soft body (`pow(1−r, 2)`) of `TRAIL_COLOR`. The glow lives in that
core term and the colour, so it survives whether or not additive blending is on.

### 6.3 Additive blending — a prediction that was wrong

The prototype predicted additive would fail on `#F6F1E7` paper: little headroom to add into,
so it would clip toward white rather than read as gold (the shape of the 2026-08-08 lesson
that trionn's sheer skin works on `#0C0C0C` and vanishes on our paper).

**Built both, compared side by side on the running hero: the difference was modest, not
fatal.** Additive is slightly paler and loses a little amber. The owner chose **additive**,
paired with a brighter, more saturated dust colour (`#FDB721`, up from the first pass's
`#C37D04`) that compensates for the paling. Recorded as an informed decision — the build must
not "fix" it back, and must not re-derive the failed prediction as if it had been confirmed.
`TRAIL_ADDITIVE` stays a CMS field so the comparison can be remade.

## 7. The label

Styled **exactly** like a satellite word — same `LABEL_SIZE 12`, `LABEL_COLOR #2B2A27`,
letter-spacing, and the same edge-fade rule (it reuses `placeLabels()` from
`src/lib/satellites/labels.ts` rather than reimplementing it). Same dim-to-0.15 when the body
is behind the mark and over its face.

Two deliberate differences from a satellite label:

1. **Offset is measured from the mascot's edge, not its centre.** Unlike a 4 px bead the
   mascot's on-screen radius changes with depth; a fixed centre offset would bury the word
   inside it at closest approach.
2. **The label sits at a fixed `z-index: 2`, it does not flip with the canvas.** A name that
   disappears behind the mark for half of every orbit is worse than one that stays put; the
   dim-over-the-face rule handles the behind case instead.

### 7.1 Cross-engine label collision — found and fixed

The mascot's label is placed by `MascotEngine`; the satellites' labels by `SatelliteEngine`'s
own collision pass. Neither knew about the other, so **the mascot's word overlapped a
satellite word in 13.3% of frames** at 1440×900 — the exact defect class the satellites' own
suppression exists to prevent.

Fix, in the prototype: `placeLabels()` gained an optional `reserved: LabelBox[]` parameter for
boxes owned by another layer. `MascotEngine` publishes its current label box through a ref
(`labelBoxRef`, same pull-based pattern as `chargeRef` — it changes every frame and mirroring
it into React state would cost a re-render per frame). `SatelliteField` reads it and feeds it
in as occupied space. The mascot's word wins any collision: there are a dozen hero words but
one mascot.

Result: **13.3% → 0.8%**. The residual is a one-frame lag between two independent rAF loops
and is not worth chasing. The parameter is optional, so with no mascot on the page the
satellites behave exactly as before — verified, existing assertions unchanged.

### 7.2 `samsara` removed from `floatingWords`

`samsara` was in the EN `floatingWords` list (13 words; ID had 12, no equivalent) and would
have appeared twice once the mascot carried it. Removed from the **live dev DB** via
authenticated `PATCH /api/pages/1?locale=en` (it was never in `src/seed/index.ts`, so no seed
change). EN and ID are now symmetric at 12.

Satellite colour is assigned by orbit-slot index, not by word. `samsara` held slot 0
(`#000000`), so removing it shifted every remaining word up a slot. To keep each word its
tuned colour, the leading `#000000` was dropped from all three colour lists — the live CMS
`hero-effects.satelliteColors` (authenticated `POST`), `DEFAULT_SATELLITES.SAT_COLORS`, and
`SATURATED_COLORS` in the satellites bench. Every remaining word keeps exactly its tuned
colour; the belt drops from 13 beads to 12. Done 2026-08-28.

**Recommended build sequence** mirrors the satellites' `ConstellationField` retirement: ship
the mascot behind its kill switch with `samsara` already gone, confirm on the real homepage,
and treat the word-list edit as already landed rather than something to redo.

## 8. Asset pipeline

`Mascot.glb` (57.6 MB, 1,964,126 triangles, three 4K/2K PBR textures) **never ships**. It
stays in `_ASSETS/` as a source asset, exactly as `logo.glb` (876 KB source → 53.7 KB shipped
`logo.draco.glb`).

### 8.1 What ships

`public/models/mascot.draco.glb` — **531 KB**, 19,975 triangles, 1024² WebP textures, Draco
`edgebreaker`. Roughly a third of the hero video.

### 8.2 Decimation is safe — measured, not assumed

A decimation ladder was rendered through the same rasteriser as the source and compared:

Sizes below are Draco `edgebreaker` unless noted; verdicts are from rendering each rung
through the same rasteriser as the source and comparing.

| Build | Triangles | Size | Verdict at inspection size | at orbit size (~28–110 px) |
|---|---|---|---|---|
| source | 1,964,126 | 57.6 MB | — | — |
| 200k / 2048² | 200,296 | 6.3 MB | indistinguishable | indistinguishable |
| 50k / 1024² | 50,051 | 663 KB | indistinguishable | indistinguishable |
| **20k / 1024²** | **19,975** | **531 KB** | **indistinguishable** | **indistinguishable** |
| 12k / 512² | 11,973 | 213 KB | very slight bezel softening | indistinguishable |
| ~10k / 512² | 10,057 | ~200 KB | bezel ring facets, eye opening distorts | indistinguishable |

20k / 1024² is the chosen rung: visually identical to the source at any size the hero uses,
with 1024² textures leaving headroom for the fly-out's larger scale. If it later needs to be
leaner — the current orbit only ever draws it at ~28–65 px, which makes 531 KB arguably
over-specified — the 12k / 512² build at 213 KB is a one-flag change in the script, not a
rebuild. The decision to keep 531 KB is deliberate headroom for the fly-out, whose scale is
not yet known.

### 8.3 The script

`scripts/build-mascot.mjs` — in the repo, run manually. `@gltf-transform/{core,extensions,
functions}` + `meshoptimizer` + `draco3dgltf` added to `devDependencies` (never shipped to the
client); `sharp` is already a runtime dependency, reused as the texture encoder. Kept in the
repo so the asset is reproducible — confirmed: re-running it produces `public/models/
mascot.draco.glb` byte-for-byte.

**⚠️ The source UVs carry `KHR_texture_transform` with `scale ≈ 16`** — the texture tiles
16×. Any pipeline step that touches UVs or textures must be verified by re-rendering and
comparing against the source, never assumed. A silently dropped transform smears the whole
skin. The prototype's `build-mascot.mjs` preserves it (`@gltf-transform` handles it); the
build must keep a render-compare check that would catch a regression.

### 8.4 Rendering

`MascotEngine` uses `RoomEnvironment` (a `three/examples/jsm` procedural room, no asset bytes)
through a `PMREMGenerator` for the environment map. Brass is fully metallic — metals have no
diffuse term, so with no environment to reflect the model renders essentially black.
`ENV_INTENSITY` and `LIGHT_INTENSITY` are CMS-tunable over that. Key light and hemisphere
match `LogoEngine`'s own (`0xfff8ec` / `0xcfc5b2` hemisphere, white directional from
upper-right, ACES tone mapping, sRGB output), so the mascot reads as lit by the same room as
the mark.

The eyes do **not** glow — the amber is painted into the baseColor texture, there is no
emissive map. **Default: ship without a glow**, matching "photoreal brass, as authored". At
orbit size the eyes are most of the character and a real glow (an emissive mask derived from
the baseColor amber, applied in the build script) would carry it a long way — so surface this
to the owner on screen during the build as a yes/no, and only add it on an explicit yes. Not
in the prototype.

## 9. CMS design

The prototype has **no** CMS surface. This is the substantial new work.

### 9.1 A `mascot` group on `hero-effects`

A new **Mascot** group on the existing `hero-effects` global, alongside separation, ignition
and satellites. Not localized — numbers, identical EN/ID. `LABEL_TEXT` is the one string
field, and it is **not** localized either (see §9.3). Mapped by `resolveMascot.ts`, mirroring
`resolveSatellites.ts` / `resolveIgnition.ts`, with a round-trip check that perturbs **every**
mapped field to a non-default value first — round-tripping defaults against themselves is the
near-tautology the 2026-08-09 review caught in `resolveSeparation.check.ts`.

Field groups follow §5's table: orbit, look, spin, trail, label, hold, behaviour. Hex fields
(`TRAIL_COLOR`, `TRAIL_CORE_COLOR`, `LABEL_COLOR`) get the `ColourSwatch` afterInput component
already used across Hero Effects.

**Every range must be wider than the approved value** (§5.3), and **the bench must not be able
to produce a value the CMS rejects** — the `outerRadius`-to-3 lesson from the satellites.

### 9.2 What is inherited, not exposed

`TILT`, `TILT_SIDEWAY`, `PERSPECTIVE`, `ORBIT_DIR`, `ORBIT_SPEED` (as a base for
`SPEED_SCALE`), and the hold-charge coupling are **read from the satellites' config**, not
duplicated onto the mascot group. The admin UI should state this: *the mascot shares the
satellites' orbital plane; changing the satellites' tilt or direction moves the mascot too.*

### 9.3 `LABEL_TEXT` is not localized, deliberately

`SAMSARA` is a Sanskrit/Javanese concept word, presented identically in both locales — the
same treatment as the `line1`/`line2` Javanese mottos, which are also seeded identically EN
and ID. A localized field here would invite a translation that shouldn't exist. If the owner
later wants a per-locale mascot name, that is a field-type change, not a config tweak.

### 9.4 Kill switch

`mascotEnabled` checkbox, following `separationEnabled` / `ignitionEnabled` /
`satellitesEnabled`.

**It must gate the layer itself, not merely its parameters.** This bug class has shipped
**three times** on this project (a switch gating only a lead time, one gating only a parameter
path, and the satellites' own near-miss). The prototype's check already asserts the correct
behaviour and the build must keep it: with the switch off, **the mascot canvas and label node
are absent from the DOM entirely, no WebGL context is created, and `mascot.draco.glb` is never
fetched** — verified in both polarities, not by reasoning about the code.

`MascotLayer` returning `null` when disabled (rather than rendering a hidden canvas) is how
the prototype achieves this; keep it.

### 9.5 The 531 KB asset load must not touch the critical path

`mascot.draco.glb` loads **after** the logo is live, never racing `logo.draco.glb`. A failure
loading it must leave the hero exactly as it was — no mascot, everything else untouched. The
prototype's `MascotEngine.load()` is deliberately not awaited by anything on the hero's
critical path and swallows load errors to a `console.error`. The build must test the failure
path (stall or 404 the GLB) and confirm the rest of the hero is unaffected — the same
discipline as the ignition's stalled-`logo.draco.glb` test.

## 10. Degradation

- **Reduced motion:** one static frame, no rAF loop, no dust emission (a motion wake on a
  deliberately motionless frame would be a lie about what is happening). The frame must be
  **non-empty** — assert the mascot is placed on screen, not just that the canvas is
  byte-stable. The satellites shipped a "static frame" that was very nearly blank; do not
  repeat it.
- **Scroll:** dissolves over the first `SCROLL_FADE_VH 0.6` viewport heights, same as the
  satellites. This is also the seam the deferred fly-out will replace — see §13.
- **WebGL context loss / exhaustion:** `MascotEngine.dispose(releaseContext = false)` by
  default. `forceContextLoss()` on a reused canvas **permanently poisons it** (2026-08-10
  note). Only the bench, which keys `<canvas key={nonce}>`, passes `true`. Bench rebuilds
  debounced 220 ms. This adds a **second** WebGL context to the hero (logo + mascot); the
  build should confirm the pair sits well under the ~16-context browser cap even across
  navigation churn.
- **No WebGL at all:** the hero already degrades to a plain logo handoff. The mascot layer
  simply does not appear. Verify it fails silently.

## 11. Known limitation — per-pixel sorting against beads

The mascot is on its own canvas, so it **cannot depth-sort per-pixel against the satellite
beads** — only per-layer. When mascot and bead overlap on screen and are on the same layer,
the mascot's canvas always paints over the satellites' canvas (it is later in the DOM), so the
mascot is wholly in front regardless of true depth.

This was the one real weakness of choosing B over A. It is currently **not visible** — see
§5.1: `HEIGHT 136` biases the mascot toward the viewer, so on the rare overlapping frame it
genuinely is nearer. Measured 0.0% wrong across 420 samples.

**If it ever shows** (someone drops `HEIGHT`, widens the mascot, or narrows the belt), the fix
is geometry — more height, or a wider mascot orbit — **not** new code. The build must not
attempt a real depth merge between the two layers; that road leads back to option C.

## 12. Verification

Headless Chrome via `puppeteer-core`. Scripts written for the prototype, to be promoted into
`docs/superpowers/verification/`:

| Script | Asserts |
|---|---|
| `mascot-capture.mjs` | orbit direction by cross-product sign; layer-flip count; fps; console errors; contact sheet |
| `mascot-occlusion.mjs` | body parked on the mark contributes ≫ pixels in front vs behind, `prefers-reduced-motion` frozen first |
| `mascot-guards.mjs` | kill switch off → no canvas, no GLB fetch; on → one fetch, 531 KB, >30 fps; reduced motion byte-stable + non-empty |
| `mascot-sorting.mjs` | overlap-with-bead % and wrong-sort % across three viewports |
| `mascot-label.mjs` | label vs satellite-word collision %; edge-clip count; label crossing the mark stays on top |
| `mascot-degradation.mjs` | scroll fade; failed-GLB path leaves the hero intact |

Numeric assertions over screenshots. Orbit direction through a tilted perspective projection
is genuinely easy to get backwards by eye — assert the cross-product sign.

Plus the standing gates: `tsc --noEmit`, `verify:config` (with the new mascot suites), SSR 200
on both locales, and a **real `npm run build`** — the bench's query-string override effect
uses `window.location` specifically to avoid the `useSearchParams` / missing-Suspense failure
that only shows under `next build`, and the build must confirm that holds.

**⚠️ `npm run build` alongside a live `npm run dev` corrupts `.next` for the running server**
(hit twice on the satellites work, and once already this session — `SyntaxError ... after JSON
at position 358` out of `loadManifest`). Stop dev, `rm -rf .next`, build, `rm -rf .next`,
restart dev.

## 13. The fly-out — deferred, but designed for

The owner's brief includes: *when the hero is scrolled, the mascot flies out of its orbit into
the next section* — where a mouse-reactive storytelling concept will replace the manifesto.
**That section does not exist yet, so the fly-out is out of scope for this spec.** Building an
exit toward a destination that isn't there is how it gets rebuilt.

What this design does to keep it cheap later:

- **Option B was chosen partly for this.** A real WebGL layer can do an arbitrary 3D exit
  path; a sprite atlas could not.
- **The orthographic camera is swappable.** §4.3 — a dramatic toward-camera rush changes only
  the camera and `place()`.
- **`SCROLL_FADE_VH` is the seam.** Today the mascot dissolves there with the rest of the
  belt. The fly-out replaces that dissolve with a trajectory; nothing else about the layer
  needs to change.
- **The mascot already lives in `MascotLayer`, a hero child.** The fly-out will need it to
  outlive the hero's `overflow: hidden` clip and the hero section itself — likely by hoisting
  the layer to sit above the hero in the tree, or into the page shell. That is a
  **positioning** change to one component, planned when the target section is designed, not a
  rewrite of the engine.

The hero section is `overflow: hidden` today ([HeroBlock.tsx](../../src/components/blocks/HeroBlock.tsx)),
so nothing rendered inside it can currently fly out. That is fine — it is the first thing the
fly-out spec will address.

## 14. Out of scope

- **Sound.** No audio layer exists; `size / speed / sound / trail` from the brief becomes
  `size / speed / trail` here, with sound its own later spec (it needs a shell-level mute
  control and an autoplay-gesture strategy).
- **The fly-out and the storytelling section** — §13.
- **Emissive eyes** — §8.4: default is no glow; add only on an explicit owner yes during the
  build.
- **Any change to the satellites, separation, or ignition.** This shares the satellites'
  projection and the logo's charge signal; it alters neither. The `project.ts` extraction is
  behaviour-preserving.
- **A second mascot, or a mascot population.** One hard-coded object, by decision.
