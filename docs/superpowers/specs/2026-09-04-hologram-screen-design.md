# The emitter orbs and the holographic screen — Design

**Date:** 2026-09-04
**Status:** approved in brainstorming; starting values NOT frozen, pending the bench (§9)
**Supersedes** the chatbox stub of `2026-08-30-samsara-transition-design.md` §6.6, which
was removed on 2026-09-03. Extends that spec's room (§6.1–6.2) and landing (§6.4); neither
is modified.

---

## 1. Why this spec exists in this order

The chatbox stub was removed before this was designed, and that ordering was deliberate:
it forced the question of what Section 2 owes a visitor when no WebGL runs to be answered
on its own, rather than being absorbed into a larger feature where it would have been easy
to lose.

The answer that came back reshaped this spec. The screen is not decoration. It will
eventually carry **subtitles for a voice-over, and option buttons** — both of which exist
*for* accessibility. That single fact rules out the obvious implementation (draw everything
in the canvas) and sets the architecture in §4.

It also inverts a familiar instinct. The usual reasoning is "the hologram is the feature,
the fallback is a courtesy." Here the affordances the hologram will host are the
accessibility surface, so the fallback is the feature and the hologram is the enhancement
behind it. §5.6 is written from that direction.

---

## 2. Owner's decisions

Recorded verbatim in substance, because later sections are only defensible with reference
to them.

| # | Decision |
|---|---|
| 1 | The sequence is four beats: orbs enter → smoke → amber light → screen forms. |
| 2 | SAMSARA stays **parked** throughout. It does not react. |
| 3 | Smoke bursts from the orbs' **four afterburners**, and keeps bursting **every 3s, permanently** — not only on entry. |
| 4 | The screen **flickers every 5s**, permanently, after it resolves. |
| 5 | The screen will later display **subtitles for voice-over** and **option buttons**. |
| 6 | Scope now: **visual sequence only, plus publishing the screen's projected rect** so the DOM layer can attach later without re-architecting. |
| 7 | Portrait: the screen moves **below SAMSARA**, with the orbs flanking it. |
| 8 | Orb LOD is 40k / 1024² (`npm run build:orb`), chosen for headroom — see `build-mascot.mjs`. |

Two assumptions were stated back to the owner and not contradicted: the orbs **enter from
the camera side**, flying past the viewer into the room; and the room keeps its existing
**no-ceiling** geometry.

---

## 3. Scope

**In scope.** The four beats as WebGL, on the existing room's canvas and scene. Two orb
instances of one model. Smoke from four ports per orb. Amber shafts. The glass screen with
its forming animation and permanent flicker. The projected-rect DOM contract. Config,
bench controls, CMS surface, unit checks and browser gates.

**Out of scope, deliberately.** Subtitles. Option buttons. Any audio or voice-over. Any
DOM content on the screen. Chat. Those arrive on top of the contract in §5.7, and each is
its own piece of work.

**Explicitly not touched.** `SequenceController`'s mode surface (§4.3), the frozen
`DEFAULT_SEQUENCE` values, `roomBurst`, the eye socket config, and the temporary
`.tt-room-note` — which keeps holding Section 2 until the subtitle layer replaces it.

---

## 4. Architecture

### 4.1 The constraint that decides everything

The screen will host subtitles and option buttons. Canvas text cannot be selected, focused,
translated, reflowed, or read by a screen reader, and a canvas "button" cannot be reached by
keyboard. Rendering those in WebGL would defeat the purpose of the features themselves.

So the screen is **WebGL glass with DOM on top**, and the boundary between them is the
screen's **projected rect**, published for a DOM layer to read.

This is the same conclusion the removed chatbox reached, recorded in its own component
comment: *"it will eventually carry a live-region message list and focus management and
none of that can be retrofitted onto WebGL later."* That comment was right, and this spec
inherits its reasoning rather than rediscovering it.

### 4.2 Approach — extend the existing room

Orbs, smoke, shafts and glass are added to the scene `MascotEngine` already builds for the
room, drawn on the same canvas, in the same rAF loop, under the same perspective camera.

They inherit, at no cost: the canvas promotion to `position: fixed`, the reveal ramp, the
kill switch, the reduced-motion bail, the no-WebGL bail, the dpr presentation fix, and
correct depth sorting against SAMSARA and the walls.

### 4.3 The beats are a sub-phase of `landed`, not new modes

`SequenceController`'s modes (`idle → charge1..3 → committed → landed → exiting`) are
asserted by name in `samsara-kill-switch`, `samsara-seam`, `samsara-room-scroll`,
`samsara-arms-after-intro`, `samsara-reduced-motion` and the bench. Adding modes for the
hologram would ripple through all of them for no gain.

`HologramController` is a **separate** machine with its own clock, started when the
sequence reaches `landed` and reset when it leaves. Its phases:

```
dormant → entering → parked → emitting → forming → live
```

`live` is terminal and is where the permanent 3s smoke and 5s flicker run.

### 4.4 Module map

Follows the project's established split: arithmetic in pure modules with a `.check.ts`
pinned into `verify:config`, GL construction in a `room.ts`-shaped builder that returns a
handle with `setConfig` / `dispose`.

| Module | Responsibility | Pure |
|---|---|---|
| `lib/samsara/HologramController.ts` | The phase machine and its clock. No GL, no DOM. | ✅ |
| `lib/samsara/emitterOrbs.ts` | Parked positions (landscape + portrait), the entry path, the float bob, and the hand-measured port/lens offsets (§4.6). | ✅ |
| `lib/samsara/orbSmoke.ts` | Particle bookkeeping for four ports per orb, on the 3s cadence. | ✅ |
| `lib/samsara/hologramGeometry.ts` | Screen corners in world space, shaft parameters, and the world→screen **projected rect**. | ✅ |
| `lib/samsara/emitterScene.ts` | THREE construction: orb instances, smoke points, shaft meshes, glass. | GL |

Each pure module gets a sibling `.check.ts` appended to `verify:config`, matching every
other module in `lib/samsara/`.

### 4.5 ⚠️ The shafts cannot be fog

The obvious implementation of visible light shafts is fog scattering. **`scene.fog` is
banned in this room**, and `room.ts` states why: the room shares its scene with the orbit,
so setting fog would tint SAMSARA while it is still circling the mark in the hero — a
regression in a shipped, gate-covered feature.

The shafts are therefore **additive geometry**: cone or tapered-quad meshes, `transparent`,
`depthWrite: false`, `depthTest: true`, so the orbs and SAMSARA occlude them correctly
while they do not occlude each other.

### 4.6 ⚠️ The orb model has no named nodes

`emitter_orb.glb` is one welded mesh, one primitive, one unnamed material
(`scripts/_inspect-orb.mjs`). The "hologram emitter" lens and the four "steam emitter"
ports the owner labelled are **not transforms** — nothing can be parented to them.

Their positions are therefore hand-measured constants in orb local space, living in
`emitterOrbs.ts` behind a comment stating that they must be re-derived if the model is ever
re-exported. This is a real fragility and is recorded rather than hidden. The durable fix
is a re-export carrying named empties at those five points; worth requesting from whoever
authored the model, and cheap for them to add.

### 4.7 ⚠️ `orbSmoke` is a sibling of `roomBurst`, not a fork and not a generalisation

`roomBurst` works in **body radii**, spawning on a disc **behind** SAMSARA so puffs emerge
from the silhouette edge. Orb smoke works in **orb radii**, from **four discrete ports** at
the base, drifting down and out.

Generalising `roomBurst` to cover both means editing frozen, gate-covered code to serve a
case it was not designed for. Forking it invites the two copies to drift.

So: a new module, with a header documenting why it is not `roomBurst` — exactly as
`roomBurst`'s own header documents why it is not `mascotTrail`. This project already runs
two particle systems for precisely this reason, and the reason held both times.

### 4.8 Approaches rejected

**A second canvas for the hologram.** Depth sorting against SAMSARA and the walls would
break; it needs a second GL context, which this project already fought (context exhaustion,
`9190364`); and the promotion, fixed-clip and kill-switch logic would all need duplicating.

**A CSS/DOM hologram over the canvas.** Fails for the same sorting reason — the shafts must
pass behind the orbs and in front of the floor. Also cannot receive the room's light.

**Baking the orbs into the room model.** They must move independently and emit particles;
and the room LOD is 800k/4096², a payload the orbs do not need.

---

## 5. The sequence

### 5.1 Beat 1 — entry

Both orbs begin **behind the camera** and fly forward into the room, decelerating onto
their parked positions. Entry is staggered so they do not read as one rigid object: the
near orb leads, the far orb follows.

The path is solved in `emitterOrbs.ts` as a function of phase progress, in the room's world
units, so it holds at every viewport and every `ROOM.DEPTH`.

### 5.2 Beat 2 — smoke

There are **two** smoke behaviours from the same four ports, and conflating them would lose
half of the owner's description.

**Thrust, during `entering`.** The four afterburners emit continuously while the orbs fly
in and decelerate — this is what makes the entry read as propulsion rather than as two
objects sliding into place. It ends when the orb parks.

**Cadence, permanently.** From `parked` onward the ports fire **every 3s, for as long as
the room is up** — through `emitting`, `forming` and `live`, not only during the entrance.
This is owner decision #3 and §11.2 measures it across at least three intervals rather than
inferring it from one.

⚠️ The first *cadenced* burst waits a full interval after parking rather than firing on the
frame the orb arrives. Two reasons, and the second is the one that bites: it would land on
top of the thrust smoke still dissipating and read as a continuation of it, and `roomBurst`
already established that a burst fired on arrival lands under the settle and is not read as
its own event.

⚠️ Thrust and cadence share one particle pool per orb. Sizing the pool for the cadence
alone will starve the entrance, which is the denser of the two.

### 5.3 Beat 3 — amber light

Once parked and floating, each orb's lens emits. Two things happen together: the lens
material's emissive lifts, and the shaft geometry fades in from zero.

### 5.4 Beat 4 — the screen forms

The shafts converge on the screen plane. The glass **flickers first, then resolves** — the
owner's word was "start from flickering then appear," so the forming animation is an
unstable ramp, not a clean fade.

Once resolved it enters `live` and flickers **every 5s permanently**.

### 5.5 ⚠️ The flicker belongs to the glass alone

The screen will host subtitles, which exist to make speech accessible. Text that flickers
on a 5s cycle is hard to read, and flickering an accessibility affordance defeats it.

So the flicker is a property of the **WebGL glass only**. The published rect and the `live`
state stay steady through every flicker, so a DOM layer sitting on the screen never
flashes. This is a hard requirement, not a preference, and §11 asserts it.

### 5.6 Fail-open — and why it matters more here

With reduced motion, no WebGL context, or `sequenceEnabled: false`, the sequence never
arms, so `HologramController` never starts and **no attribute is written**.

That is the whole fail-open promise, and it carries more weight than usual: the affordances
this screen will host are subtitles and option buttons. If they were reachable only through
a working hologram, then every visitor who most needs them — reduced motion, weak GPU,
assistive technology — would be the visitor who cannot get them.

Therefore: **the DOM layer must stand alone.** The hologram is enhancement behind it, never
a precondition. Until that layer exists, `.tt-room-note` keeps holding Section 2, and
`samsara-reduced-motion.mjs` keeps asserting it.

### 5.7 The DOM contract

Published on `<html>`, following `data-tt-chatbox`'s shape exactly, because that shape is
what made the chatbox fail open:

| Channel | Meaning |
|---|---|
| `data-tt-hologram` **present** | A screen layer exists — lifts DOM onto the fixed layer above the promoted canvas |
| its **value** (`forming` / `live`) | State, for transitions |
| `--tt-holo-x`, `-y`, `-w`, `-h` | The screen's projected rect, in CSS px |

The **presence/value split is load-bearing.** Presence lifts; value animates. Gating on the
value alone would leave a blank panel in every degraded path — the exact bug the chatbox's
Task 14 comment recorded.

⚠️ **The rect is published from the engine's rendered snapshot, never read live.** Three rAF
callbacks run per browser frame in registration order, so a value read from a later callback
is this frame's render labelled with next frame's state. `samsara-seam.mjs` cost three
separate false readings learning this — a 6px seam and a 2,332px jump that did not exist.
The rect goes into `__ttMascot().rendered`, alongside the pose fields, written once per
rendered frame.

---

## 6. Composition

### 6.1 Landscape

Screen left, SAMSARA right at its frozen `X_FRAC 0.75` / `Y_FRAC 0.635`. Orbs low-left and
mid-frame, the near one closer to camera.

From the owner's composition mockup, measured against SAMSARA as the known-size object:
the **near orb ≈ 0.385 × SAMSARA**, the far orb ≈ 0.146. Against `LANDING.SIZE_FRAC 0.455`
that is **≈ 0.175 of viewport height, ~158px at 1440×900**.

⚠️ **The two orbs are one object at two depths, not two sizes** — a ~2.6× depth ratio under
the room's perspective camera. The config therefore carries **one orb size and two
positions**, never two sizes. Two sizes would drift apart the first time either was tuned.

⚠️ The mockup is **2.21:1**. The project tests 1440×900, 1280×720 and 390×844. The size
ratios hold at any aspect; the **layout does not** — at 1.6:1 there is materially less room
between a bottom-left orb and SAMSARA at x=0.75. §11 asserts clearance at all three.

### 6.2 Portrait

SAMSARA sits upper-centre (`MOBILE_X_FRAC 0.5`, `MOBILE_Y_FRAC 0.3`, 295px tall at
390×844), leaving roughly the lower half free — the space the chatbox used.

The screen moves **below SAMSARA**, narrower and more upright, with the orbs flanking it
low-left and low-right. The breakpoint is **639px**, matching the engine's own
`window.innerWidth < 640` split; a different one here would put the screen over the body on
the widths in between, which is the bug the chatbox's media query already paid for.

⚠️ The screen's aspect differs between landscape and portrait. Any future subtitle content
must tolerate both, and the published rect is what tells it which it has.

---

## 7. Performance

Two 40k orbs, two particle systems, shaft geometry and the glass are added to a room that
`room.ts` deliberately keeps minimal — and that file records this project losing 5.9 fps to
a single lighting-adjacent bug.

Constraints, therefore:

- **The orbs cast no shadows.** The room runs one shadow-casting light on purpose.
- **One model, two instances.** 590 KB is downloaded once, not per orb.
- **The orb model loads lazily**, like the room model — a hero-only visit must never fetch it.
- **Shafts and glass are `depthWrite: false`** and additively blended, so they cost fill
  rate but no sorting.
- **`samsara-fps.mjs` is extended** to measure with the hologram live. Its floor of 12 is a
  software-raster tripwire, not a performance claim; any real figure needs the hardware rows
  recorded in the verification README.

---

## 8. CMS and the bench

Two new field groups on the `samsara-sequence` global, following `BURST` and `DRAG`:

- **`EMITTERS`** — orb size fraction, the two positions (landscape and portrait), entry
  duration and stagger, float bob amplitude and period; and the two smoke behaviours of
  §5.2 **separately**: thrust rate and spread for `entering`, then cadence interval
  (default 3000ms), puffs per burst, puff size, colour and lifetime. One shared interval
  control cannot express both, and collapsing them into one is how the entrance quietly
  loses its propulsion.
- **`HOLOGRAM`** — screen size and position (landscape and portrait), forming duration,
  flicker interval (default 5000ms), flicker depth and duration, glass colour, shaft colour,
  shaft opacity and spread.

Every value is exposed at `/dev/samsara` in its own panel, resolved through
`resolveSamsara`, and round-tripped by `toSamsaraPayload`.

⚠️ **`resolveSamsara.check.ts` asserts a full round trip with nothing left at its default.**
Both new groups must be added to that fixture or the check silently stops covering them.

---

## 9. Starting values and the freeze gate

The existing `DEFAULT_SEQUENCE` values are **frozen** and pinned value-by-value by
`types.check.ts`. This spec does not touch them.

The new `EMITTERS` and `HOLOGRAM` values ship as **reasonable starting points, deliberately
not frozen.** The handoff is explicit that tuned values are the owner's to approve at the
bench, and pinning numbers the owner has never seen move would misrepresent guesses as
decisions. `types.check.ts` will assert **relationships** for them — that the forming
duration is positive, that smoke interval exceeds puff lifetime, that the screen clears
SAMSARA — not specific magnitudes, until the owner tunes and freezes them.

⚠️ The bench's `copy json` writes `lib/samsara/types.ts`. It is not interchangeable with
`copy eye socket`, which writes `lib/mascot/eyeTypes.ts`.

---

## 10. Risks, ranked

1. **The hand-measured port and lens offsets (§4.6).** A model re-export silently moves
   every emitter. Mitigated by a loud comment and a gate that asserts smoke originates
   within the orb's silhouette; solved properly only by named empties in the model.
2. **Frame cost (§7).** Four new draw-heavy additions to a room that has lost fps to less.
   Mitigated by the extended fps gate and the no-shadow rule.
3. **The projected rect drifting from the painted quad.** A rect that is subtly wrong
   positions future subtitles subtly wrong, and nothing about it looks broken. Mitigated by
   §11's pixel assertion rather than a maths-against-maths comparison.
4. **Portrait composition.** The most likely place the design needs the owner's eye after
   first build.
5. **Scope creep toward subtitles.** They are §3's largest exclusion for a reason.

---

## 11. Verification

### 11.1 Unit checks, added to `verify:config`

`HologramController.check.ts`, `emitterOrbs.check.ts`, `orbSmoke.check.ts`,
`hologramGeometry.check.ts`, plus the new relationship assertions in `types.check.ts` and
the extended `resolveSamsara.check.ts` fixture.

### 11.2 `samsara-emitters.mjs` (new)

Both orbs arrive and park; positions match `emitterOrbs`'s solved values; the float bob is
non-zero; smoke fires on the **3s cadence** — measured across at least three intervals, not
inferred from one; puffs originate within the orb silhouette; orbs clear SAMSARA at
**1440×900, 1280×720 and 390×844**.

### 11.3 `samsara-hologram.mjs` (new)

The screen forms and reaches `live`. **The key assertion: the published rect matches the
actually-painted quad, measured in PIXELS.**

⚠️ Comparing the published rect against `hologramGeometry`'s own maths would be two numbers
that agree with each other no matter how the result is presented — the exact failure that
made three rounds of measurement miss the dpr canvas bug. The gate screenshot-clips to the
published rect and asserts the glass is actually painted there, using peak luma over the
element's own box, per the technique in `verification/README.md` §2026-09-03.

Flicker cadence is asserted at **5s**, and — separately — that the published rect and the
`live` value **do not change during a flicker** (§5.5).

### 11.4 Extended gates

- **`samsara-fps.mjs`** — with the hologram live.
- **`samsara-reduced-motion.mjs`** — no orbs, no shafts, no attribute written, and
  `.tt-room-note` still ordinary in-flow content.
- **`samsara-kill-switch.mjs`** — the hologram attribute becomes a **new discriminating
  check**, raising `WANT` from 3 to 4. This reverses the reduction made when the chatbox was
  removed, which was recorded at the time as reversing exactly when Section 2 regained
  sequence-driven DOM.
- **`samsara-orbit-unchanged.mjs`** — must still pass. The hero orbit is untouched by this
  work, and the 0.75px tolerance is what proves it.

### 11.5 Methodology

Every browser gate must be **negative-tested** — driven against a deliberately broken build
to confirm it goes red. This project has produced green ticks on visibly broken builds at
least four times (the chatbox on a buried element, the kill switch on a canvas already
gone, the eyes counting brass as lit, the detail check counting amber pixels). An assertion
that has never been seen to fail is not yet a test.

---

## 12. Out of scope

Subtitles. Option buttons. Voice-over audio and its autoplay, mute and caption controls.
Any DOM on the screen. Chat, message history, an input, or a send handler. Restoring any of
the five archived homepage blocks. Re-tuning `DEFAULT_SEQUENCE`. Deciding the fate of the
untracked 57 MB `emitter_orb.glb` source, which remains an open owner question.
