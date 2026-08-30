# Hero to Section 2: the SAMSARA transition — Design

**Date:** 2026-08-30
**Status:** approved in brainstorming; tuning values pending the bench freeze gate (§9)
**Supersedes nothing.** Extends the shipped mascot (`2026-08-28-hero-mascot-design.md`)
and its eyes (`2026-08-28-mascot-eyes-design.md`), neither of which is modified.

---

## 1. Why this spec exists in this order

This project has now run the same experiment twice, with opposite results, and the
outcome is a process rule that this spec obeys.

**2026-08-10, orbiting orbs.** Spec approved on paper. Built through 7 of 10 tasks.
Every gate green — `verify:config` clean, typecheck clean, SSR 200, no console errors.
The owner saw it live and rejected it outright: *"it looks horrible and far from what I
imagine."* Nothing was broken. A description had been approved; the thing the
description produced had not.

**2026-08-26, satellites.** Deliberately inverted. A throwaway prototype went on screen
first behind a live tuning bench, the owner tuned the real visual parameters live, and
the spec was written *around* values already approved on screen. It shipped.

The SAMSARA transition is at least as visual as either. So this spec fixes the
**architecture** — everything agreed across the brainstorm — and deliberately does
**not** fix the look. Tuning values appear here only as *starting values* behind a named
freeze gate (§9). They are tuned at `/dev/samsara` and pasted into `DEFAULT_SEQUENCE`
before the real build proceeds.

A second, narrower version of the same lesson comes from the eyes: six of the fourteen
expressions were *structurally impossible*, not badly tuned, and only live tuning
exposed it. A paper spec would have frozen a parameter set that could not express half
its own vocabulary. Assume this spec has an equivalent flaw somewhere, and that the bench
is what finds it.

---

## 2. Owner's decisions

Each was asked directly and answered during the 2026-08-30 brainstorm.

| # | Decision | Chosen |
|---|---|---|
| 1 | How scroll drives the sequence | **Counted gestures, then a committed timed fall.** Gestures 1–3 build the freeze; the 4th commits to a fixed-duration cinematic that scroll can no longer scrub |
| 2 | Scrolling back up from Section 2 | **SAMSARA returns to orbit** via a short (~0.8s) exit — not a rewind of the fall. Hero stays mounted |
| 3 | What the dark room is | **A built 3D room** — real geometry, real perspective camera, real lighting |
| 4 | What shakes during the freeze | **3D layers plus a rigid page shake**, ramping per gesture. This is the trionn page-shake deliberately not ported in sub-project 1 |
| 5 | Mobile | **The full cinematic, with portrait tuning.** Not shortened, not skipped |
| 6 | Scope of this piece | **Transition plus a stub chatbox.** No conversation logic |
| 7 | Mobile composition | **SAMSARA lands in the upper area, chatbox below it** (desktop: SAMSARA right, chatbox top-left) |
| 8 | Architecture | **Approach A** — one engine, two cameras, canvas promotes to fixed (§4) |
| 9 | Process | **Prototype first**, then this spec's values frozen from what was approved on screen |

**A reversal recorded deliberately.** On 2026-07-13 the owner removed the "Obsidian"
dark appearance from this site entirely; Atelier paper `#F6F1E7` has been the only
palette since. A dark room reintroduces dark. This was flagged during the brainstorm and
the owner proceeded. Section 2 therefore needs its own palette tokens — it may not reuse
anything that exists — and the removal of Obsidian must not be treated as a bug to
restore.

---

## 3. Scope

**Delivered:** the freeze, the commit, the half-orbit, the camera and canvas handoff, the
fall, three bounces, the settle, SAMSARA idling in the room with blink and smile, the
built room, a stub chatbox panel that animates in on cue, the exit on scroll-up, a CMS
global and a new `samsaraRoom` page block, a tuning bench, and the retirement and
archival of the five homepage blocks below the hero.

The homepage's layout at the end of this work is two blocks: `hero`, `samsaraRoom`.

**Not delivered:** any conversation behind the chatbox. Section 2's manifesto, vision and
mission content. Section 3, which has not been designed.

**Untouched:** `LogoEngine`, `SatelliteEngine`, `eyes.ts`, the orbit behaviour of
`MascotEngine`, and the `/manifesto` route.

---

## 4. Architecture

### 4.1 The bridge problem

SAMSARA renders through an **orthographic camera in CSS-pixel units**, on a canvas
parented *inside* the hero, which is `overflow: hidden`. That canvas's `z-index` flips
0 to 2 so the mascot can pass behind the mark.

Each of those three properties is load-bearing, and each obstructs the fall:

- **Orthographic, in pixel units** is why `SIZE 28` means literal on-screen pixels and
  why the mascot provably cannot drift out of the belt. The room needs perspective.
- **Parented inside the hero** is what makes the z-flip sandwich with `LogoStage`
  possible at all. The room is a different section.
- **`overflow: hidden`** means SAMSARA cannot currently leave the hero by any means.

### 4.2 Approach A — one engine, two cameras, canvas promotes to fixed

`MascotEngine` gains a mode: `orbit`, `transit`, `room`. Two swaps carry SAMSARA across,
and each is designed so that it changes nothing visible on the frame it happens:

1. The canvas root goes `position: absolute` (inset-0 within the pinned hero) to
   `position: fixed` (inset-0 within the viewport). A pinned hero *is* the viewport, so
   this is the same rectangle. See §12 risk 2 — this must be measured on mobile, not
   assumed.
2. The camera goes orthographic to perspective, with FOV and distance solved so that
   SAMSARA's projected size at the handoff depth equals its current pixel size.

**Both fire at the commit instant, and §5.6 records why that took two corrections to
establish.** SAMSARA's box clears the mark's by 19.1px at the far point, so the promotion
is a no-op there and it falls IN FRONT of the logo, staying visible. `hasClearedLogo`
remains as a guard against a retune that erases that thin margin. The room's fade-up must
follow the promotion, never precede it.

Everything after the commit is one continuous perspective scene. SAMSARA and the room's
geometry share **one renderer, one scene graph, one loaded model, one eye shader** — so
the mascot casts a real shadow onto the real floor, which is what sells three bounces as
contact rather than float.

The z-flip survives untouched because it only applies in `orbit` mode. Once SAMSARA has
committed to leaving, it is in front of everything and never needs to go behind the mark
again.

### 4.3 Module map

The shipped orbit code is **not** rewritten. `MascotEngine.ts` is 1,021 lines and is
covered by zero unit assertions — all 864 assertions in `verify:config` live in pure
modules, and not one touches an engine. Putting roughly 400 lines of camera-handoff and
bounce math inside it would make the most error-prone code in the feature the least
testable code in the feature.

New modules. The first five are pure, with no three.js, and are pinned by assertions the
way `satellites/project.ts` already is:

| Module | Responsibility | Pure |
|---|---|---|
| `lib/samsara/types.ts` | Frozen `DEFAULT_SEQUENCE` and defaults | yes |
| `lib/samsara/gestures.ts` | Raw wheel and touch events to discrete debounced beats | yes |
| `lib/samsara/cameraHandoff.ts` | Solve perspective params so projected size equals ortho pixel size at the seam | yes |
| `lib/samsara/transitScript.ts` | Progress `t` to position, scale and rotation during the fall | yes |
| `lib/samsara/bounce.ts` | The damped three-bounce arc | yes |
| `lib/samsara/room.ts` | Builds room geometry and lights | no |
| `lib/samsara/SequenceController.ts` | The mode state machine | no |

There is precedent for exactly this move in the repo. The header of
`satellites/project.check.ts` records that the shared orbital projection was pulled *out*
of `SatelliteEngine`'s inline math specifically so it could be pinned. `cameraHandoff.ts`
is the same call for the same reason: matching two projections by eye is the genre of
error this project has been burned by twice — orbit direction had to be asserted via the
sign of a cross product because rotation through a tilted projection reads backwards to
a human, and the "hollow ring" eye bug was misdiagnosed from thumbnails and half-fixed
before a 715px render showed the crescents had been solid all along.

**Additive surface on `MascotEngine`:** `setMode()`, `setCameraMode()`, `setTransform()`,
`setRoomVisible()`. Existing behaviour becomes the `orbit` branch, unchanged.

### 4.4 The transform and overflow collision

A `position: fixed` element is **not** clipped by an ancestor's `overflow: hidden` —
*unless* an ancestor carries a `transform`, which makes that ancestor the containing
block and restores clipping.

The rigid page shake (decision 4) is a transform on the hero. Left naive, it would trap
SAMSARA inside the hero and clip the fall at the hero's bottom edge — and it would do so
*only while shaking*, which is exactly the kind of intermittent bug that survives casual
testing.

**Resolution:** the shake transform goes on an **inner wrapper** containing the headline,
logo and satellites. `MascotLayer` is a sibling *outside* that wrapper. SAMSARA then has
no transformed ancestor, and the shake still moves everything a viewer reads as "the
page." Cost: one `div`. Guarded by `samsara-fixed-clip.mjs` (§11).

### 4.5 Context budget

Unchanged at **2** live WebGL contexts — `LogoEngine`, and the shared SAMSARA and room
renderer. The satellites' two canvases remain 2D. This matters: the owner has already hit
`FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS` on this project once, and `forceContextLoss()`
is not the fix — it permanently poisons the canvas element.

### 4.6 Approaches rejected

**Two engines with a handoff at the seam.** Hero keeps `MascotEngine` byte-for-byte;
Section 2 gets a separate `RoomEngine` with its own canvas and its own mascot instance.
Rejected because `overflow: hidden` means SAMSARA *vanishes* at the hero's edge and
reappears in the room — a genuine discontinuity, where the requirement is a continuous
fall. It also costs a third WebGL context and forces the eye shader to be injected and
kept in sync in two places.

**A fixed full-viewport SAMSARA layer above everything.** Rejected because a layer above
everything can never pass *behind* the logo, which destroys the orbit's z-flip — the most
load-bearing property of the shipped mascot. Recorded so it is not rediscovered.

---

## 5. The sequence

### 5.1 State machine

```
idle --(hero live + first beat)--> charge1 --> charge2 --> charge3
                                      ^                      |
                                      +-----(beat up)--------+
                                                             |
                                                       (4th beat)
                                                             v
                                                        committed
                                    +-- timed, uninterruptible --+
                                    | half-orbit -> handoff ->   |
                                    | fall -> bounce x3 -> settle|
                                    +------------+---------------+
                                                 v
   idle <--(exit ~0.8s)-- exiting <--(beat up)-- landed
```

`charge1` through `charge3` are reversible: a beat upward steps the charge down, and from
`charge1` it releases the freeze entirely. Only `committed` is one-way — bounce physics
scrubbed backwards at arbitrary speed does not read as physics.

### 5.2 Arming

The sequence arms only when the hero is genuinely live, reusing the existing
`introDone && canvasReady` signal that already gates hold-to-separate. Scrolling during
the 7.67s sketch intro scrolls the page normally and does nothing to SAMSARA.

### 5.3 The page does not move during the hero

Beats 1 through 3 do not scroll the page; gesture 1 *is* the freeze beginning. The risk
is a visitor reading a motionless page as broken, so beat 1 must produce an immediate and
unmistakable response — the shake starting and the charge snapping on.

### 5.4 Gesture normalization

Pure, in `gestures.ts`, unit-tested against synthetic event streams. This is the fiddliest
part of the feature and the clearest argument for its own module.

One mouse-wheel notch is **one** `wheel` event. One trackpad flick is **20 to 50** of them
with decaying deltas. Counting events naively makes a single flick fire the entire
sequence instantly.

**Algorithm:** accumulate `deltaY` into a reservoir, emit a beat when it crosses a
threshold, reset, then hold a cooldown **and** require the delta stream to go quiet before
re-arming. Momentum from one flick cannot produce a second beat.

**Touch** is handled separately and is simpler: accumulate over `touchmove`, emit one
beat at threshold, require `touchend` before the next. One swipe, one beat.

### 5.5 Holding the page

`lenis.stop()` on arm, `lenis.start()` after landing. Lenis alone does not stop native
touch scrolling, so during the sequence the hero also carries `touch-action: none`, a
non-passive `touchmove` `preventDefault`, and `overscroll-behavior: none` to suppress
iOS rubber-banding.

### 5.6 Committed timeline

**"The far point", defined — owner-confirmed 2026-08-30.** The far point is **furthest
from the viewer: the back of the orbit**, at `angle = π/2`, where `projectOrbit()`'s depth
term `z1 = -height·sin(TILT) + radius·sin(angle)·cos(TILT)` is maximal.

This is the reading the owner confirmed, and it is the one that makes the whole sequence
continuous: SAMSARA is already at the back and at its smallest when it drops, which is
precisely why it "falls into the **back** of the room." The three bounces then carry it
forward and larger, so depth runs unbroken from orbit through landing.

**Where that actually puts it.** Worked from the *shipped* values — `TILT 20`,
`TILT_SIDEWAY 160`, `PERSPECTIVE 1300`, `OUTER_RADIUS 1.6`, mascot `RADIUS 0.71`,
`HEIGHT 136` — at 1440×900. The disk carries 160° of roll, which dominates the result and
must not be assumed away:

```
outerR        = (min(1440,900)/2) x 1.6   = 720 px
mascot radius = 0.71 x 720                = 511 px

at angle pi/2 (maximum depth):
  y1    = 136*cos20 + 511*sin20           =  302.6
  z1    = -136*sin20 + 511*cos20          = +433.9    (positive = BEHIND the logo)
  roll 160 deg:
    x3  = -302.6 * sin160                 = -103.5
    y3  = +302.6 * cos160                 = -284.4
  scale = 1300 / (1300 + 433.9)           =  0.750    (SAMSARA at its smallest)

  screen offset from the logo's centre    = (-77.6, -213.2)
```

**SAMSARA's far point is ABOVE the mark and slightly left of it** — not below. It clears
the logo's bounding box (half-height about 184 px) by only ~30 px, and it sits *inside*
the logo's horizontal span. Both margins vary with viewport and must be measured.

### ⚠️ Correction, 2026-08-30 — this section originally drew the wrong conclusion

The paragraphs that stood here claimed SAMSARA would fall **behind** the mark for ~400 px
and that the layer promotion had to wait until it emerged below. Both halves were wrong,
and only running the numbers through the real `projectOrbit` and `transitScript` showed it.
They are recorded rather than deleted, because the reasoning error is the useful part.

**What was claimed:** at the far point SAMSARA overlaps the mark and sits behind it, so
promoting there would pop it in front; therefore gate the promotion on its box clearing
the logo's, roughly 400 px into the fall.

**What is actually true, measured:**

1. **The boxes do not intersect at the far point.** SAMSARA's centre is ~213 px above the
   logo's centre and its own radius is only ~10.5 px, so its lower edge clears the mark's
   box by **19.1 px**. Promoting there is already a genuine visual no-op — the thing §4.2
   promised, just for a different reason than assumed.
2. **SAMSARA never emerges below the mark at all.** With the landed pose at `Y_FRAC 0.52`
   it descends from y ≈ 237 to a floor at y ≈ 478, while the logo's box runs 266–634. It
   stays inside the mark's vertical span for the entire transit. A gate waiting for it to
   pass below **could never fire**, and the check suite caught exactly that.

**Where the error came from:** "falls behind the mark" was an inference from the geometry,
not something the owner asked for. The requirement was only that SAMSARA fall to the next
section. Falling behind would additionally hide it for most of the descent, which is worse
than the alternative.

### Resolution

**SAMSARA promotes at the far point and falls IN FRONT of the mark**, staying visible
throughout, with the room rising beneath it.

`hasClearedLogo` survives as a **guard, not a mechanism**: a plain box non-intersection
test, consulted once at promotion time. With shipped geometry it is true immediately. If a
future retune moves the far point so that it *does* overlap the mark, the promotion defers
until it does not, rather than popping.

Two requirements still follow:

- **The room's fade-up must begin after the promotion**, never before. Starting it earlier
  would cover SAMSARA while it is still drawing on the hero's back canvas.
- **`samsara-seam.mjs` must assert no z-order pop across the promotion frame**, at several
  viewports. **19.1 px of clearance is thin**, it is viewport-dependent, and on a short or
  narrow window it may vanish entirely — which is precisely when the guard has to work.
  `transitScript.check.ts` pins that margin so a retune erasing it fails in milliseconds
  rather than on screen.

Starting values below. Subject to §9.

| Beat | Duration | Notes |
|---|---|---|
| Half-orbit | 0.6s | Eased to the far point over a **fixed** duration regardless of start angle, so everything downstream is deterministic |
| Handoff | 0 | Canvas to fixed, camera to perspective. Invisible by construction |
| Fall | 0.8s | Accelerating; the room fades up beneath |
| Bounce 1 / 2 / 3 | 0.5 / 0.35 / 0.25s | Each lower, each closer to camera |
| Settle | 0.5s | Into the landed hover |
| Chatbox in | 0.4s | Overlaps the settle |
| **Total** | **~3.4s** | |

### 5.7 Hiding the scroll jump

Once the room is fully opaque the hero is no longer visible. Under that cover the page
silently performs `lenis.scrollTo(section2, { immediate: true })` and releases the pin.
The visitor never sees it. The exit reverses this.

### 5.8 Two conflicts with existing code

**Pointer-hold during the sequence.** `ShatterController` disarms hold-to-separate past
a scroll fraction, but during a pin `scrollY` never changes, so pointer-hold would stay
live *during* the cinematic and let the visitor fight the animation. From beat 1 the
sequence **takes ownership of the charge** and pointer-hold is disabled until `idle`
returns.

**`scrollAlpha`.** Both `MascotEngine` and `SatelliteEngine` fade themselves out by
`window.scrollY`. During a pin `scrollY` is constant, so this is inert. Harmless, but it
means the satellites will not fade as they do today — the freeze governs them instead.
Recorded so the change is understood as intended rather than found later as a regression.

### 5.9 Reduced motion

No pin, no gesture counting, no cinematic. Hero and Section 2 are ordinary stacked
sections, and SAMSARA is composed statically in the room, already landed. This is forced:
a scroll-jack must never be the only route to content. The site already honours the
preference in 19 call sites, and the owner's own machine has had it silently enabled
before (Windows "Animation effects" off), which made the whole hero look broken — so this
path will be seen in the wild.

### 5.10 Fail-open

Ordinary scrolling is the default state; the pin engages only once the sequence is fully
ready. If WebGL is unavailable or the model 404s, Section 2 remains reachable by normal
scrolling.

This is not a formality. A kill switch that left an effect half-running has shipped
**twice** on this project — once gating only a lead time, once gating only a parameter
path — each leaving the site in a state *worse* than the switch promised to restore. The
off path gets its own verification in both polarities rather than being assumed.

---

## 6. The room and the landing

### 6.1 Look — deliberately not fixed here

Room palette, lighting values, exact geometry and the feel of the fall are exactly the
questions §1 exists to keep out of prose. They are settled at the bench.

**Starting direction:** graphite on black — the Atelier drawing language inverted, rather
than a photoreal interior. It gives the dark room a reason to exist inside a brand that
deliberately dropped its dark appearance, instead of reading as a different website.
Geometry stays minimal: floor, back wall, side walls implied by falloff rather than hard
edges, no ceiling.

### 6.2 Lighting, with a performance guard

One shadow-casting key light, so SAMSARA drops a real shadow on the real floor.

Shadow maps are where this project lost 5.9 fps once already, to the ember
`gl_PointSize` bug — a common three.js idiom that assumed a far larger world scale and
produced roughly 437px points, about 13,000 of them, additively blended. So: a single
shadow-casting light, a deliberately small shadow map, and frame rate measured via real
rAF deltas the way `fps-ignition.mjs` does. Not eyeballed.

### 6.3 Fall and bounce

`bounce.ts`, pure. Gravity-driven parabola to the floor, then three bounces at a
restitution coefficient giving heights `h`, `e*h`, `e^2*h`, each carrying depth velocity
toward the camera so SAMSARA grows with every contact. After the third bounce it does
**not** come to rest — it rises into a hover, which is the correct ending for a floating
mascot and hands off naturally into the idle.

### 6.4 Landed pose

40% of viewport height in both cases. Desktop: right side. Mobile portrait: upper area,
with the chatbox below. Both are bench constants, never literals in component code.

### 6.5 The spin stops, and the eyes finally pay off

In the hero, `SPIN_SPEED 113` was approved with its cost measured and put to the owner
explicitly: the face points at the viewer roughly 25% of each 3.2s turn, expressions are
legible about 12% of the time, and at the far side of the orbit one eye is 2.5 by 3.3px.
The owner chose "eyes flash past" over billboarding or slowing the spin, and that decision
stands for the hero and is not reopened here.

In the room SAMSARA is stationary, front-facing, at 40% of screen height. **Every
expression approved across three live tuning rounds becomes properly visible for the
first time.**

One mechanism changes as a result. Today an expression fires each time the face sweeps
past the viewer. With no sweep, the room drives a **timed idle loop** instead, reusing the
existing weighted picker with a room-specific weight set: mostly `neutral`, periodic
`blink`, occasional `happy` (the hollow crescent). A smile triggers the vertical bob.

`eyes.ts` is not modified. Only what schedules it changes.

### 6.6 Chatbox stub

Real DOM, not canvas. It will eventually carry a text input, a live-region message list
and focus management, none of which should be retrofitted onto a canvas later. It sits
on a fixed layer above the WebGL canvas and enters on a 0.4s fade and rise overlapping
the settle. Styled and positioned; nothing behind it.

### 6.7 Section 2's DOM for this piece

One `100svh` dark section holding the chatbox. Scrolling up from it triggers the exit.
Nothing sits below it until Section 3 is designed.

---

## 7. CMS

### 7.1 A new global, not more columns on `hero-effects`

`hero-effects` already carries separation, ignition, satellites, mascot and eyes.

Beyond admin-UI manageability, there is a concrete data reason: that global holds
**owner-tuned values that diverge from code defaults** — `satelliteColors` notably, where
the live `identity` slot is `#8A0F44` against `#0f8a75` in `DEFAULT_SATELLITES`. That
divergence is why the eyes fields had to be written through the authenticated REST API
rather than `npm run seed`; a reseed would have overwritten owner tuning. A brand-new
`samsara-sequence` global has nothing to overwrite and can be seeded normally.

### 7.2 Field groups

`gestures` (beats to commit — 3 charge plus 1 commit; wheel threshold; cooldown; touch
threshold) · `freeze` (shake amplitude per beat, charge ramp) · `transit` (half-orbit,
fall, bounce count, restitution, per-bounce durations, settle) · `landing` (size and
position fractions, desktop and mobile separately, hover bob) · `room` (palette, key
light, ambient, fog, camera FOV, depth) · `idleEyes` (expression weights, interval,
smile-shake) · `chatbox` (delay, duration) · `exit` · plus `sequenceEnabled`.

### 7.3 Generous ranges

No numeric field's maximum may sit on its approved value. `wireSpeed` has been pinned at
its own CMS ceiling of 6 and was flagged three separate times across three sessions
before the owner was finally asked directly. `outerRadius` avoided the same trap only
because its range was deliberately set to 3 rather than the bench's ceiling of 1.6. Every
range here gets headroom above whatever is approved at the bench.

### 7.4 What is deliberately not exposed

Room vertex positions and camera matrices stay in code — the same call made for the 105
eye-shape numbers. Tuning geometry blind in an admin form is not a workflow anyone
succeeds at. The bench's `copy json` is the editing tool and the paste into `types.ts` is
the approval step; the admin field descriptions must say so plainly.

### 7.5 Kill switch

`sequenceEnabled` OFF removes the sequence from the DOM entirely — no listeners, no pin,
no room, no promotion. Not "present but inert". Verified in **both** polarities, and
required to be provably able to fail (see §11).

### 7.6 Resolver

`resolveSamsara.ts`, with a round-trip check that **perturbs every mapped field to a
non-default value first**. Round-tripping defaults against themselves is a near-tautology
and is precisely the weakness the 2026-08-09 review found in `resolveSeparation.check.ts`.

### 7.7 The Section 2 page block

The `samsara-sequence` global holds *behaviour*. Section 2 also needs to exist as a
**section on the page**, which on this site means a Payload block.

New block `samsaraRoom`, registered in `pageBlocks` (`src/blocks/index.ts`) and rendered
by a new `case` in `RenderBlocks.tsx`. Its fields are only the localized text the stub
chatbox shows — a heading and an input placeholder. Everything else about the room comes
from the global, because it is behaviour rather than content.

The homepage's layout after this work is exactly two blocks: `hero`, `samsaraRoom`.
Section 3 adds a third later.

### 7.8 Seed

`src/seed/index.ts` currently seeds six blocks into the homepage. It is updated to seed
`hero` and `samsaraRoom` only, plus defaults for the new global.

⚠️ **After any seed, `rm -rf .next/cache`.** `getPage` in `lib/cms.ts` uses
`unstable_cache`, which persists to disk and survives a `next dev` restart, and a seed
script's `revalidateTag` call is a documented no-op outside a Next request context. This
has already cost this project a debugging session once, when a newly added CMS field kept
reading back empty against a correctly seeded database.

---

## 8. The bench

`/[locale]/dev/samsara`, `notFound()` in production, matching the four existing benches.
Live sliders for every group in §7.2, a replay control, and `copy json`.

The replay control walks straight into the trap that bit the shatter and ignition
benches: rebuilding the engine on every slider `onChange` — which fires per pixel of drag
— exhausted the browser's WebGL context limit in Firefox. The established fix applies
unchanged: `<canvas key={nonce}>` for a fresh element per rebuild, `dispose(true)`, and a
220ms debounce. `forceContextLoss()` is **not** an alternative; on a reused canvas it
permanently poisons the element and turns a slow leak into an immediate crash.

---

## 9. Starting values and the freeze gate

Every number in §5.6, §6.3 and §6.4 is a **starting value**, not a decision.

**The gate:** the prototype is built, the owner tunes it live at `/dev/samsara`, and the
approved values are pasted into `DEFAULT_SEQUENCE` in `lib/samsara/types.ts` and pinned
by `types.check.ts`. Only then does the rest of the build proceed. The paste is the
approval step, exactly as it is for the eye shapes.

No implementation task downstream of the gate may treat a starting value as approved.

---

## 10. Backups and section retirement

The five blocks below the hero — `manifestoStrip`, `featuredWorks`, `servicesRows`,
`archiveTeaser`, `contactMailto` — come off the homepage in this piece of work. Three
layers of recovery, at the owner's explicit request.

### 10.1 Payload block definitions stay registered — a data-safety requirement

Payload stores blocks in child tables (`pages_blocks_featured_works` and siblings).
**Deleting the definitions from `pageBlocks` means the next schema push drops those
tables**, and any page still carrying those blocks loses its content irrecoverably.

So the blocks are removed from the homepage *document's layout* only. The definitions
stay in `src/blocks/index.ts`. Recovering a retired section is then re-adding it in
`/admin` with zero code change — which is the most useful possible form of "recall the
design if needed."

### 10.2 A versioned archive

`docs/archive/2026-08-30-homepage-sections/`, inside the repo so it is versioned and
travels with the code. Contents: each retired component's source, a written record of
what each section did and why it was retired, and **captured screenshots of every section
as it renders today** — both locales, desktop and mobile, via headless Chrome.

The screenshots are the part that matters. The source is in git history forever, but the
orbs are proof that code alone does not let anyone see what something looked like without
rebuilding it.

Not `_HANDOFF/`: that folder sits outside the git repo and would not be versioned, and a
stray duplicate of it has already been created inside the repo once by accident. The
authoritative `_HANDOFF/HANDOFF.md` gets a pointer to the archive instead.

### 10.3 A git tag

`pre-section-redesign-2026-08-30` on the current `main` (`e2e732c`), pushed to origin.

### 10.4 One component that must not be deleted

`ManifestoStrip.tsx` is also rendered by the `/manifesto` route. It comes off the
homepage; the file stays.

---

## 11. Verification

### 11.1 Unit checks, added to `verify:config`

`gestures`, `cameraHandoff`, `transitScript`, `bounce`, `types`, `resolveSamsara`. Pure,
millisecond-scale, no browser. This is where the seam math is pinned.

### 11.2 Browser scripts

In `docs/superpowers/verification/`, all pass/fail via `process.exit` — never
print-and-eyeball.

| Script | Asserts |
|---|---|
| `samsara-seam.mjs` | SAMSARA's screen position and size are continuous to sub-pixel across the camera and canvas handoff |
| `samsara-fixed-clip.mjs` | SAMSARA is not clipped during the fall — guards §4.4 |
| `samsara-gestures.mjs` | A synthetic trackpad flick (~30 events) fires **one** beat; four mouse notches fire four |
| `samsara-landing.mjs` | Landed size is 40% of viewport height and correctly placed, at three viewports including portrait |
| `samsara-exit.mjs` | Scroll-up returns SAMSARA to orbit and unfreezes the hero |
| `samsara-kill-switch.mjs` | Both polarities; sequence absent from the DOM when off **and Section 2 still reachable** |
| `samsara-reduced-motion.mjs` | No pin, no cinematic, Section 2 reachable by ordinary scrolling |
| `samsara-fps.mjs` | Real rAF deltas with the room and shadow map live |

Plus a full re-run of the twelve existing `mascot-*` and `eyes-*` scripts, to prove the
orbit, depth sorting, labels, occlusion and expressions are untouched.

### 11.3 Two environment facts that are not optional

**The in-app browser pane cannot verify any of this.** It reports the tab hidden and
throttles `requestAnimationFrame` to about 1 Hz, which stalls the engine's own clock
rather than merely the screenshot cadence — 13 frames in 13 real seconds, measured.
Everything runs through `puppeteer-core` headless.

**`npm run build` must not run while the dev server is up**, or `.next` corrupts for the
running server. Stop dev, build, `rm -rf .next`, restart clean.

### 11.4 A methodology note

Zoom before diagnosing. A "hollow ring" eye bug was diagnosed and half-fixed from contact
sheet thumbnails before a 715px render showed the crescents had been solid the whole
time, and the shading change had to be reverted. Contact sheets find *that* something is
wrong; they are not evidence of *what*.

---

## 12. Risks, ranked

1. **The seam.** Matching an orthographic projection to a perspective one to sub-pixel
   accuracy. Highest-consequence unknown. Mitigated by keeping the math pure and pinned
   rather than buried in an engine.
2. **`svh` versus the real visual viewport on mobile.** The whole "pinned hero rect equals
   viewport rect" assumption behind the invisible `absolute` to `fixed` promotion (§4.2)
   rests on this. The hero is `minHeight: 100svh`, and `svh` diverges from the visual
   viewport as the address bar collapses. Must be **measured** across address-bar states.
   If it is off, the handoff jumps on phones only — invisible on every desktop test.
3. **Gesture normalization across hardware.** Trackpads, Magic Mouse and free-spinning
   wheels all behave differently and cannot all be tested. Synthetic streams cover the
   known shapes; the bench covers the rest.
4. **Frame rate with a shadow-casting light.** Measured, not assumed. See §6.2.
5. **Scroll-jacking on iOS.** Lenis, momentum scrolling and rubber-banding interact
   badly. Fail-open (§5.10) is the safety net.

---

## 13. Out of scope

- Any conversation behind the chatbox — what powers replies, what SAMSARA knows, message
  persistence, rate limiting. Its own spec.
- Section 2's manifesto, vision and mission content.
- Section 3, undesigned.
- Replacing lorem-ipsum copy or placeholder imagery anywhere. Still blocked on the
  owner's business information.
- Re-litigating `SPIN_SPEED 113`, the gold ignition crest, `wireSpeed 6`, additive dust
  blending, or the eyes' deliberate left-right asymmetries. All are owner-approved as
  final and recorded as such.
