# Hero Mascot — Animated LED Eyes — Design

**Date:** 2026-08-28
**Status:** prototype built and owner-tuned on screen across three rounds; every shape and
colour in §5 is approved. This spec documents the approved result and what the real build must
add — CMS fields, a frozen-defaults check suite, and verification.
**Branch:** `feat/hero-mascot` (not merged; `main` is at `ac6687e` and untouched)
**Relation to prior work:** additive to the mascot
([2026-08-28-hero-mascot-design.md](./2026-08-28-hero-mascot-design.md)). The mascot's orbit,
size, spin, trail and label are unchanged. This adds a face to the object already orbiting.

Gives the mascot an animated amber LED face — twelve eye shapes plus two composed states,
drawn into the mascot's own material, playing one expression per orbit pass and reacting to
the hold-to-separate gesture.

---

## 1. Why this spec exists in this order

The 2026-08-10 orbiting-orbs build passed every technical gate and was rejected anyway, on
looks alone, after 7 of 10 tasks. The satellites inverted that: prototype on screen first,
spec written around tuned values. The mascot did the same. **This is the fourth time, and it
paid the highest dividend yet** — see §3, where two of the fourteen expressions turned out to
be *unbuildable* with the parameter set a paper spec would have frozen.

Every number in §5 was set live at `/dev/mascot` by the owner and pasted back as JSON.
Anything in this document not validated on screen is marked as such.

---

## 2. Owner's decisions

| Decision | Value |
|---|---|
| Colour | **Amber** `#F2A81C` with a `#FFF0BE` core — *not* the reference video's cyan, so the hero keeps ONE warm accent rather than gaining a second, cold one. |
| Socket | **Pure black** `#000000`, spanning `1.34` — wider than the display, to cover the mascot's *painted* amber ovals so the new eyes are not ringed by the old ones. |
| Spin | **Unchanged at `SPIN_SPEED 113`.** Owner was shown the visibility maths (§4.4) and chose "eyes flash past" over billboarding, cursor-tracking, or slowing down. **Do not re-litigate.** |
| Beat | **One expression per orbit pass**, triggered by the face turning toward the viewer. No idle timer. No cursor tracking. |
| Hold reaction | Eyes widen as the separation charge builds, squeeze shut at the peak. |
| Vocabulary | **14 states**: neutral, blink, squint, wide, happy, wink, and eight gaze directions. |
| `wink` | **Not one eye closed.** Left eye stays open; right does a shallow crescent smile — a knowing, one-sided look. Retuned deliberately in round three. |
| `angry` | **Removed** at the owner's request. There was never a `sad`; `squint` is the nearest and is kept. |
| CMS scope | **Look, beat and glance weights are editable; the 105 shape numbers are frozen in code.** See §7. |

---

## 3. What live tuning caught that a paper spec would have shipped

Three findings, each of which would have survived a written review and failed on screen.

### 3.1 Six expressions were structurally impossible, not badly tuned

The original shape model had `dx` for horizontal offset. **The shader multiplies `dx` by each
eye's side sign**, so it controls *separation*, not position: `lookLeft`'s `dx: -0.15` pulled
the two eyes 0.15 **closer together** rather than moving them left. Every `look*` direction
was wrong, and no amount of tuning could fix any of them, because the parameter set contained
no shared horizontal axis at all.

Fixed by adding `gaze` — an un-mirrored offset that slides both eyes the same way. `dx` now
means separation, `gaze` means direction. `dy` was already shared, which is why the vertical
half of each diagonal had looked half-right and disguised the problem.

### 3.2 The smile needed a new primitive, not a new value

The owner's reference frame showed **hollow crescents tapering to a point at each end**. The
model had `smile`, which bowed the lower edge of a *solid* ellipse — that can only ever
produce a fat blob. A crescent is a subtraction, and no deformation of a single shape reaches
it.

Replaced `smile` with `crescent`: subtract a copy of the ellipse offset downward, leaving an
arc. Nothing was lost — all four already-approved expressions had `smile: 0`.

### 3.3 Proportion mattered more than the carve

The first crescent carved `neutral`'s tall footprint (`h 0.68`) and produced two vertical
commas, not a smile. The reference's arcs are **wide and shallow**. `happy` drops to `h 0.47`
with `w` left wide.

### 3.4 A methodology note worth keeping

Mid-session the crescents were diagnosed as rendering "hollow rings", and the hot-core shading
was changed to fix it. **At 715 px they were solid all along** — the ring was an artifact of
judging a ~100 px face in a contact-sheet thumbnail. The shading change made no visible
difference in a side-by-side and was reverted rather than kept on the strength of the
argument.

**Rule for whoever tunes this next: zoom before diagnosing.**
`docs/superpowers/verification/eyes-zoom.mjs` renders one expression at 715 px.

---

## 4. Architecture

### 4.1 Drawn in the mascot's own material, not on a quad

Measured on both the source and shipped models: the mascot's front cap is a **smooth spherical
disc of radius ~0.50 model units** (per-bin z-spread ≤ 0.014), curving from z 0.850 at centre
to 0.759 at its rim. Past r = 0.50 the spread jumps to 0.048–0.077 and the ornamental bezel
relief begins. **There is no eye cavity** — the "recessed socket with amber eyes" is entirely
painted, in baseColor plus the normal map.

A flat quad in front of that dome would float ~0.09 units proud at its rim — about 3.5 px of
visible detachment at closest approach — and would poke through the bezel at grazing angles.
So the display is drawn **on the surface**, in the mascot's own `MeshStandardMaterial` via
`onBeforeCompile`, the same idiom `shatterMaterial.ts` uses for the logo. Consequences, all
free:

- it follows the curvature exactly
- it is hidden when the face turns away — it is simply a backface
- it scales with the mascot at no cost, and adds **no draw call**

### 4.2 Object space, not UV

The mascot's UV atlas is chunked *and* tiles 16× (`KHR_texture_transform` scale ~16), so UVs
cannot locate the face. Object-space `xy` on the front cap can, and is stable under any spin.

### 4.3 ⚠️ `position` cannot be used raw in the vertex stage

The shipped GLB carries `KHR_mesh_quantization`, so the attribute the vertex shader sees is in
quantized integer space, **not** the ±1 model units the faceplate was measured in — the
dequantisation lives in the node matrix, downstream of this stage.

Feeding raw `position` to the disc mask makes every fragment fail `r > 1.0`, and **the display
silently never draws: the shader compiles clean, throws nothing, and shows the painted eyes as
if the feature were simply absent.** Fixed by normalising through the geometry's own bounding
box (`uObjCenter` / `uObjScale`).

Two corollaries the build must keep:

- The fragment hook **asserts its needle exists** before `.replace()`. A `.replace()` with an
  absent needle is a silent no-op — exactly how this failed the first time.
- `half` is a GLSL reserved word. It cost one compile cycle.

### 4.4 The visibility budget — measured, and deliberately accepted

At the approved `SIZE 28` with `DEPTH_SCALE 0.3`:

| | value |
|---|---|
| Body diameter, far side of orbit | **12.6 px** |
| Body diameter, closest approach | **70 px** |
| One eye, smallest | **2.5 × 3.3 px** |
| One eye, largest | **14 × 18 px** |
| Full revolution at `SPIN_SPEED 113` | **3.2 s** |
| Face toward viewer | **~25% of each rotation**, under a second at a time |
| Expressions visible | **~12% of the time, in sub-second glimpses** |

**The owner was shown these numbers and chose to keep 113°/s.** Expressions must therefore
stay coarse silhouette changes; subtlety is invisible by construction.

**One measurement softens that, and must not be over-read.** Every expression was downsampled
to 12.6 / 28 / 70 px and all 66 pairs compared: **zero collisions at every size** — no two
expressions become the same picture, and even the weakest (blink vs neutral) stays clear. The
near-black socket behind bright amber gives enormous contrast, so shape changes survive
downsampling.

That proves no two expressions are *identical* at size. It does **not** prove a viewer reads
fourteen distinct feelings at 12.6 px, where the display is ~6 px across; what survives there
is *that something changed*, not *which*. The method also downsamples a large render rather
than rendering small, so it is an optimistic bound.

---

## 5. Approved configuration

### 5.1 The shape model

Seven parameters per eye. Packed into the existing 12-float uniform slots, so the uniform
layout does not change.

| Field | Slot | Mirrored? | Meaning |
|---|---|---|---|
| `dx` | 0 | **yes** (× side sign) | **Separation** on top of `GAP`. Positive pushes the eyes apart. |
| `dy` | 1 | no | Shared vertical offset. |
| `w` | 2 | — | Half-width of the ellipse. |
| `h` | 3 | — | Half-height. |
| `lean` | 4 | **yes** | Degrees. Positive leans each eye's top outward. |
| `crescent` | 5 | — | Carves an arc by subtracting a copy offset down by `crescent × h`. 0 = solid. |
| `gaze` | 6 | no | **Shared horizontal offset** — a sideways glance. |

An eye's centre sits at `((GAP + dx) × side + gaze, dy)`.

### 5.2 Look and beat

| Key | Value | Note |
|---|---|---|
| `COLOR` | `#F2A81C` | amber body |
| `CORE` | `#FFF0BE` | hot centre |
| `SOCKET` | `#000000` | pure black |
| `GLOW` | `0.55` | |
| `GAP` | `0.38` | half-distance between eye homes |
| `SOCKET_SPAN` | `1.34` | see §6 — **no headroom left** |
| `FACE_RADIUS` | `0.50` | **measured, not taste.** Not CMS-exposed. |
| `SCANLINE_MAX` | `9` | |
| `SCANLINE_MIN_PX` | `44` | body diameter below which scanlines are off |
| `SCANLINE_RAMP` | `12` | px of diameter per extra line |
| `GLANCE_SECONDS` | `0.60` | one glance, start to resolved |
| `GLANCE_PEAK` | `0.45` | where in the glance the expression peaks |
| `FACING_THRESHOLD` | `0.30` | `cos(spin)` above which the face counts as toward the viewer |
| `CHARGE_CROSSOVER` | `0.70` | charge at which the hold reaction goes wide → shut |
| `NO_REPEAT` | `false` | |

`SCANLINE_MIN_PX 44` sits above the 28 px base size, so scanlines appear only over the nearer
part of the orbit, where the body exceeds 44 px on its way to 70. That is intended: 7 lines
across an 18 px eye is moire, not texture. They fade in with size rather than switching on, so
the transition cannot pop.

### 5.3 The fourteen expressions

`right: null` means mirror `left`. Only `wink` differs per eye.

| Name | dx | dy | gaze | w | h | lean | crescent |
|---|---|---|---|---|---|---|---|
| `neutral` | 0.25 | 0.09 | 0 | 0.42 | 0.68 | 0 | 0 |
| `blink` | 0.26 | 0.05 | 0 | 0.40 | 0.03 | 0 | 0 |
| `squint` | 0.21 | 0.20 | 0 | 0.60 | 0.11 | 0 | 0 |
| `wide` | 0.21 | 0.17 | 0 | 0.60 | 0.78 | 0 | 0 |
| `happy` | 0.25 | 0.10 | 0 | 0.45 | 0.47 | 24 | 0.30 |
| `lookLeft` | 0.18 | 0.09 | −0.35 | 0.38 | 0.60 | 0 | 0 |
| `lookRight` | 0.18 | 0.09 | 0.36 | 0.38 | 0.60 | 0 | 0 |
| `lookUp` | 0.11 | 0.50 | 0 | 0.38 | 0.56 | −19 | 0 |
| `lookDown` | 0.12 | −0.50 | −0.01 | 0.38 | 0.52 | 25 | 0 |
| `lookUpLeft` | 0.08 | 0.46 | −0.30 | 0.38 | 0.57 | 0 | 0 |
| `lookUpRight` | 0.07 | 0.38 | 0.28 | 0.38 | 0.57 | 0 | 0 |
| `lookDownLeft` | 0.09 | −0.37 | −0.34 | 0.38 | 0.52 | 11 | 0 |
| `lookDownRight` | 0.08 | −0.45 | 0.29 | 0.38 | 0.52 | 12 | 0 |
| `wink` **L** | 0.26 | 0.11 | 0.03 | 0.39 | 0.49 | −1 | 0 |
| `wink` **R** | 0.25 | 0.04 | −0.05 | 0.45 | 0.44 | 0 | 0.22 |

**⚠️ The asymmetries are deliberate and were confirmed as such.** `lookUpLeft`/`lookUpRight`
differ in `dy` (0.46 vs 0.38); `lookDownLeft`/`lookDownRight` differ in `dy` and `gaze`
magnitude. A future pass must not "tidy" these into mirrors.

### 5.4 Glance weights

Relative frequency in the pool. `0` removes an expression from the beat entirely.

| | weight | | weight |
|---|---|---|---|
| `neutral` | 0 | `lookUp` | 1 |
| `blink` | **2** | `lookDown` | 1 |
| `squint` | 1 | `lookUpLeft` | 1 |
| `happy` | 1 | `lookUpRight` | 1 |
| `wide` | 0 | `lookDownLeft` | 1 |
| `lookLeft` | 1 | `lookDownRight` | 1 |
| `lookRight` | 1 | `wink` | 1 |

`neutral` is the rest state and `wide` belongs to the hold reaction, so neither plays as a
glance. An empty pool must leave the face at rest, not fall back to an expression the owner
removed on purpose.

---

## 6. ⚠️ Socket clearance — no headroom left

The shader **hard-returns** when `r > SOCKET_SPAN`. There is no fade: anything past it is cut
with a sharp edge. Measured rim reach against the approved `SOCKET_SPAN 1.34`:

| Expression | reach | margin |
|---|---|---|
| `lookUpLeft` | 1.35 | **−0.01 — clipped** |
| `lookDownRight` | 1.34 | 0.00 |
| `lookDownLeft` | 1.33 | 0.01 |
| `lookRight` | 1.31 | 0.03 |
| `lookLeft` | 1.30 | 0.04 |
| `lookUpRight` | 1.27 | 0.07 |
| everything else | ≤ 1.25 | ≥ 0.09 |

The `lookUpLeft` overshoot is ~0.01 display units — **1.7 px at 715 px, a fraction of a pixel
at ship size, and invisible today.** It is recorded because the margin is gone: raising any
`gaze` or `dy`, or lowering `SOCKET_SPAN`, turns it into a visible flat cut. **Raising
`SOCKET_SPAN` past 1.34 is the release valve.**

Note also that every expression reaches past `r = 1.0` — the smooth cap — onto the bezel
relief. That is a consequence of the owner's approved eye sizes and is covered by the socket
darkening. It is accepted, not a defect.

---

## 7. CMS design

### 7.1 What is exposed — and what is not

**Owner's decision:** look, beat and glance weights are CMS-editable. **The 105 shape numbers
are frozen in code.**

The reasoning, recorded so it is not relitigated: editing `lookDownLeft.gaze` in a Payload form
with no mascot on screen is not a workflow anyone can succeed at. These shapes took a live
bench and three rounds. They are the *design of the character*, not content. Exposing them
would also add ~105 columns to a global that already carries ~160 fields, on a project that has
twice been blocked by stale `__new_` Drizzle temp tables.

This mirrors `DEFAULT_SATELLITES`: frozen defaults, pinned by a check suite, with the CMS
exposing what a person can meaningfully judge.

**Consequence to state plainly in the admin UI: changing an expression's shape requires a code
change.** The bench at `/dev/mascot` remains the tool for it.

### 7.2 Fields — a `mascotEyes*` set on `hero-effects`

Following the existing `mascot*` grouping exactly.

| Field | Type | Contents |
|---|---|---|
| `mascotEyesEnabled` | checkbox | kill switch — see §7.4 |
| `mascotEyesLook` | group | eye colour, core colour, socket colour, glow, gap, socket span |
| `mascotEyesScanlines` | group | max, min body px, ramp |
| `mascotEyesBeat` | group | glance seconds, peak, facing threshold, charge crossover, no-repeat |
| `mascotEyesWeights` | group | one 0–4 number per expression (14) |

≈ 29 fields. `FACE_RADIUS` is deliberately **absent**: it is a measured property of the model
(0.50), and a CMS field inviting someone to move it would only ever break the mask.

Colour fields use the existing `ColourSwatch` `admin.components.afterInput` pattern.

### 7.3 ⚠️ Generous ranges

This project has already shipped an owner-approved value sitting exactly on its own slider
ceiling (the ignition's `wireSpeed`, flagged across three sessions before being confirmed).
Every range must clear the approved value with room:

- `socketSpan` → **0.3–2.5** (approved 1.34, and §6 says the release valve is upward)
- `glow` → 0–2 (approved 0.55)
- `gap` → 0–0.9 (approved 0.38)
- `glanceSeconds` → 0.1–3 (approved 0.60)
- weights → 0–4 (approved max 2)

### 7.4 Kill switch

**This bug class has now shipped three times on this project** — a switch gating only a lead
time, one gating only a parameter path, each leaving the effect running in a state *worse* than
the switch promised to restore.

`mascotEyesEnabled: false` must leave the mascot rendering **exactly as it did before this
feature existed**: painted eyes visible, no socket darkening, no display. Concretely, the
shader chunks must not be injected at all — not merely `uEyesOn = 0`, which would still leave
the socket mask compiled into the material and the painted ovals covered.

The check asserts both polarities against the live hero.

### 7.5 Resolver

`resolveMascotEyes.ts`, mirroring `resolveMascot.ts`: hand-written input type (every field
optional and nullable, since Payload returns nulls for never-saved fields), merged over frozen
defaults, hex validated against `/^#[0-9a-fA-F]{6}$/`, numbers guarded with `Number.isFinite`.

**Its check suite must perturb every mapped field to a non-default value before round-tripping.**
Round-tripping defaults against themselves is a near-tautology — the exact weakness the
2026-08-09 review found in `resolveSeparation.check.ts`.

---

### 7.6 Modules — and what happens to the prototype

The prototype carries two throwaway pieces that the real build must resolve rather than leave
lying around.

| Module | Fate |
|---|---|
| `lib/mascot/eyes.ts` | **Kept.** Holds `EyeShape`, the packing/lerp helpers, the GLSL chunks, and the frozen `EXPRESSIONS` table — now the approved values, pinned by `eyes.check.ts`. |
| `lib/mascot/eyeTuning.ts` | **Replaced** by `lib/mascot/eyeTypes.ts` — a frozen `DEFAULT_MASCOT_EYES` in the shape of the CMS surface only (look, scanlines, beat, weights). The prototype's `shapes` map goes away; shapes are read from `EXPRESSIONS` directly. `pickWeighted` and `cloneEyeTuning` move to the kept module. |
| `lib/mascot/resolveMascotEyes.ts` | **New.** §7.5. |
| `dev/mascot/EyePanel.tsx` | **Kept**, retargeted at the new config type. It is the only tool for shape work (§7.1), so deleting it would strand the frozen values. It stays dev-only — `/dev/*` already `notFound()` in production. |
| `MascotEngine.setInspect` + inspect mode | **Kept**, bench-only. Tuning needs the face big, still and frontal; the shipped mascot is 12.6–70 px and spinning. Inspect opts out of the depth cue deliberately — leaving it on made "diameter 320" draw a 144 px body. |

`MascotEngine.setEyeTuning` becomes `setEyeConfig(MascotEyesConfig)`, threaded
`RenderBlocks → HeroBlock → LogoStage → MascotLayer → MascotEngine` as an explicit prop, exactly
as `separation` and `mascot` are. **Not a singleton** — `MascotLayer` is behind
`dynamic(ssr:false)` and can mount before CMS values land, which is why the separation config
was made an explicit prop in the first place.

## 8. The beat

### 8.1 Glance on each pass

The face is toward the viewer for ~25% of each 3.2 s rotation. Firing expressions on a timer
would spend most of them pointing at the back of the hero. So **the sweep is the beat**: when
`cos(spin)` rises past `FACING_THRESHOLD`, one expression is picked from the weighted pool and
played as a triangle — neutral → expression → neutral — over `GLANCE_SECONDS`, peaking at
`GLANCE_PEAK`. The beat is slightly shorter than the face-forward window so it lands and
resolves while it can be seen.

`NO_REPEAT` drops the previous pass's expression from the running total rather than re-rolling,
so a pool whose only positive weight *is* the avoided entry still returns something instead of
spinning.

### 8.2 Press-and-hold

Riding the same separation charge the body already reacts to, pulled through the existing
`chargeRef` getter — the eyes add no new coupling to `LogoEngine`.

- `charge < CHARGE_CROSSOVER` → blend `neutral` → `wide`
- `charge ≥ CHARGE_CROSSOVER` → blend `wide` → `blink` (squeezed shut at the peak)

### 8.3 Reduced motion

The mascot already renders a single static frame under `prefers-reduced-motion`. The eyes must
render `neutral` in that frame — present and correct, not blank, and not mid-glance. The site
honours this preference in 19 places; a visitor who asked for stillness must not get a
blinking face.

---

## 9. Verification

Extending `docs/superpowers/verification/`. **The in-app browser pane cannot verify any of
this** — it reports the tab hidden and throttles `requestAnimationFrame` to ~1 Hz, which stalls
the engine's own clock. Headless Chrome via `puppeteer-core` throughout.

| Script | Asserts |
|---|---|
| `eyes-render.mjs` | All 14 expressions render, and **all 66 pairs are distinct** — the guard against the §4.3 silent-shader failure, where nothing throws and the painted eyes show through. |
| `eyes-legibility.mjs` | Pairwise distinctness holds at 12.6 / 28 / 70 px. |
| `eyes-clearance.mjs` | Every expression's rim reach vs `SOCKET_SPAN`; fails on a **new** overshoot beyond the recorded `lookUpLeft` baseline. |
| `eyes-beat.mjs` | One expression per pass; returns to neutral; hold drives wide → shut. |
| `eyes-kill-switch.mjs` | Both polarities: OFF leaves the painted eyes untouched with no socket darkening. |
| `eyes-reduced-motion.mjs` | Static frame shows `neutral`, non-blank. |
| `eyes-zoom.mjs` | Renders one expression at 715 px. **Not an assertion — a tool**, because §3.4 was caused by diagnosing from thumbnails. |

Two traps to carry into any new script:

- **`BOB_PX` must be 0 for any pixel-diff comparison.** With the default bob the body drifts
  vertically between screenshots and the diff measures *that*, not the eyes. It produced a
  near-uniform 44–62 across every expression — three assertions passing for the wrong reason.
- **Wait for the condition, never sleep a fixed time, when asserting something happened.** A
  fixed 6 s sleep in `mascot-kill-switch.mjs` raced a cold 530 KB GLB fetch and reported "model
  never fetched" on a build where it loads fine. The inverse also holds: when asserting nothing
  *ever* happens, only elapsed time can support it, so the OFF polarity keeps its fixed sleep.

`verify:config` gains `eyes.check.ts` (packing, lerp, weighted pick, mirrored-vs-shared
semantics) and `resolveMascotEyes.check.ts`. Current baseline is **625 assertions, 0 failures** —
it must not drop.

---

## 10. Degradation

- **Shader compile failure** → the mascot must still render with its painted eyes. The display
  is additive to an existing material; it must never be able to blank the body.
- **Missing/short uniform array** → falls back to the frozen expression, never `NaN`.
- **An expression name not in the tuning** → resolves through the frozen table (`exprOf`).
- **Empty glance pool** → face rests at `neutral`.

---

## 11. Out of scope

- **Cursor tracking and billboarding.** Considered, measured, declined by the owner in favour
  of keeping `SPIN_SPEED 113`.
- **Idle timer.** The orbit pass is the only trigger.
- **Sound.** The site has no audio layer.
- **Mouth, brow, or any second display element.** Eyes only.
- **Per-locale expression sets.** The face is not language.
- **Making shapes CMS-editable.** §7.1. Revisit only if the owner asks for it directly.
