# Emitter Orbs and Holographic Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two emitter orbs fly into the SAMSARA room, trail afterburner smoke, park and float, then project amber shafts that resolve into a flickering holographic screen — with the screen's projected rect published so a subtitle/button DOM layer can attach later.

**Architecture:** Everything is added to the scene `MascotEngine` already builds for the room — same canvas, same rAF loop, same perspective camera — so the work inherits canvas promotion, the reveal ramp, the kill switch, the reduced-motion and no-WebGL bails, and correct depth sorting for free. The four beats run as a `HologramController` sub-phase clock *inside* the existing `landed` mode, never as new `SequenceController` modes. All arithmetic lives in pure modules with `.check.ts` siblings; only `emitterScene.ts` touches THREE.

**Tech Stack:** Next.js 15 (App Router) · Payload CMS 3 · three.js 0.185 · TypeScript · `tsx`-run assertion scripts · `puppeteer-core` for browser verification

**Spec:** `docs/superpowers/specs/2026-09-04-hologram-screen-design.md`

## Global Constraints

- **Working directory is `D:\TAMPA TARUNO\WEBSITE\_WEB_PRODUCT`.**
- **Every git command needs `-c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"`** or it fails with "dubious ownership".
- **The in-app browser pane cannot verify any of this.** It reports the tab hidden and throttles `requestAnimationFrame` to ~1 Hz, stalling the engine's own clock. All browser verification runs through `puppeteer-core`, Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, via `docs/superpowers/verification/_puppeteer.mjs`. Install first: `cd "<scratchpad>" && npm init -y && npm install puppeteer-core`.
- **Never run `npm run build` while the dev server is up.** It corrupts `.next`; the symptom is `Cannot find module './vendor-chunks/<something>.js'` and 500s on unrelated routes. Stop dev → build → `rm -rf .next` → restart.
- **Payload's dev schema push BLOCKS on an interactive `(y/N)` data-loss prompt** and the dev server has no stdin, so every request hangs ~120s and the push never lands. This project has no migrations directory. Any task changing a Payload field must expect this; resolve it by applying the drops as explicit SQL so drizzle sees no diff on the next boot. **Back up `tampa-taruno.db` first.**
- **Writing to a Payload global over REST requires auth.** `POST /api/users/login`, then `Authorization: JWT <token>`. Reads are open. A direct DB write leaves the page serving the old value — `revalidateTag` is a no-op outside a request context.
- **`hero-effects` is NOT to be reseeded.** It carries owner-tuned values diverging from code defaults.
- **`DEFAULT_SEQUENCE`'s existing values are FROZEN** and pinned value-by-value by `types.check.ts`. This plan adds two new groups and must not alter any existing value.
- **The new `EMITTERS` and `HOLOGRAM` values ship UNFROZEN.** `types.check.ts` asserts *relationships* for them, never magnitudes, until the owner tunes and freezes at the bench (spec §9).
- **No numeric CMS field's maximum may equal its default.** Every range gets headroom.
- **`scene.fog` is banned.** The room shares its scene with the orbit; fog would tint SAMSARA mid-hero. Shafts are additive geometry (spec §4.5).
- **The orbs cast no shadows.** The room deliberately runs one shadow-casting light.
- **The samsara gates write screenshots to `samsarashots/`, never `eyeshots/`** — `eyes-legibility.mjs` `readdir()`s the latter and asserts it holds exactly 14 crops.
- **Ten scripts in `verification/` cannot run here** (`t9-*`, `preview-context-leak`, `preview-live-update`, `handoff-frontal`, `measure-handoff`) — they import `ffmpeg-static`, which is not installed. Pre-existing; not this plan's business.
- **Files not modified by this plan:** `roomBurst.ts`, `mascotTrail.ts`, `eyes.ts`, `eyeTypes.ts`, `LogoEngine.ts`, `SatelliteEngine.ts`, `SequenceController.ts`'s mode surface, `SamsaraRoomBlock.tsx`'s `.tt-room-note`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/samsara/emitterOrbs.ts` | Orb parked poses, entry path, float bob, hand-measured port/lens offsets. Pure. |
| `src/lib/samsara/emitterOrbs.check.ts` | Its assertions. |
| `src/lib/samsara/orbSmoke.ts` | Particle bookkeeping — thrust during entry, 3s cadence after. Pure. |
| `src/lib/samsara/orbSmoke.check.ts` | Its assertions. |
| `src/lib/samsara/hologramGeometry.ts` | Screen quad in world space, shaft params, world→screen projected rect. Pure. |
| `src/lib/samsara/hologramGeometry.check.ts` | Its assertions. |
| `src/lib/samsara/HologramController.ts` | The six-phase machine and its clock. Pure. |
| `src/lib/samsara/HologramController.check.ts` | Its assertions. |
| `src/lib/samsara/emitterScene.ts` | THREE construction: orb instances, smoke points, shaft meshes, glass. |
| `docs/superpowers/verification/samsara-emitters.mjs` | Browser gate: arrival, park, bob, smoke cadence, clearance at 3 viewports. |
| `docs/superpowers/verification/samsara-hologram.mjs` | Browser gate: forming, published rect vs painted pixels, flicker cadence, rect steady through flicker. |

**Modified:**

| File | Change |
|---|---|
| `src/lib/samsara/types.ts` | `EmittersConfig`, `HologramConfig`, both on `SequenceConfig`, defaults. |
| `src/lib/samsara/types.check.ts` | Relationship assertions for both groups. |
| `src/lib/samsara/resolveSamsara.ts` | CMS shape, resolve, `toSamsaraPayload` round trip. |
| `src/lib/samsara/resolveSamsara.check.ts` | Both groups added to the non-default fixture. |
| `src/globals/SamsaraSequence.ts` | Two new field groups. |
| `src/lib/mascot/MascotEngine.ts` | Host the emitter scene; write the rect into the rendered snapshot. |
| `src/components/hero/SamsaraSequence.tsx` | Drive `HologramController`; publish the DOM contract. |
| `src/app/(frontend)/[locale]/dev/samsara/SamsaraLab.tsx` | Two new bench panels. |
| `docs/superpowers/verification/samsara-fps.mjs` | Measure with the hologram live. |
| `docs/superpowers/verification/samsara-reduced-motion.mjs` | Assert no orbs, no attribute. |
| `docs/superpowers/verification/samsara-kill-switch.mjs` | Rect attribute as a 4th discriminating check; `WANT` 3 → 4. |

---

## Task 1: Config shape, starting values, relationship checks

**Files:**
- Modify: `src/lib/samsara/types.ts`
- Modify: `src/lib/samsara/types.check.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EmittersConfig`, `HologramConfig`, `OrbSlotConfig`; `DEFAULT_SEQUENCE.EMITTERS` and `.HOLOGRAM`. Every later task reads these.

- [ ] **Step 1: Write the failing relationship assertions**

Append to `src/lib/samsara/types.check.ts`, above its final summary:

```ts
// ── emitters ────────────────────────────────────────────────────────
//
// ⚠️ RELATIONSHIPS ONLY, never magnitudes. These values are NOT frozen —
// the owner tunes them at /dev/samsara and freezes them later (spec §9).
// Pinning a number here would misrepresent a guess as a decision.
check('orb size is a sane fraction of the viewport',
  DEFAULT_SEQUENCE.EMITTERS.SIZE_FRAC > 0 && DEFAULT_SEQUENCE.EMITTERS.SIZE_FRAC < 0.5)
check('mobile orb is not larger than desktop',
  DEFAULT_SEQUENCE.EMITTERS.MOBILE_SIZE_FRAC <= DEFAULT_SEQUENCE.EMITTERS.SIZE_FRAC)
check('the near orb is nearer the camera than the far orb',
  DEFAULT_SEQUENCE.EMITTERS.NEAR.DEPTH_FRAC < DEFAULT_SEQUENCE.EMITTERS.FAR.DEPTH_FRAC)
check('entry has a positive duration', DEFAULT_SEQUENCE.EMITTERS.ENTRY_MS > 0)
check('the stagger is shorter than the entry it offsets',
  DEFAULT_SEQUENCE.EMITTERS.ENTRY_STAGGER_MS < DEFAULT_SEQUENCE.EMITTERS.ENTRY_MS)
// A puff outliving its interval means the cadence never reads as separate
// bursts — it becomes a continuous plume, which is the thrust, not the cadence.
check('a cadenced puff dies before the next burst',
  DEFAULT_SEQUENCE.EMITTERS.PUFF_LIFE_MS < DEFAULT_SEQUENCE.EMITTERS.CADENCE_MS)
check('thrust emits at a positive rate', DEFAULT_SEQUENCE.EMITTERS.THRUST_RATE > 0)
check('there are four ports', PORT_OFFSETS.length === 4)

// ── hologram ────────────────────────────────────────────────────────
check('the screen has positive extent',
  DEFAULT_SEQUENCE.HOLOGRAM.W_FRAC > 0 && DEFAULT_SEQUENCE.HOLOGRAM.H_FRAC > 0)
check('forming has a positive duration', DEFAULT_SEQUENCE.HOLOGRAM.FORM_MS > 0)
check('the flicker is briefer than its own interval',
  DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_DUR_MS < DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_MS)
check('the flicker dips rather than extinguishing',
  DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_DEPTH > 0 && DEFAULT_SEQUENCE.HOLOGRAM.FLICKER_DEPTH < 1)
// Landscape: the screen sits LEFT of SAMSARA, which parks at X_FRAC 0.75.
check('the screen clears SAMSARA horizontally in landscape',
  DEFAULT_SEQUENCE.HOLOGRAM.X_FRAC + DEFAULT_SEQUENCE.HOLOGRAM.W_FRAC / 2
    < DEFAULT_SEQUENCE.LANDING.X_FRAC)
// Portrait: the screen sits BELOW SAMSARA, which parks at MOBILE_Y_FRAC 0.3.
check('the screen clears SAMSARA vertically in portrait',
  DEFAULT_SEQUENCE.HOLOGRAM.MOBILE_Y_FRAC - DEFAULT_SEQUENCE.HOLOGRAM.MOBILE_H_FRAC / 2
    > DEFAULT_SEQUENCE.LANDING.MOBILE_Y_FRAC)
```

Add `PORT_OFFSETS` to the file's import from `./types`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx src/lib/samsara/types.check.ts`
Expected: FAIL — `EMITTERS` is not a property of `DEFAULT_SEQUENCE`, TypeScript errors on every new line.

- [ ] **Step 3: Add the types**

In `src/lib/samsara/types.ts`, above `SequenceConfig`:

```ts
/** One orb's parked position. Fractions of the viewport and of room depth. */
export type OrbSlotConfig = {
  X_FRAC: number
  Y_FRAC: number
  /** 0 = at the camera plane, 1 = at the back wall. Drives apparent size. */
  DEPTH_FRAC: number
}

export type EmittersConfig = {
  /**
   * ⚠️ ONE size for BOTH orbs, and that is not an omission.
   *
   * The two orbs in the owner's mockup are the SAME object at different
   * depths — a ~2.6x depth ratio under the room's perspective camera, not two
   * different sizes. Two size values would drift apart the first time either
   * was tuned, and the mockup's own proportions would stop being reproducible.
   * Apparent size comes from DEPTH_FRAC.
   */
  SIZE_FRAC: number
  MOBILE_SIZE_FRAC: number

  NEAR: OrbSlotConfig
  FAR: OrbSlotConfig
  MOBILE_NEAR: OrbSlotConfig
  MOBILE_FAR: OrbSlotConfig

  /** Entry flight, per orb. */
  ENTRY_MS: number
  /** The far orb lags the near one by this, so they do not read as one body. */
  ENTRY_STAGGER_MS: number

  /** Idle float once parked, in ORB RADII. */
  BOB_AMP: number
  BOB_MS: number

  /**
   * ⚠️ TWO smoke behaviours from the same four ports (spec §5.2), and one
   * interval control cannot express both.
   *
   * THRUST_* is the continuous afterburner plume while the orbs fly in — it is
   * what makes the entry read as propulsion rather than as two objects sliding
   * into place, and it ends when the orb parks.
   *
   * CADENCE_* is the permanent every-3s burst from `parked` onward, which runs
   * for as long as the room is up.
   */
  THRUST_RATE: number
  THRUST_SPREAD: number
  CADENCE_MS: number
  CADENCE_PUFFS: number

  /** Shared by both behaviours. Sizes are in ORB RADII. */
  PUFF_SIZE: number
  PUFF_LIFE_MS: number
  PUFF_COLOR: string
  PUFF_OPACITY: number
}

export type HologramConfig = {
  /** Screen extent and centre, as fractions of the viewport. */
  W_FRAC: number
  H_FRAC: number
  X_FRAC: number
  Y_FRAC: number
  MOBILE_W_FRAC: number
  MOBILE_H_FRAC: number
  MOBILE_X_FRAC: number
  MOBILE_Y_FRAC: number

  /** Flicker-then-resolve. Not a clean fade — the owner asked for instability. */
  FORM_MS: number

  /**
   * ⚠️ The flicker belongs to the GLASS ONLY (spec §5.5). The published rect
   * and the `live` state must stay steady through it, because this screen will
   * later carry SUBTITLES — text that flickers on a 5s cycle defeats the
   * accessibility feature it exists to provide.
   */
  FLICKER_MS: number
  FLICKER_DUR_MS: number
  FLICKER_DEPTH: number

  GLASS_COLOR: string
  GLASS_OPACITY: number
  SHAFT_COLOR: string
  SHAFT_OPACITY: number
  SHAFT_SPREAD: number
}

/**
 * The four steam ports and the hologram lens, in ORB RADII, orb local space.
 *
 * ⚠️ HAND-MEASURED, because `emitter_orb.glb` has NO NAMED NODES — it is one
 * welded mesh, one primitive, one unnamed material (`scripts/_inspect-orb.mjs`).
 * The features the owner labelled are not transforms and nothing can be
 * parented to them.
 *
 * ⚠️ RE-EXPORTING THE MODEL SILENTLY INVALIDATES THESE. Nothing throws; the
 * smoke simply starts coming out of the wrong places. `samsara-emitters.mjs`
 * asserts puffs originate within the orb silhouette, which catches gross drift
 * but not a subtle one. The durable fix is a re-export carrying named empties
 * at these five points — worth requesting from the model's author.
 */
export const PORT_OFFSETS: readonly (readonly [number, number, number])[] = [
  [0.42, -0.78, 0.30],
  [-0.42, -0.78, 0.30],
  [0.42, -0.78, -0.30],
  [-0.42, -0.78, -0.30],
]

/** The domed lens on top, where the shafts originate. Orb radii. */
export const LENS_OFFSET: readonly [number, number, number] = [0, 0.86, 0.10]
```

Add both to `SequenceConfig`, after `BURST`:

```ts
  EMITTERS: EmittersConfig
  HOLOGRAM: HologramConfig
```

And to `DEFAULT_SEQUENCE`, after the `BURST` block:

```ts
  // ⚠️ STARTING POINTS, NOT FROZEN VALUES. See spec §9 — the owner tunes these
  // at /dev/samsara and freezes them there. types.check.ts asserts only the
  // relationships between them.
  EMITTERS: {
    SIZE_FRAC: 0.175,
    MOBILE_SIZE_FRAC: 0.13,
    NEAR: { X_FRAC: 0.12, Y_FRAC: 0.82, DEPTH_FRAC: 0.28 },
    FAR: { X_FRAC: 0.46, Y_FRAC: 0.70, DEPTH_FRAC: 0.74 },
    MOBILE_NEAR: { X_FRAC: 0.16, Y_FRAC: 0.86, DEPTH_FRAC: 0.30 },
    MOBILE_FAR: { X_FRAC: 0.84, Y_FRAC: 0.86, DEPTH_FRAC: 0.30 },
    ENTRY_MS: 1600,
    ENTRY_STAGGER_MS: 320,
    BOB_AMP: 0.08,
    BOB_MS: 3400,
    THRUST_RATE: 42,
    THRUST_SPREAD: 0.5,
    CADENCE_MS: 3000,
    CADENCE_PUFFS: 3,
    PUFF_SIZE: 0.34,
    PUFF_LIFE_MS: 1500,
    PUFF_COLOR: '#C9B896',
    PUFF_OPACITY: 0.34,
  },

  HOLOGRAM: {
    W_FRAC: 0.52,
    H_FRAC: 0.46,
    X_FRAC: 0.30,
    Y_FRAC: 0.42,
    MOBILE_W_FRAC: 0.78,
    MOBILE_H_FRAC: 0.30,
    MOBILE_X_FRAC: 0.5,
    MOBILE_Y_FRAC: 0.66,
    FORM_MS: 1400,
    FLICKER_MS: 5000,
    FLICKER_DUR_MS: 260,
    FLICKER_DEPTH: 0.45,
    GLASS_COLOR: '#F5C542',
    GLASS_OPACITY: 0.30,
    SHAFT_COLOR: '#F5C542',
    SHAFT_OPACITY: 0.16,
    SHAFT_SPREAD: 0.55,
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run verify:config 2>&1 | grep -cE '^ok'`
Expected: 1408 + 14 = **1422**, exit 0. Also run `npx tsc --noEmit` — expected clean.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/types.ts src/lib/samsara/types.check.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Emitter and hologram config, unfrozen with relationship checks"
```

---

## Task 2: `emitterOrbs.ts` — placement, entry path, bob

**Files:**
- Create: `src/lib/samsara/emitterOrbs.ts`
- Create: `src/lib/samsara/emitterOrbs.check.ts`
- Modify: `package.json` (append the new check to `verify:config`)

**Interfaces:**
- Consumes: `EmittersConfig`, `OrbSlotConfig`, `PORT_OFFSETS`, `LENS_OFFSET` from Task 1.
- Produces:
  - `type OrbSlot = 'near' | 'far'`
  - `type OrbCtx = { W: number; H: number; mobile: boolean; roomDepth: number; camZ: number }`
  - `type OrbPose = { x: number; y: number; z: number; radius: number }`
  - `orbParkedPose(slot: OrbSlot, cfg: EmittersConfig, ctx: OrbCtx): OrbPose`
  - `orbPoseAt(slot: OrbSlot, tMs: number, cfg: EmittersConfig, ctx: OrbCtx): OrbPose`
  - `orbBobY(slot: OrbSlot, tMs: number, cfg: EmittersConfig): number`
  - `portWorld(pose: OrbPose, i: number): [number, number, number]`
  - `lensWorld(pose: OrbPose): [number, number, number]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/emitterOrbs.check.ts`:

```ts
import { DEFAULT_SEQUENCE, PORT_OFFSETS } from './types'
import { orbParkedPose, orbPoseAt, orbBobY, portWorld, lensWorld, type OrbCtx } from './emitterOrbs'

let fails = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else { fails++; console.error(`not ok ${label}   ${note}`) }
}

const cfg = DEFAULT_SEQUENCE.EMITTERS
const land: OrbCtx = { W: 1440, H: 900, mobile: false, roomDepth: 42, camZ: 30 }
const port: OrbCtx = { W: 390, H: 844, mobile: true, roomDepth: 42, camZ: 30 }

// ── parked placement ────────────────────────────────────────────────
{
  const near = orbParkedPose('near', cfg, land)
  const far = orbParkedPose('far', cfg, land)
  check('near orb is nearer the camera than far', near.z > far.z, `${near.z.toFixed(2)} vs ${far.z.toFixed(2)}`)
  // Same world radius; only depth makes them differ on screen. This is the
  // "one size, two positions" rule from spec §6.1 — if it ever fails, someone
  // has added a second size and the mockup's proportions are no longer
  // reproducible.
  check('both orbs share ONE world radius', Math.abs(near.radius - far.radius) < 1e-9,
    `${near.radius} vs ${far.radius}`)
  check('near orb is left of centre', near.x < 0)
  check('near orb is below centre', near.y < 0)
}

// ── portrait moves them, and keeps them clear of SAMSARA ────────────
{
  const near = orbParkedPose('near', cfg, port)
  const far = orbParkedPose('far', cfg, port)
  check('portrait flanks: near left, far right', near.x < 0 && far.x > 0,
    `${near.x.toFixed(2)} / ${far.x.toFixed(2)}`)
  check('portrait puts both orbs at the same depth',
    Math.abs(near.z - far.z) < 1e-9)
  check('portrait orbs are smaller than landscape',
    near.radius < orbParkedPose('near', cfg, land).radius)
}

// ── entry path ──────────────────────────────────────────────────────
{
  const parked = orbParkedPose('near', cfg, land)
  const t0 = orbPoseAt('near', 0, cfg, land)
  const tEnd = orbPoseAt('near', cfg.ENTRY_MS, cfg, land)
  // Entry starts BEHIND the camera (spec §5.1) — the orbs fly past the viewer
  // into the room, so z must start greater than the camera's own z.
  check('entry starts behind the camera', t0.z > land.camZ, `${t0.z.toFixed(2)} vs cam ${land.camZ}`)
  check('entry ends exactly on the parked pose',
    Math.abs(tEnd.x - parked.x) < 1e-6 && Math.abs(tEnd.y - parked.y) < 1e-6 &&
    Math.abs(tEnd.z - parked.z) < 1e-6)
  check('entry is monotonic in depth', orbPoseAt('near', 800, cfg, land).z > parked.z)
  check('past the end it holds the parked pose',
    Math.abs(orbPoseAt('near', cfg.ENTRY_MS * 3, cfg, land).z - parked.z) < 1e-6)
}

// ── the stagger ─────────────────────────────────────────────────────
{
  // The far orb lags. At the moment the near orb parks, the far one must not
  // have arrived, or the stagger is decorative rather than real.
  const nearAtEnd = orbPoseAt('near', cfg.ENTRY_MS, cfg, land)
  const farAtEnd = orbPoseAt('far', cfg.ENTRY_MS, cfg, land)
  const farParked = orbParkedPose('far', cfg, land)
  check('near has parked while far is still travelling',
    Math.abs(nearAtEnd.z - orbParkedPose('near', cfg, land).z) < 1e-6 &&
    Math.abs(farAtEnd.z - farParked.z) > 1e-3)
  check('far parks after its own stagger + entry',
    Math.abs(orbPoseAt('far', cfg.ENTRY_MS + cfg.ENTRY_STAGGER_MS, cfg, land).z - farParked.z) < 1e-6)
}

// ── bob ─────────────────────────────────────────────────────────────
{
  const a = orbBobY('near', 0, cfg)
  const b = orbBobY('near', cfg.BOB_MS / 2, cfg)
  check('bob moves', Math.abs(a - b) > 1e-6)
  check('bob stays within its amplitude', Math.abs(a) <= cfg.BOB_AMP + 1e-9)
  check('bob is periodic', Math.abs(orbBobY('near', cfg.BOB_MS, cfg) - a) < 1e-6)
  // Two orbs bobbing in phase read as one rigid object on a spring.
  check('the two orbs bob out of phase',
    Math.abs(orbBobY('near', 0, cfg) - orbBobY('far', 0, cfg)) > 1e-6)
}

// ── ports and lens ──────────────────────────────────────────────────
{
  const pose = orbParkedPose('near', cfg, land)
  check('there are four ports', PORT_OFFSETS.length === 4)
  const p0 = portWorld(pose, 0)
  check('ports scale with the orb radius',
    Math.abs(Math.hypot(p0[0] - pose.x, p0[1] - pose.y, p0[2] - pose.z)
      - Math.hypot(...PORT_OFFSETS[0]) * pose.radius) < 1e-6)
  const ports = PORT_OFFSETS.map((_, i) => portWorld(pose, i))
  check('all four ports are below the orb centre', ports.every((p) => p[1] < pose.y))
  const lens = lensWorld(pose)
  check('the lens is above the orb centre', lens[1] > pose.y)
}

console.log(fails ? `\n${fails} failed.` : '\nemitterOrbs ok.')
process.exit(fails ? 1 : 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx src/lib/samsara/emitterOrbs.check.ts`
Expected: FAIL — `Cannot find module './emitterOrbs'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/samsara/emitterOrbs.ts`:

```ts
import { PORT_OFFSETS, LENS_OFFSET, type EmittersConfig, type OrbSlotConfig } from './types'

/**
 * Where the two emitter orbs are, in the room's world units.
 *
 * ── Frame of reference ──────────────────────────────────────────────
 *
 * World units, origin at the room's centre, +Z toward the camera — the same
 * frame `room.ts` builds in and `cameraHandoff` solves against. Config is in
 * VIEWPORT FRACTIONS, which this module converts once, so the composition holds
 * at every viewport and every ROOM.DEPTH.
 *
 * ⚠️ ONE radius for both orbs. They are the same object at two depths (spec
 * §6.1); apparent size difference comes from DEPTH_FRAC and the perspective
 * camera, never from a second size value.
 */

export type OrbSlot = 'near' | 'far'

export type OrbCtx = {
  W: number
  H: number
  mobile: boolean
  /** ROOM.DEPTH in world units. */
  roomDepth: number
  /** The room camera's z, so entry can start genuinely behind it. */
  camZ: number
}

export type OrbPose = {
  x: number
  y: number
  z: number
  /** World-unit radius. Identical for both slots, by construction. */
  radius: number
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Ease-out cubic. The orbs decelerate into their slots rather than stopping dead. */
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

const slotOf = (slot: OrbSlot, cfg: EmittersConfig, ctx: OrbCtx): OrbSlotConfig =>
  ctx.mobile
    ? slot === 'near' ? cfg.MOBILE_NEAR : cfg.MOBILE_FAR
    : slot === 'near' ? cfg.NEAR : cfg.FAR

/**
 * The orb's world radius.
 *
 * SIZE_FRAC is an on-screen height fraction, matching LANDING.SIZE_FRAC's
 * semantics. It is converted against the room's own depth rather than through a
 * projection solve, because the orbs are decorative and a half-pixel of size
 * error is invisible — unlike SAMSARA's seam, which needs cameraHandoff.
 */
const radiusOf = (cfg: EmittersConfig, ctx: OrbCtx): number => {
  const frac = ctx.mobile ? cfg.MOBILE_SIZE_FRAC : cfg.SIZE_FRAC
  return (frac * ctx.roomDepth) / 2
}

export function orbParkedPose(slot: OrbSlot, cfg: EmittersConfig, ctx: OrbCtx): OrbPose {
  const s = slotOf(slot, cfg, ctx)
  const aspect = ctx.W / ctx.H
  const halfH = ctx.roomDepth / 2
  const halfW = halfH * aspect
  return {
    // X_FRAC/Y_FRAC are 0..1 across the viewport with y DOWN, matching
    // LANDING's convention. World y is UP, hence the negation.
    x: (s.X_FRAC - 0.5) * 2 * halfW,
    y: -(s.Y_FRAC - 0.5) * 2 * halfH,
    z: ctx.camZ - s.DEPTH_FRAC * ctx.roomDepth,
    radius: radiusOf(cfg, ctx),
  }
}

/** How long after the sequence's start this slot begins moving. */
const startDelay = (slot: OrbSlot, cfg: EmittersConfig): number =>
  slot === 'near' ? 0 : cfg.ENTRY_STAGGER_MS

export function orbPoseAt(
  slot: OrbSlot,
  tMs: number,
  cfg: EmittersConfig,
  ctx: OrbCtx,
): OrbPose {
  const parked = orbParkedPose(slot, cfg, ctx)
  const p = clamp01((tMs - startDelay(slot, cfg)) / cfg.ENTRY_MS)
  const e = easeOut(p)

  // Entry begins BEHIND the camera and flies forward past the viewer into the
  // room (spec §5.1). Starting inside the frustum would have them fade in
  // rather than arrive.
  const startZ = ctx.camZ + ctx.roomDepth * 0.35
  // A gentle lateral sweep, so the path is an arc rather than a ruler line.
  const startX = parked.x * 0.35
  const startY = parked.y * 0.55

  return {
    x: startX + (parked.x - startX) * e,
    y: startY + (parked.y - startY) * e,
    z: startZ + (parked.z - startZ) * e,
    radius: parked.radius,
  }
}

/**
 * Idle float, in WORLD units (BOB_AMP is in orb radii).
 *
 * ⚠️ The two slots are deliberately out of phase. In phase they read as one
 * rigid object on a spring rather than as two independently hovering machines.
 */
export function orbBobY(slot: OrbSlot, tMs: number, cfg: EmittersConfig): number {
  const phase = slot === 'near' ? 0 : Math.PI * 0.6
  return Math.sin((tMs / cfg.BOB_MS) * Math.PI * 2 + phase) * cfg.BOB_AMP
}

/** Port `i`'s world position for a given pose. Offsets are in orb radii. */
export function portWorld(pose: OrbPose, i: number): [number, number, number] {
  const o = PORT_OFFSETS[i]
  return [pose.x + o[0] * pose.radius, pose.y + o[1] * pose.radius, pose.z + o[2] * pose.radius]
}

/** The hologram lens's world position — where the shafts originate. */
export function lensWorld(pose: OrbPose): [number, number, number] {
  return [
    pose.x + LENS_OFFSET[0] * pose.radius,
    pose.y + LENS_OFFSET[1] * pose.radius,
    pose.z + LENS_OFFSET[2] * pose.radius,
  ]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx src/lib/samsara/emitterOrbs.check.ts`
Expected: PASS, `emitterOrbs ok.`

If `bob stays within its amplitude` fails, `BOB_AMP` is being applied in world units instead of orb radii — it is a radii value and the engine scales it.

- [ ] **Step 5: Add to `verify:config` and commit**

In `package.json`, append to the `verify:config` chain:
`&& node --import tsx src/lib/samsara/emitterOrbs.check.ts`

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/emitterOrbs.ts src/lib/samsara/emitterOrbs.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "emitterOrbs: parked poses, entry path, out-of-phase bob"
```

---

## Task 3: `orbSmoke.ts` — thrust and cadence

**Files:**
- Create: `src/lib/samsara/orbSmoke.ts`
- Create: `src/lib/samsara/orbSmoke.check.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `EmittersConfig` (Task 1), `PORT_OFFSETS` (Task 1).
- Produces:
  - `type Puff = { x,y,z,vx,vy,vz: number; born: number; life: number; size: number; seed: number; port: number }`
  - `type PuffSample = { i: number; x: number; y: number; z: number; alpha: number; size: number; seed: number }`
  - `makeSmokePool(n: number): Puff[]`
  - `class SmokeState { constructor(pool: Puff[], rnd: () => number); update(cfg: EmittersConfig, mode: 'thrust' | 'cadence' | 'off', elapsedMs: number, dtMs: number): number; sample(nowMs: number, cfg: EmittersConfig): PuffSample[] }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/orbSmoke.check.ts`:

```ts
import { DEFAULT_SEQUENCE } from './types'
import { makeSmokePool, SmokeState } from './orbSmoke'

let fails = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else { fails++; console.error(`not ok ${label}   ${note}`) }
}

const cfg = DEFAULT_SEQUENCE.EMITTERS
/** Deterministic, so a failure is reproducible. */
const seeded = () => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff }

// ── off emits nothing ───────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), seeded())
  check('off spawns nothing', st.update(cfg, 'off', 0, 16) === 0)
  check('off stays empty after a second', st.update(cfg, 'off', 1000, 16) === 0)
}

// ── thrust is continuous ────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(512), seeded())
  let total = 0
  for (let t = 0; t < 1000; t += 16) total += st.update(cfg, 'thrust', t, 16)
  // THRUST_RATE is puffs/sec/port across four ports.
  const want = cfg.THRUST_RATE * 4
  check('thrust emits at roughly its rate over one second',
    Math.abs(total - want) / want < 0.2, `${total} vs ~${want}`)
  check('thrust uses all four ports',
    new Set(st.sample(1000, cfg).map((_, i) => i % 4)).size === 4)
}

// ── cadence is discrete ─────────────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), seeded())
  // ⚠️ The first cadenced burst waits a FULL interval after parking rather
  // than firing on the arrival frame — it would otherwise land on top of the
  // thrust smoke still dissipating and read as a continuation of it.
  let atZero = st.update(cfg, 'cadence', 0, 16)
  check('nothing fires on the frame it parks', atZero === 0)

  let before = 0
  for (let t = 16; t < cfg.CADENCE_MS - 20; t += 16) before += st.update(cfg, 'cadence', t, 16)
  check('nothing fires part-way through the first interval', before === 0, `${before}`)

  const at1 = st.update(cfg, 'cadence', cfg.CADENCE_MS, 16)
  check('a burst fires at the interval', at1 === cfg.CADENCE_PUFFS * 4, `${at1}`)

  // Three intervals, not one — a single reading cannot distinguish a cadence
  // from a one-shot.
  let bursts = 0
  for (let t = cfg.CADENCE_MS + 16; t <= cfg.CADENCE_MS * 4; t += 16) {
    if (st.update(cfg, 'cadence', t, 16) > 0) bursts++
  }
  check('and keeps firing every interval', bursts === 3, `${bursts} bursts in 3 intervals`)
}

// ── puffs live, move, and die ───────────────────────────────────────
{
  const st = new SmokeState(makeSmokePool(256), seeded())
  st.update(cfg, 'cadence', cfg.CADENCE_MS, 16)
  const born = st.sample(cfg.CADENCE_MS + 10, cfg)
  check('a fresh burst is visible', born.length === cfg.CADENCE_PUFFS * 4, `${born.length}`)
  check('fresh puffs are near opaque', born.every((p) => p.alpha > 0.5))
  const mid = st.sample(cfg.CADENCE_MS + cfg.PUFF_LIFE_MS * 0.75, cfg)
  check('puffs fade as they age', mid.every((p) => p.alpha < 0.6), `${mid[0]?.alpha.toFixed(2)}`)
  const dead = st.sample(cfg.CADENCE_MS + cfg.PUFF_LIFE_MS + 50, cfg)
  check('puffs die at their lifetime', dead.length === 0, `${dead.length} still alive`)
}

// ── the pool is shared and must not starve the entrance ─────────────
{
  // Thrust is the denser of the two behaviours; a pool sized for the cadence
  // alone silently truncates the entry plume.
  const small = new SmokeState(makeSmokePool(8), seeded())
  let spawned = 0
  for (let t = 0; t < 500; t += 16) spawned += small.update(cfg, 'thrust', t, 16)
  check('a small pool recycles rather than throwing', spawned > 0 && Number.isFinite(spawned))
}

console.log(fails ? `\n${fails} failed.` : '\norbSmoke ok.')
process.exit(fails ? 1 : 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx src/lib/samsara/orbSmoke.check.ts`
Expected: FAIL — `Cannot find module './orbSmoke'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/samsara/orbSmoke.ts`:

```ts
import { PORT_OFFSETS, type EmittersConfig } from './types'

/**
 * The emitter orbs' smoke — pure particle bookkeeping, no GL.
 *
 * ── Why this is NOT `roomBurst` ─────────────────────────────────────
 *
 * `roomBurst` works in BODY RADII and spawns on a disc BEHIND SAMSARA, so
 * puffs emerge from the silhouette's edge. This works in ORB RADII from FOUR
 * DISCRETE PORTS at the orb's base and drifts down and out.
 *
 * Generalising `roomBurst` to cover both would mean editing frozen,
 * gate-covered code to serve a case it was not designed for. Forking it would
 * invite two copies to drift. So: a sibling — exactly as `roomBurst` is a
 * sibling of `mascotTrail`, and for the same reason. This project now runs
 * three particle systems and each split has paid for itself.
 *
 * ── Two behaviours, one pool ────────────────────────────────────────
 *
 * THRUST is the continuous afterburner plume while the orbs fly in. CADENCE is
 * the permanent every-3s burst once parked. They share one pool per orb.
 *
 * ⚠️ Size the pool for THRUST, which is far denser. A pool sized for the
 * cadence truncates the entrance silently — puffs simply stop appearing.
 */

export type Puff = {
  /** Orb radii, origin at the orb centre. */
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  born: number
  life: number
  size: number
  seed: number
  port: number
}

export type PuffSample = {
  i: number
  x: number
  y: number
  z: number
  alpha: number
  size: number
  seed: number
}

export function makeSmokePool(size: number): Puff[] {
  const pool = new Array<Puff>(size)
  for (let i = 0; i < size; i++) {
    pool[i] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: -1, life: 0, size: 0, seed: 0, port: 0 }
  }
  return pool
}

export type SmokeMode = 'thrust' | 'cadence' | 'off'

export class SmokeState {
  private pool: Puff[]
  private rnd: () => number
  private next = 0
  /** Fractional puff budget carried between frames, so a low rate still emits. */
  private carry = 0
  /** Index of the last cadence burst already fired. */
  private lastBurst = 0

  constructor(pool: Puff[], rnd: () => number) {
    this.pool = pool
    this.rnd = rnd
  }

  private spawn(cfg: EmittersConfig, nowMs: number, port: number, spread: number) {
    const p = this.pool[this.next]
    this.next = (this.next + 1) % this.pool.length
    const o = PORT_OFFSETS[port]
    p.x = o[0]
    p.y = o[1]
    p.z = o[2]
    // Ports point DOWN, so the plume falls away and outward.
    const a = this.rnd() * Math.PI * 2
    const r = this.rnd() * spread
    p.vx = Math.cos(a) * r * 0.4 + o[0] * 0.3
    p.vy = -0.5 - this.rnd() * 0.4
    p.vz = Math.sin(a) * r * 0.4 + o[2] * 0.3
    p.born = nowMs
    p.life = cfg.PUFF_LIFE_MS * (0.75 + this.rnd() * 0.5)
    p.size = cfg.PUFF_SIZE * (0.7 + this.rnd() * 0.6)
    p.seed = this.rnd()
    p.port = port
  }

  /**
   * Advance and emit. Returns how many puffs were spawned this step, which is
   * what the check file asserts a cadence on.
   *
   * `elapsedMs` is time within the CURRENT mode, not absolute — so the cadence
   * counts from the moment the orb parked.
   */
  update(cfg: EmittersConfig, mode: SmokeMode, elapsedMs: number, dtMs: number): number {
    if (mode === 'off') return 0

    if (mode === 'thrust') {
      // rate is per SECOND per PORT.
      this.carry += (cfg.THRUST_RATE * 4 * dtMs) / 1000
      const n = Math.floor(this.carry)
      this.carry -= n
      for (let i = 0; i < n; i++) this.spawn(cfg, elapsedMs, i % 4, cfg.THRUST_SPREAD)
      return n
    }

    // Cadence. ⚠️ The first burst waits a FULL interval — firing on the
    // arrival frame lands it on top of the thrust smoke still dissipating and
    // reads as a continuation of it rather than as its own event.
    const due = Math.floor(elapsedMs / cfg.CADENCE_MS)
    if (due <= this.lastBurst) return 0
    this.lastBurst = due
    for (let port = 0; port < 4; port++) {
      for (let k = 0; k < cfg.CADENCE_PUFFS; k++) {
        this.spawn(cfg, elapsedMs, port, cfg.THRUST_SPREAD * 0.6)
      }
    }
    return cfg.CADENCE_PUFFS * 4
  }

  /** Live puffs at `nowMs`, in orb radii. Dead ones are simply omitted. */
  sample(nowMs: number, cfg: EmittersConfig): PuffSample[] {
    const out: PuffSample[] = []
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]
      if (p.born < 0) continue
      const age = nowMs - p.born
      if (age < 0 || age >= p.life) continue
      const t = age / p.life
      const s = age / 1000
      out.push({
        i,
        x: p.x + p.vx * s,
        y: p.y + p.vy * s,
        z: p.z + p.vz * s,
        // Rise then fall, so a puff blooms rather than appearing at full size.
        alpha: cfg.PUFF_OPACITY * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 3.2,
        size: p.size * (1 + t * 1.6),
        seed: p.seed,
      })
    }
    return out
  }

  reset() {
    for (const p of this.pool) p.born = -1
    this.next = 0
    this.carry = 0
    this.lastBurst = 0
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx src/lib/samsara/orbSmoke.check.ts`
Expected: PASS, `orbSmoke ok.`

If `fresh puffs are near opaque` fails, the `alpha` scale factor is wrong for the configured `PUFF_OPACITY` — adjust the `3.2` multiplier so a fresh puff lands above 0.5 and a 75%-aged one below 0.6.

- [ ] **Step 5: Add to `verify:config` and commit**

Append `&& node --import tsx src/lib/samsara/orbSmoke.check.ts` to `verify:config`.

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/orbSmoke.ts src/lib/samsara/orbSmoke.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "orbSmoke: thrust during entry, permanent 3s cadence after"
```

---

## Task 4: `hologramGeometry.ts` — screen quad, shafts, projected rect

**Files:**
- Create: `src/lib/samsara/hologramGeometry.ts`
- Create: `src/lib/samsara/hologramGeometry.check.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `HologramConfig` (Task 1), `OrbCtx`/`OrbPose` (Task 2).
- Produces:
  - `type Vec3 = [number, number, number]`
  - `type ScreenQuad = { corners: [Vec3, Vec3, Vec3, Vec3]; centre: Vec3; w: number; h: number }`
  - `type Rect = { x: number; y: number; w: number; h: number }`
  - `screenQuad(cfg: HologramConfig, ctx: OrbCtx): ScreenQuad`
  - `projectQuad(quad: ScreenQuad, project: (p: Vec3) => [number, number]): Rect`
  - `shaftFor(lens: Vec3, quad: ScreenQuad, cfg: HologramConfig): { origin: Vec3; target: Vec3; length: number; spread: number }`
  - `flickerAt(tMs: number, cfg: HologramConfig): number`

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/hologramGeometry.check.ts`:

```ts
import { DEFAULT_SEQUENCE } from './types'
import { screenQuad, projectQuad, shaftFor, flickerAt, type Vec3 } from './hologramGeometry'
import type { OrbCtx } from './emitterOrbs'

let fails = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else { fails++; console.error(`not ok ${label}   ${note}`) }
}

const cfg = DEFAULT_SEQUENCE.HOLOGRAM
const land: OrbCtx = { W: 1440, H: 900, mobile: false, roomDepth: 42, camZ: 30 }
const port: OrbCtx = { W: 390, H: 844, mobile: true, roomDepth: 42, camZ: 30 }

// ── the quad ────────────────────────────────────────────────────────
{
  const q = screenQuad(cfg, land)
  check('four corners', q.corners.length === 4)
  check('positive extent', q.w > 0 && q.h > 0)
  check('corners are coplanar in z', new Set(q.corners.map((c) => c[2].toFixed(6))).size === 1)
  const centreX = q.corners.reduce((s, c) => s + c[0], 0) / 4
  check('centre matches the corners', Math.abs(centreX - q.centre[0]) < 1e-6)
  check('landscape places it left of centre', q.centre[0] < 0, `${q.centre[0].toFixed(2)}`)
}
{
  const q = screenQuad(cfg, port)
  check('portrait places it below centre', q.centre[1] < 0, `${q.centre[1].toFixed(2)}`)
  check('portrait is horizontally centred', Math.abs(q.centre[0]) < 1e-6)
  check('portrait is proportionally wider', q.w / q.h > screenQuad(cfg, land).w / screenQuad(cfg, land).h * 0.5)
}

// ── the projected rect ──────────────────────────────────────────────
{
  const q = screenQuad(cfg, land)
  // A trivial orthographic-ish projection: enough to prove the rect is the
  // BOUNDING BOX of the four projected corners, which is the contract.
  const project = (p: Vec3): [number, number] => [720 + p[0] * 10, 450 - p[1] * 10]
  const r = projectQuad(q, project)
  const xs = q.corners.map((c) => project(c)[0])
  const ys = q.corners.map((c) => project(c)[1])
  check('rect x is the min of projected corners', Math.abs(r.x - Math.min(...xs)) < 1e-6)
  check('rect y is the min of projected corners', Math.abs(r.y - Math.min(...ys)) < 1e-6)
  check('rect w spans the projected corners',
    Math.abs(r.w - (Math.max(...xs) - Math.min(...xs))) < 1e-6)
  check('rect h spans the projected corners',
    Math.abs(r.h - (Math.max(...ys) - Math.min(...ys))) < 1e-6)
}

// ── shafts ──────────────────────────────────────────────────────────
{
  const q = screenQuad(cfg, land)
  const lens: Vec3 = [-14, -8, 22]
  const s = shaftFor(lens, q, cfg)
  check('the shaft starts at the lens', s.origin[0] === lens[0] && s.origin[1] === lens[1])
  check('the shaft targets the screen centre', Math.abs(s.target[0] - q.centre[0]) < 1e-6)
  check('the shaft has positive length', s.length > 0)
  check('length matches lens-to-centre distance',
    Math.abs(s.length - Math.hypot(q.centre[0] - lens[0], q.centre[1] - lens[1], q.centre[2] - lens[2])) < 1e-6)
  check('spread is carried from config', s.spread === cfg.SHAFT_SPREAD)
}

// ── flicker ─────────────────────────────────────────────────────────
{
  check('no dip between flickers', flickerAt(cfg.FLICKER_MS * 0.5, cfg) === 0)
  const at = flickerAt(cfg.FLICKER_MS + cfg.FLICKER_DUR_MS * 0.5, cfg)
  check('a dip occurs at the interval', at > 0, `${at.toFixed(3)}`)
  check('the dip never exceeds its configured depth', at <= cfg.FLICKER_DEPTH + 1e-9)
  // Three intervals, so a one-shot cannot pass as a cadence.
  let dips = 0
  for (let k = 1; k <= 3; k++) {
    if (flickerAt(cfg.FLICKER_MS * k + cfg.FLICKER_DUR_MS * 0.5, cfg) > 0) dips++
  }
  check('and it repeats every interval', dips === 3, `${dips}`)
  check('the flicker never fully extinguishes the glass',
    flickerAt(cfg.FLICKER_MS + cfg.FLICKER_DUR_MS * 0.5, cfg) < 1)
}

console.log(fails ? `\n${fails} failed.` : '\nhologramGeometry ok.')
process.exit(fails ? 1 : 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx src/lib/samsara/hologramGeometry.check.ts`
Expected: FAIL — `Cannot find module './hologramGeometry'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/samsara/hologramGeometry.ts`:

```ts
import type { HologramConfig } from './types'
import type { OrbCtx } from './emitterOrbs'

/**
 * The holographic screen's geometry, and the rect a DOM layer will read.
 *
 * ⚠️ The projected rect is the CONTRACT between WebGL and the DOM layer that
 * will later carry subtitles and option buttons (spec §4.1). It must be the
 * bounding box of the four PROJECTED corners, not a projection of the centre
 * plus the world size — under perspective those differ, and the difference is
 * exactly the kind of subtle wrongness that positions text slightly off with
 * nothing looking broken.
 */

export type Vec3 = [number, number, number]

export type ScreenQuad = {
  /** TL, TR, BR, BL in world space. Coplanar. */
  corners: [Vec3, Vec3, Vec3, Vec3]
  centre: Vec3
  w: number
  h: number
}

export type Rect = { x: number; y: number; w: number; h: number }

export function screenQuad(cfg: HologramConfig, ctx: OrbCtx): ScreenQuad {
  const halfH = ctx.roomDepth / 2
  const halfW = halfH * (ctx.W / ctx.H)

  const wf = ctx.mobile ? cfg.MOBILE_W_FRAC : cfg.W_FRAC
  const hf = ctx.mobile ? cfg.MOBILE_H_FRAC : cfg.H_FRAC
  const xf = ctx.mobile ? cfg.MOBILE_X_FRAC : cfg.X_FRAC
  const yf = ctx.mobile ? cfg.MOBILE_Y_FRAC : cfg.Y_FRAC

  const w = wf * 2 * halfW
  const h = hf * 2 * halfH
  const cx = (xf - 0.5) * 2 * halfW
  const cy = -(yf - 0.5) * 2 * halfH
  // Parallel to the back wall, standing well in front of it so the shafts have
  // somewhere to travel and the glass never z-fights the wall.
  const cz = ctx.camZ - ctx.roomDepth * 0.55

  const hw = w / 2
  const hh = h / 2
  return {
    corners: [
      [cx - hw, cy + hh, cz],
      [cx + hw, cy + hh, cz],
      [cx + hw, cy - hh, cz],
      [cx - hw, cy - hh, cz],
    ],
    centre: [cx, cy, cz],
    w,
    h,
  }
}

/**
 * The screen's axis-aligned bounding box in CSS pixels.
 *
 * `project` maps a world point to viewport pixels — the caller supplies it, so
 * this module stays free of THREE and remains unit-testable.
 */
export function projectQuad(quad: ScreenQuad, project: (p: Vec3) => [number, number]): Rect {
  const pts = quad.corners.map(project)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function shaftFor(
  lens: Vec3,
  quad: ScreenQuad,
  cfg: HologramConfig,
): { origin: Vec3; target: Vec3; length: number; spread: number } {
  const target = quad.centre
  return {
    origin: lens,
    target,
    length: Math.hypot(target[0] - lens[0], target[1] - lens[1], target[2] - lens[2]),
    spread: cfg.SHAFT_SPREAD,
  }
}

/**
 * The glass's brightness dip at `tMs`. 0 = clear, FLICKER_DEPTH = deepest.
 *
 * ⚠️ This applies to the GLASS ONLY. The published rect and the `live` state
 * must not change with it (spec §5.5) — this screen will carry subtitles, and
 * text that flickers on a 5s cycle defeats the accessibility feature it exists
 * to provide. `samsara-hologram.mjs` asserts the rect holds steady through a
 * dip.
 */
export function flickerAt(tMs: number, cfg: HologramConfig): number {
  if (tMs < cfg.FLICKER_MS) return 0
  const into = tMs % cfg.FLICKER_MS
  if (into >= cfg.FLICKER_DUR_MS) return 0
  const p = into / cfg.FLICKER_DUR_MS
  // Two quick stutters rather than one smooth dip, so it reads as an unstable
  // projection rather than as a pulse.
  return Math.abs(Math.sin(p * Math.PI * 2)) * cfg.FLICKER_DEPTH
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx src/lib/samsara/hologramGeometry.check.ts`
Expected: PASS, `hologramGeometry ok.`

- [ ] **Step 5: Add to `verify:config` and commit**

Append `&& node --import tsx src/lib/samsara/hologramGeometry.check.ts`.

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/hologramGeometry.ts src/lib/samsara/hologramGeometry.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "hologramGeometry: screen quad, shafts, projected rect, flicker"
```

---

## Task 5: `HologramController.ts` — the six-phase machine

**Files:**
- Create: `src/lib/samsara/HologramController.ts`
- Create: `src/lib/samsara/HologramController.check.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `EmittersConfig`, `HologramConfig` (Task 1).
- Produces:
  - `type HoloPhase = 'dormant' | 'entering' | 'parked' | 'emitting' | 'forming' | 'live'`
  - `class HologramController { phase: HoloPhase; phaseMs: number; totalMs: number; start(): void; reset(): void; update(cfg: SequenceConfig, dtMs: number): HoloPhase; entry01(cfg): number; form01(cfg): number; smokeMode(): 'thrust' | 'cadence' | 'off'; parkedMs(): number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/HologramController.check.ts`:

```ts
import { DEFAULT_SEQUENCE } from './types'
import { HologramController } from './HologramController'

let fails = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else { fails++; console.error(`not ok ${label}   ${note}`) }
}

const cfg = DEFAULT_SEQUENCE
const run = (c: HologramController, ms: number, step = 16) => {
  for (let t = 0; t < ms; t += step) c.update(cfg, step)
}

// ── dormant until started ───────────────────────────────────────────
{
  const c = new HologramController()
  check('starts dormant', c.phase === 'dormant')
  run(c, 10000)
  check('stays dormant without start()', c.phase === 'dormant', c.phase)
  check('dormant emits no smoke', c.smokeMode() === 'off')
}

// ── the four beats, in order ────────────────────────────────────────
{
  const c = new HologramController()
  c.start()
  check('start() enters the entry beat', c.phase === 'entering', c.phase)
  check('entry runs thrust smoke', c.smokeMode() === 'thrust')

  // Entry ends only after the LAGGING orb has arrived — entry + stagger.
  run(c, cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS + 40)
  check('both orbs parked before the beat advances', c.phase !== 'entering', c.phase)
  check('parked switches smoke to the cadence', c.smokeMode() === 'cadence')

  run(c, 400)
  check('then it emits', c.phase === 'emitting' || c.phase === 'forming', c.phase)

  run(c, cfg.HOLOGRAM.FORM_MS + 1200)
  check('and reaches live', c.phase === 'live', c.phase)
  check('live keeps the cadence running', c.smokeMode() === 'cadence')
}

// ── live is terminal ────────────────────────────────────────────────
{
  const c = new HologramController()
  c.start()
  run(c, 60000)
  check('live is terminal', c.phase === 'live', c.phase)
  // The cadence and flicker are permanent (owner decisions #3, #4). A phase
  // that advanced past live would stop them.
  check('and smoke never stops', c.smokeMode() === 'cadence')
}

// ── progress ratios ─────────────────────────────────────────────────
{
  const c = new HologramController()
  c.start()
  check('entry starts at 0', c.entry01(cfg) === 0)
  run(c, (cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS) / 2)
  const mid = c.entry01(cfg)
  check('entry progresses', mid > 0.3 && mid < 0.8, `${mid.toFixed(2)}`)
  run(c, 30000)
  check('entry saturates at 1', c.entry01(cfg) === 1)
  check('form saturates at 1', c.form01(cfg) === 1)
}

// ── reset ───────────────────────────────────────────────────────────
{
  const c = new HologramController()
  c.start()
  run(c, 30000)
  c.reset()
  check('reset returns to dormant', c.phase === 'dormant')
  check('reset clears the clock', c.totalMs === 0)
  check('reset stops smoke', c.smokeMode() === 'off')
  // The sequence leaves and re-enters `landed` on every replay; a controller
  // that could not restart would run once per page load.
  c.start()
  check('and it can start again', c.phase === 'entering')
}

// ── parkedMs drives the cadence clock ───────────────────────────────
{
  const c = new HologramController()
  c.start()
  check('parkedMs is 0 while entering', c.parkedMs() === 0)
  run(c, cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS + 1000)
  check('parkedMs counts from the park, not from start',
    c.parkedMs() > 900 && c.parkedMs() < 1100, `${c.parkedMs().toFixed(0)}`)
}

console.log(fails ? `\n${fails} failed.` : '\nHologramController ok.')
process.exit(fails ? 1 : 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx src/lib/samsara/HologramController.check.ts`
Expected: FAIL — `Cannot find module './HologramController'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/samsara/HologramController.ts`:

```ts
import type { SequenceConfig } from './types'
import type { SmokeMode } from './orbSmoke'

/**
 * The four beats, as a phase machine.
 *
 * ⚠️ This is DELIBERATELY separate from `SequenceController`. That machine's
 * modes (`idle → charge1..3 → committed → landed → exiting`) are asserted by
 * name in samsara-kill-switch, samsara-seam, samsara-room-scroll,
 * samsara-arms-after-intro, samsara-reduced-motion and the bench. Adding
 * hologram phases there would ripple through every one of them for no gain.
 *
 * This runs INSIDE `landed`: started when the sequence arrives, reset when it
 * leaves.
 */
export type HoloPhase = 'dormant' | 'entering' | 'parked' | 'emitting' | 'forming' | 'live'

/** Beat 3's dwell — parked and floating before the lenses light. */
const PARKED_HOLD_MS = 260
/** Beat 3's own ramp before the shafts converge into a screen. */
const EMITTING_MS = 520

export class HologramController {
  phase: HoloPhase = 'dormant'
  /** Milliseconds inside the current phase. */
  phaseMs = 0
  /** Milliseconds since start(). */
  totalMs = 0
  /** Milliseconds since the LAGGING orb parked. Drives the smoke cadence. */
  private sinceParked = 0

  start() {
    this.phase = 'entering'
    this.phaseMs = 0
    this.totalMs = 0
    this.sinceParked = 0
  }

  reset() {
    this.phase = 'dormant'
    this.phaseMs = 0
    this.totalMs = 0
    this.sinceParked = 0
  }

  /** Entry is over only when the LAGGING orb has arrived. */
  private entryTotal(cfg: SequenceConfig) {
    return cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS
  }

  update(cfg: SequenceConfig, dtMs: number): HoloPhase {
    if (this.phase === 'dormant') return this.phase

    this.phaseMs += dtMs
    this.totalMs += dtMs
    if (this.phase !== 'entering') this.sinceParked += dtMs

    const advance = (to: HoloPhase) => {
      this.phase = to
      this.phaseMs = 0
    }

    switch (this.phase) {
      case 'entering':
        if (this.phaseMs >= this.entryTotal(cfg)) advance('parked')
        break
      case 'parked':
        if (this.phaseMs >= PARKED_HOLD_MS) advance('emitting')
        break
      case 'emitting':
        if (this.phaseMs >= EMITTING_MS) advance('forming')
        break
      case 'forming':
        if (this.phaseMs >= cfg.HOLOGRAM.FORM_MS) advance('live')
        break
      case 'live':
        // Terminal, deliberately. The 3s smoke cadence and 5s flicker are
        // permanent (owner decisions #3 and #4); a phase past `live` would
        // stop them.
        break
    }
    return this.phase
  }

  entry01(cfg: SequenceConfig): number {
    if (this.phase === 'dormant') return 0
    if (this.phase !== 'entering') return 1
    return Math.min(1, this.phaseMs / this.entryTotal(cfg))
  }

  form01(cfg: SequenceConfig): number {
    if (this.phase === 'live') return 1
    if (this.phase !== 'forming') return 0
    return Math.min(1, this.phaseMs / cfg.HOLOGRAM.FORM_MS)
  }

  /** Which smoke behaviour is running — spec §5.2's two behaviours. */
  smokeMode(): SmokeMode {
    if (this.phase === 'dormant') return 'off'
    if (this.phase === 'entering') return 'thrust'
    return 'cadence'
  }

  /** Clock for the cadence, counting from the park rather than from start(). */
  parkedMs(): number {
    return this.phase === 'entering' || this.phase === 'dormant' ? 0 : this.sinceParked
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx src/lib/samsara/HologramController.check.ts`
Expected: PASS, `HologramController ok.`

- [ ] **Step 5: Add to `verify:config` and commit**

Append `&& node --import tsx src/lib/samsara/HologramController.check.ts`.

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/HologramController.ts src/lib/samsara/HologramController.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "HologramController: six phases inside landed, live terminal"
```

---

## Task 6: Resolver and CMS round trip

**Files:**
- Modify: `src/lib/samsara/resolveSamsara.ts`
- Modify: `src/lib/samsara/resolveSamsara.check.ts`

**Interfaces:**
- Consumes: `EmittersConfig`, `HologramConfig` (Task 1).
- Produces: `resolveSamsara` returns both groups; `toSamsaraPayload` round-trips them.

- [ ] **Step 1: Add both groups to the non-default fixture**

In `src/lib/samsara/resolveSamsara.check.ts`, inside the fixture object that asserts a full round trip with **nothing left at its default**, add:

```ts
    EMITTERS: {
      SIZE_FRAC: 0.21,
      MOBILE_SIZE_FRAC: 0.11,
      NEAR: { X_FRAC: 0.09, Y_FRAC: 0.79, DEPTH_FRAC: 0.22 },
      FAR: { X_FRAC: 0.51, Y_FRAC: 0.66, DEPTH_FRAC: 0.81 },
      MOBILE_NEAR: { X_FRAC: 0.19, Y_FRAC: 0.88, DEPTH_FRAC: 0.34 },
      MOBILE_FAR: { X_FRAC: 0.81, Y_FRAC: 0.88, DEPTH_FRAC: 0.34 },
      ENTRY_MS: 1850,
      ENTRY_STAGGER_MS: 410,
      BOB_AMP: 0.11,
      BOB_MS: 2900,
      THRUST_RATE: 51,
      THRUST_SPREAD: 0.62,
      CADENCE_MS: 2600,
      CADENCE_PUFFS: 4,
      PUFF_SIZE: 0.29,
      PUFF_LIFE_MS: 1250,
      PUFF_COLOR: '#B0A382',
      PUFF_OPACITY: 0.41,
    },
    HOLOGRAM: {
      W_FRAC: 0.47,
      H_FRAC: 0.39,
      X_FRAC: 0.27,
      Y_FRAC: 0.39,
      MOBILE_W_FRAC: 0.71,
      MOBILE_H_FRAC: 0.27,
      MOBILE_X_FRAC: 0.48,
      MOBILE_Y_FRAC: 0.69,
      FORM_MS: 1150,
      FLICKER_MS: 4400,
      FLICKER_DUR_MS: 210,
      FLICKER_DEPTH: 0.38,
      GLASS_COLOR: '#E8B733',
      GLASS_OPACITY: 0.26,
      SHAFT_COLOR: '#E8B733',
      SHAFT_OPACITY: 0.19,
      SHAFT_SPREAD: 0.48,
    },
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx src/lib/samsara/resolveSamsara.check.ts`
Expected: FAIL — the round trip drops both groups; the "nothing left at its default" assertion reports `EMITTERS` and `HOLOGRAM`.

- [ ] **Step 3: Extend the resolver**

In `src/lib/samsara/resolveSamsara.ts`, add to the CMS shape type (beside `burst`):

```ts
  emitters?: {
    sizeFrac?: number | null
    mobileSizeFrac?: number | null
    near?: { xFrac?: number | null; yFrac?: number | null; depthFrac?: number | null } | null
    far?: { xFrac?: number | null; yFrac?: number | null; depthFrac?: number | null } | null
    mobileNear?: { xFrac?: number | null; yFrac?: number | null; depthFrac?: number | null } | null
    mobileFar?: { xFrac?: number | null; yFrac?: number | null; depthFrac?: number | null } | null
    entryMs?: number | null
    entryStaggerMs?: number | null
    bobAmp?: number | null
    bobMs?: number | null
    thrustRate?: number | null
    thrustSpread?: number | null
    cadenceMs?: number | null
    cadencePuffs?: number | null
    puffSize?: number | null
    puffLifeMs?: number | null
    puffColor?: string | null
    puffOpacity?: number | null
  } | null
  hologram?: {
    wFrac?: number | null; hFrac?: number | null; xFrac?: number | null; yFrac?: number | null
    mobileWFrac?: number | null; mobileHFrac?: number | null
    mobileXFrac?: number | null; mobileYFrac?: number | null
    formMs?: number | null
    flickerMs?: number | null; flickerDurMs?: number | null; flickerDepth?: number | null
    glassColor?: string | null; glassOpacity?: number | null
    shaftColor?: string | null; shaftOpacity?: number | null; shaftSpread?: number | null
  } | null
```

Add the locals beside `const bu = cms?.burst ?? {}`:

```ts
  const em = cms?.emitters ?? {}
  const ho = cms?.hologram ?? {}
  const slot = (
    v: { xFrac?: number | null; yFrac?: number | null; depthFrac?: number | null } | null | undefined,
    d: { X_FRAC: number; Y_FRAC: number; DEPTH_FRAC: number },
  ) => ({
    X_FRAC: num(v?.xFrac, d.X_FRAC),
    Y_FRAC: num(v?.yFrac, d.Y_FRAC),
    DEPTH_FRAC: num(v?.depthFrac, d.DEPTH_FRAC),
  })
```

Add to the returned object, after `BURST`:

```ts
    EMITTERS: {
      SIZE_FRAC: num(em.sizeFrac, d.EMITTERS.SIZE_FRAC),
      MOBILE_SIZE_FRAC: num(em.mobileSizeFrac, d.EMITTERS.MOBILE_SIZE_FRAC),
      NEAR: slot(em.near, d.EMITTERS.NEAR),
      FAR: slot(em.far, d.EMITTERS.FAR),
      MOBILE_NEAR: slot(em.mobileNear, d.EMITTERS.MOBILE_NEAR),
      MOBILE_FAR: slot(em.mobileFar, d.EMITTERS.MOBILE_FAR),
      ENTRY_MS: num(em.entryMs, d.EMITTERS.ENTRY_MS),
      ENTRY_STAGGER_MS: num(em.entryStaggerMs, d.EMITTERS.ENTRY_STAGGER_MS),
      BOB_AMP: num(em.bobAmp, d.EMITTERS.BOB_AMP),
      BOB_MS: num(em.bobMs, d.EMITTERS.BOB_MS),
      THRUST_RATE: num(em.thrustRate, d.EMITTERS.THRUST_RATE),
      THRUST_SPREAD: num(em.thrustSpread, d.EMITTERS.THRUST_SPREAD),
      CADENCE_MS: num(em.cadenceMs, d.EMITTERS.CADENCE_MS),
      CADENCE_PUFFS: num(em.cadencePuffs, d.EMITTERS.CADENCE_PUFFS),
      PUFF_SIZE: num(em.puffSize, d.EMITTERS.PUFF_SIZE),
      PUFF_LIFE_MS: num(em.puffLifeMs, d.EMITTERS.PUFF_LIFE_MS),
      PUFF_COLOR: hex(em.puffColor, d.EMITTERS.PUFF_COLOR),
      PUFF_OPACITY: num(em.puffOpacity, d.EMITTERS.PUFF_OPACITY),
    },

    HOLOGRAM: {
      W_FRAC: num(ho.wFrac, d.HOLOGRAM.W_FRAC),
      H_FRAC: num(ho.hFrac, d.HOLOGRAM.H_FRAC),
      X_FRAC: num(ho.xFrac, d.HOLOGRAM.X_FRAC),
      Y_FRAC: num(ho.yFrac, d.HOLOGRAM.Y_FRAC),
      MOBILE_W_FRAC: num(ho.mobileWFrac, d.HOLOGRAM.MOBILE_W_FRAC),
      MOBILE_H_FRAC: num(ho.mobileHFrac, d.HOLOGRAM.MOBILE_H_FRAC),
      MOBILE_X_FRAC: num(ho.mobileXFrac, d.HOLOGRAM.MOBILE_X_FRAC),
      MOBILE_Y_FRAC: num(ho.mobileYFrac, d.HOLOGRAM.MOBILE_Y_FRAC),
      FORM_MS: num(ho.formMs, d.HOLOGRAM.FORM_MS),
      FLICKER_MS: num(ho.flickerMs, d.HOLOGRAM.FLICKER_MS),
      FLICKER_DUR_MS: num(ho.flickerDurMs, d.HOLOGRAM.FLICKER_DUR_MS),
      FLICKER_DEPTH: num(ho.flickerDepth, d.HOLOGRAM.FLICKER_DEPTH),
      GLASS_COLOR: hex(ho.glassColor, d.HOLOGRAM.GLASS_COLOR),
      GLASS_OPACITY: num(ho.glassOpacity, d.HOLOGRAM.GLASS_OPACITY),
      SHAFT_COLOR: hex(ho.shaftColor, d.HOLOGRAM.SHAFT_COLOR),
      SHAFT_OPACITY: num(ho.shaftOpacity, d.HOLOGRAM.SHAFT_OPACITY),
      SHAFT_SPREAD: num(ho.shaftSpread, d.HOLOGRAM.SHAFT_SPREAD),
    },
```

And to `toSamsaraPayload`, after the `burst` entry:

```ts
    emitters: {
      sizeFrac: c.EMITTERS.SIZE_FRAC,
      mobileSizeFrac: c.EMITTERS.MOBILE_SIZE_FRAC,
      near: { xFrac: c.EMITTERS.NEAR.X_FRAC, yFrac: c.EMITTERS.NEAR.Y_FRAC, depthFrac: c.EMITTERS.NEAR.DEPTH_FRAC },
      far: { xFrac: c.EMITTERS.FAR.X_FRAC, yFrac: c.EMITTERS.FAR.Y_FRAC, depthFrac: c.EMITTERS.FAR.DEPTH_FRAC },
      mobileNear: { xFrac: c.EMITTERS.MOBILE_NEAR.X_FRAC, yFrac: c.EMITTERS.MOBILE_NEAR.Y_FRAC, depthFrac: c.EMITTERS.MOBILE_NEAR.DEPTH_FRAC },
      mobileFar: { xFrac: c.EMITTERS.MOBILE_FAR.X_FRAC, yFrac: c.EMITTERS.MOBILE_FAR.Y_FRAC, depthFrac: c.EMITTERS.MOBILE_FAR.DEPTH_FRAC },
      entryMs: c.EMITTERS.ENTRY_MS,
      entryStaggerMs: c.EMITTERS.ENTRY_STAGGER_MS,
      bobAmp: c.EMITTERS.BOB_AMP,
      bobMs: c.EMITTERS.BOB_MS,
      thrustRate: c.EMITTERS.THRUST_RATE,
      thrustSpread: c.EMITTERS.THRUST_SPREAD,
      cadenceMs: c.EMITTERS.CADENCE_MS,
      cadencePuffs: c.EMITTERS.CADENCE_PUFFS,
      puffSize: c.EMITTERS.PUFF_SIZE,
      puffLifeMs: c.EMITTERS.PUFF_LIFE_MS,
      puffColor: c.EMITTERS.PUFF_COLOR,
      puffOpacity: c.EMITTERS.PUFF_OPACITY,
    },
    hologram: {
      wFrac: c.HOLOGRAM.W_FRAC, hFrac: c.HOLOGRAM.H_FRAC,
      xFrac: c.HOLOGRAM.X_FRAC, yFrac: c.HOLOGRAM.Y_FRAC,
      mobileWFrac: c.HOLOGRAM.MOBILE_W_FRAC, mobileHFrac: c.HOLOGRAM.MOBILE_H_FRAC,
      mobileXFrac: c.HOLOGRAM.MOBILE_X_FRAC, mobileYFrac: c.HOLOGRAM.MOBILE_Y_FRAC,
      formMs: c.HOLOGRAM.FORM_MS,
      flickerMs: c.HOLOGRAM.FLICKER_MS,
      flickerDurMs: c.HOLOGRAM.FLICKER_DUR_MS,
      flickerDepth: c.HOLOGRAM.FLICKER_DEPTH,
      glassColor: c.HOLOGRAM.GLASS_COLOR, glassOpacity: c.HOLOGRAM.GLASS_OPACITY,
      shaftColor: c.HOLOGRAM.SHAFT_COLOR, shaftOpacity: c.HOLOGRAM.SHAFT_OPACITY,
      shaftSpread: c.HOLOGRAM.SHAFT_SPREAD,
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx src/lib/samsara/resolveSamsara.check.ts` — expected PASS.
Then `npm run verify:config` — expected exit 0, and `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/resolveSamsara.ts src/lib/samsara/resolveSamsara.check.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Resolve and round-trip the emitter and hologram config"
```

---

## Task 7: CMS field groups

**Files:**
- Modify: `src/globals/SamsaraSequence.ts`

**Interfaces:**
- Consumes: `DEFAULT_SEQUENCE.EMITTERS` / `.HOLOGRAM` (Task 1), the resolver's field names (Task 6).
- Produces: two `group` fields named `emitters` and `hologram`, whose sub-field names match Task 6's CMS shape exactly.

- [ ] **Step 1: Back up the database**

Any Payload field change triggers a schema push.

```bash
cp "tampa-taruno.db" "tampa-taruno.backup-$(date +%Y-%m-%d)-pre-hologram.db"
```

- [ ] **Step 2: Add the groups**

In `src/globals/SamsaraSequence.ts`, after the `burst` group, using the file's existing `colour()` helper:

```ts
    {
      name: 'emitters',
      type: 'group',
      label: 'Emitter orbs — the two projectors',
      admin: {
        description:
          'Two instances of ONE model. They differ by DEPTH, not by size — that is why there is a single size control and two positions.',
      },
      fields: [
        {
          name: 'sizeFrac',
          type: 'number',
          defaultValue: d.EMITTERS.SIZE_FRAC,
          min: 0.02,
          max: 0.45,
          admin: {
            description:
              'On-screen height as a fraction of viewport height, the same units as SAMSARA’s own landing size. Both orbs share it.',
          },
        },
        {
          name: 'mobileSizeFrac',
          type: 'number',
          defaultValue: d.EMITTERS.MOBILE_SIZE_FRAC,
          min: 0.02,
          max: 0.4,
          admin: { description: 'Portrait, where the orbs flank the screen below SAMSARA.' },
        },
        ...(['near', 'far', 'mobileNear', 'mobileFar'] as const).map((slot) => ({
          name: slot,
          type: 'group' as const,
          label:
            slot === 'near' ? 'Near orb — landscape'
              : slot === 'far' ? 'Far orb — landscape'
                : slot === 'mobileNear' ? 'Near orb — portrait' : 'Far orb — portrait',
          fields: [
            { name: 'xFrac', type: 'number' as const, defaultValue: d.EMITTERS[slot === 'near' ? 'NEAR' : slot === 'far' ? 'FAR' : slot === 'mobileNear' ? 'MOBILE_NEAR' : 'MOBILE_FAR'].X_FRAC, min: -0.5, max: 1.5 },
            { name: 'yFrac', type: 'number' as const, defaultValue: d.EMITTERS[slot === 'near' ? 'NEAR' : slot === 'far' ? 'FAR' : slot === 'mobileNear' ? 'MOBILE_NEAR' : 'MOBILE_FAR'].Y_FRAC, min: -0.5, max: 1.5 },
            {
              name: 'depthFrac',
              type: 'number' as const,
              defaultValue: d.EMITTERS[slot === 'near' ? 'NEAR' : slot === 'far' ? 'FAR' : slot === 'mobileNear' ? 'MOBILE_NEAR' : 'MOBILE_FAR'].DEPTH_FRAC,
              min: 0.05,
              max: 0.95,
              admin: { description: '0 = at the camera, 1 = at the back wall. This is what makes the two orbs look different sizes.' },
            },
          ],
        })),
        { name: 'entryMs', type: 'number', defaultValue: d.EMITTERS.ENTRY_MS, min: 200, max: 6000, admin: { description: 'How long one orb takes to fly in from behind the camera.' } },
        { name: 'entryStaggerMs', type: 'number', defaultValue: d.EMITTERS.ENTRY_STAGGER_MS, min: 0, max: 3000, admin: { description: 'How far the far orb lags the near one, so they do not read as one rigid object.' } },
        { name: 'bobAmp', type: 'number', defaultValue: d.EMITTERS.BOB_AMP, min: 0, max: 0.6, admin: { description: 'Idle float, in orb radii. The two orbs bob out of phase deliberately.' } },
        { name: 'bobMs', type: 'number', defaultValue: d.EMITTERS.BOB_MS, min: 400, max: 12000 },
        { name: 'thrustRate', type: 'number', defaultValue: d.EMITTERS.THRUST_RATE, min: 0, max: 200, admin: { description: 'Afterburner plume DURING ENTRY, puffs per second per port. This is not the 3s cadence — it ends when the orb parks.' } },
        { name: 'thrustSpread', type: 'number', defaultValue: d.EMITTERS.THRUST_SPREAD, min: 0, max: 3 },
        { name: 'cadenceMs', type: 'number', defaultValue: d.EMITTERS.CADENCE_MS, min: 400, max: 20000, admin: { description: 'The PERMANENT burst interval once parked. Runs for as long as the room is up.' } },
        { name: 'cadencePuffs', type: 'number', defaultValue: d.EMITTERS.CADENCE_PUFFS, min: 1, max: 24, admin: { description: 'Puffs per port per burst.' } },
        { name: 'puffSize', type: 'number', defaultValue: d.EMITTERS.PUFF_SIZE, min: 0.02, max: 2, admin: { description: 'In orb radii, so it holds at every viewport.' } },
        { name: 'puffLifeMs', type: 'number', defaultValue: d.EMITTERS.PUFF_LIFE_MS, min: 100, max: 8000, admin: { description: 'Keep this BELOW the cadence interval, or bursts merge into a continuous plume.' } },
        colour('puffColor', d.EMITTERS.PUFF_COLOR, 'Warm grey steam, not the gold of SAMSARA’s own bursts.'),
        { name: 'puffOpacity', type: 'number', defaultValue: d.EMITTERS.PUFF_OPACITY, min: 0, max: 1 },
      ],
    },

    {
      name: 'hologram',
      type: 'group',
      label: 'Holographic screen',
      admin: {
        description:
          'The screen the two orbs project. It will later carry subtitles and option buttons as real DOM on top — the flicker below applies to the GLASS ONLY so that text never flashes.',
      },
      fields: [
        { name: 'wFrac', type: 'number', defaultValue: d.HOLOGRAM.W_FRAC, min: 0.05, max: 1.2 },
        { name: 'hFrac', type: 'number', defaultValue: d.HOLOGRAM.H_FRAC, min: 0.05, max: 1.2 },
        { name: 'xFrac', type: 'number', defaultValue: d.HOLOGRAM.X_FRAC, min: -0.2, max: 1.2, admin: { description: 'Landscape: keep the screen clear of SAMSARA, which parks at 0.75.' } },
        { name: 'yFrac', type: 'number', defaultValue: d.HOLOGRAM.Y_FRAC, min: -0.2, max: 1.2 },
        { name: 'mobileWFrac', type: 'number', defaultValue: d.HOLOGRAM.MOBILE_W_FRAC, min: 0.05, max: 1.2 },
        { name: 'mobileHFrac', type: 'number', defaultValue: d.HOLOGRAM.MOBILE_H_FRAC, min: 0.05, max: 1.2 },
        { name: 'mobileXFrac', type: 'number', defaultValue: d.HOLOGRAM.MOBILE_X_FRAC, min: -0.2, max: 1.2 },
        { name: 'mobileYFrac', type: 'number', defaultValue: d.HOLOGRAM.MOBILE_Y_FRAC, min: -0.2, max: 1.4, admin: { description: 'Portrait: the screen goes BELOW SAMSARA, which parks at 0.3.' } },
        { name: 'formMs', type: 'number', defaultValue: d.HOLOGRAM.FORM_MS, min: 100, max: 8000, admin: { description: 'Flickers first, then resolves — an unstable ramp, not a clean fade.' } },
        { name: 'flickerMs', type: 'number', defaultValue: d.HOLOGRAM.FLICKER_MS, min: 500, max: 30000, admin: { description: 'The permanent flicker interval once the screen is live.' } },
        { name: 'flickerDurMs', type: 'number', defaultValue: d.HOLOGRAM.FLICKER_DUR_MS, min: 20, max: 2000, admin: { description: 'Keep well below the interval, or the screen reads as broken rather than as a projection.' } },
        { name: 'flickerDepth', type: 'number', defaultValue: d.HOLOGRAM.FLICKER_DEPTH, min: 0, max: 0.95, admin: { description: 'How far the glass dips. Never 1 — a screen that fully extinguishes reads as a fault.' } },
        colour('glassColor', d.HOLOGRAM.GLASS_COLOR, 'The screen’s own amber.'),
        { name: 'glassOpacity', type: 'number', defaultValue: d.HOLOGRAM.GLASS_OPACITY, min: 0, max: 1 },
        colour('shaftColor', d.HOLOGRAM.SHAFT_COLOR, 'The light shafts from each lens. Usually the same amber as the glass.'),
        { name: 'shaftOpacity', type: 'number', defaultValue: d.HOLOGRAM.SHAFT_OPACITY, min: 0, max: 1, admin: { description: 'Additive geometry, not fog — fog is banned here because the room shares its scene with the hero orbit.' } },
        { name: 'shaftSpread', type: 'number', defaultValue: d.HOLOGRAM.SHAFT_SPREAD, min: 0.02, max: 3 },
      ],
    },
```

- [ ] **Step 3: Regenerate types and push the schema**

```bash
npm run generate:types
```

Then restart the dev server and watch `preview_logs`. If it shows a repeating
`Accept warnings and push schema to database? (y/N)`, the push is blocked —
apply the additive columns manually with SQL so drizzle sees no diff, then
restart. Additive changes usually push without prompting; only drops prompt.

- [ ] **Step 4: Verify both groups reached the API**

```bash
curl -s "http://localhost:3000/api/globals/samsara-sequence?depth=0" | python -c "import sys,json; d=json.load(sys.stdin); print('emitters:', 'emitters' in d); print('hologram:', 'hologram' in d)"
```
Expected: both `True`. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/globals/SamsaraSequence.ts src/payload-types.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "CMS: emitter orb and hologram field groups"
```

---

## Task 8: `emitterScene.ts` — the GL half

**Files:**
- Create: `src/lib/samsara/emitterScene.ts`

**Interfaces:**
- Consumes: `emitterOrbs` (Task 2), `orbSmoke` (Task 3), `hologramGeometry` (Task 4), `HoloPhase` (Task 5).
- Produces:
  - `type EmitterScene = { group: THREE.Group; setConfig(cfg: SequenceConfig): void; update(a: EmitterUpdateArgs): void; screenCorners(): Vec3[]; dispose(): void }`
  - `type EmitterUpdateArgs = { cfg: SequenceConfig; ctx: OrbCtx; phase: HoloPhase; entry01: number; form01: number; parkedMs: number; dtMs: number; reveal: number }`
  - `createEmitterScene(orbModel: THREE.Object3D): EmitterScene`

- [ ] **Step 1: Write the module**

Create `src/lib/samsara/emitterScene.ts`. Structure it exactly as `room.ts` does — build once, expose `setConfig` / `update` / `dispose`, no per-frame allocation:

```ts
import * as THREE from 'three'
import type { SequenceConfig } from './types'
import { orbParkedPose, orbPoseAt, orbBobY, portWorld, lensWorld, type OrbCtx, type OrbSlot } from './emitterOrbs'
import { makeSmokePool, SmokeState, type SmokeMode } from './orbSmoke'
import { screenQuad, shaftFor, flickerAt, type Vec3 } from './hologramGeometry'
import type { HoloPhase } from './HologramController'

/**
 * The GL half of the emitter orbs and the hologram.
 *
 * Same shape as `room.ts`: build once, mutate per frame, dispose explicitly.
 * All arithmetic lives in the pure modules this imports; nothing here decides
 * WHERE anything goes, only how it is drawn.
 *
 * ⚠️ NO SHADOWS from anything in this group. The room deliberately runs one
 * shadow-casting light (`room.ts`), and this project has lost 5.9 fps once to a
 * lighting-adjacent regression.
 *
 * ⚠️ Shafts are ADDITIVE GEOMETRY, not fog. `scene.fog` is banned because the
 * room shares its scene with the hero orbit and fog would tint SAMSARA
 * mid-orbit — see spec §4.5.
 */

export type EmitterUpdateArgs = {
  cfg: SequenceConfig
  ctx: OrbCtx
  phase: HoloPhase
  entry01: number
  form01: number
  parkedMs: number
  dtMs: number
  /** The room's own reveal ramp, so the orbs arrive with the room. */
  reveal: number
}

export type EmitterScene = {
  group: THREE.Group
  setConfig(cfg: SequenceConfig): void
  update(a: EmitterUpdateArgs): void
  /** The screen's four world-space corners, for the projected-rect contract. */
  screenCorners(): Vec3[]
  dispose(): void
}

const SLOTS: OrbSlot[] = ['near', 'far']
/** Sized for THRUST, which is far denser than the cadence. */
const POOL = 420

export function createEmitterScene(orbModel: THREE.Object3D): EmitterScene {
  const group = new THREE.Group()
  group.visible = false

  // ── the two orbs ──────────────────────────────────────────────────
  const orbs = SLOTS.map(() => {
    const o = orbModel.clone(true)
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = false
        c.receiveShadow = false
      }
    })
    group.add(o)
    return o
  })

  // ── smoke: one pool per orb ───────────────────────────────────────
  const smoke = SLOTS.map(() => {
    let s = 987654321
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    return new SmokeState(makeSmokePool(POOL), rnd)
  })
  const smokeGeo = SLOTS.map(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(POOL), 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(POOL), 1))
    return g
  })
  const smokeMat = new THREE.PointsMaterial({
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const smokePoints = smokeGeo.map((g) => {
    const p = new THREE.Points(g, smokeMat)
    p.frustumCulled = false
    group.add(p)
    return p
  })

  // ── shafts, one per orb ───────────────────────────────────────────
  const shaftMat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const shafts = SLOTS.map(() => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true), shaftMat)
    m.visible = false
    group.add(m)
    return m
  })

  // ── the glass ─────────────────────────────────────────────────────
  const glassMat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glassMat)
  glass.visible = false
  group.add(glass)

  let corners: Vec3[] = []

  return {
    group,

    setConfig(cfg) {
      smokeMat.color.set(cfg.EMITTERS.PUFF_COLOR)
      shaftMat.color.set(cfg.HOLOGRAM.SHAFT_COLOR)
      glassMat.color.set(cfg.HOLOGRAM.GLASS_COLOR)
    },

    update(a) {
      const { cfg, ctx, phase } = a
      group.visible = phase !== 'dormant' && a.reveal > 0.01

      const quad = screenQuad(cfg.HOLOGRAM, ctx)
      corners = quad.corners as unknown as Vec3[]

      const mode: SmokeMode =
        phase === 'dormant' ? 'off' : phase === 'entering' ? 'thrust' : 'cadence'
      const smokeClock = phase === 'entering' ? a.entry01 * cfg.EMITTERS.ENTRY_MS : a.parkedMs

      SLOTS.forEach((slot, i) => {
        const pose =
          phase === 'entering'
            ? orbPoseAt(slot, a.entry01 * (cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS), cfg.EMITTERS, ctx)
            : orbParkedPose(slot, cfg.EMITTERS, ctx)
        const bob = phase === 'entering' ? 0 : orbBobY(slot, a.parkedMs, cfg.EMITTERS) * pose.radius

        orbs[i].position.set(pose.x, pose.y + bob, pose.z)
        orbs[i].scale.setScalar(pose.radius)

        // Smoke, in orb radii, offset to the orb's own frame.
        smoke[i].update(cfg.EMITTERS, mode, smokeClock, a.dtMs)
        const puffs = smoke[i].sample(smokeClock, cfg.EMITTERS)
        const pos = smokeGeo[i].getAttribute('position') as THREE.BufferAttribute
        const al = smokeGeo[i].getAttribute('aAlpha') as THREE.BufferAttribute
        const sz = smokeGeo[i].getAttribute('aSize') as THREE.BufferAttribute
        for (let k = 0; k < POOL; k++) {
          const p = puffs[k]
          if (!p) { al.setX(k, 0); continue }
          const base = portWorld({ ...pose, y: pose.y + bob }, 0)
          pos.setXYZ(k, pose.x + p.x * pose.radius, pose.y + bob + p.y * pose.radius, pose.z + p.z * pose.radius)
          al.setX(k, p.alpha)
          sz.setX(k, p.size * pose.radius)
          void base
        }
        pos.needsUpdate = true; al.needsUpdate = true; sz.needsUpdate = true
        smokePoints[i].visible = puffs.length > 0

        // Shaft: cone from the lens to the screen centre.
        const lens = lensWorld({ ...pose, y: pose.y + bob })
        const s = shaftFor(lens, quad, cfg.HOLOGRAM)
        const lit = phase === 'emitting' || phase === 'forming' || phase === 'live'
        shafts[i].visible = lit
        if (lit) {
          const mid = new THREE.Vector3(
            (s.origin[0] + s.target[0]) / 2,
            (s.origin[1] + s.target[1]) / 2,
            (s.origin[2] + s.target[2]) / 2,
          )
          shafts[i].position.copy(mid)
          shafts[i].scale.set(s.spread * pose.radius * 4, s.length, s.spread * pose.radius * 4)
          shafts[i].lookAt(new THREE.Vector3(...s.target))
          shafts[i].rotateX(Math.PI / 2)
        }
      })

      smokeMat.opacity = cfg.EMITTERS.PUFF_OPACITY
      smokeMat.size = cfg.EMITTERS.PUFF_SIZE

      // Glass. ⚠️ The flicker touches OPACITY ONLY — never the transform, never
      // visibility. The published rect must be identical during a dip.
      const showGlass = phase === 'forming' || phase === 'live'
      glass.visible = showGlass
      if (showGlass) {
        glass.position.set(quad.centre[0], quad.centre[1], quad.centre[2])
        glass.scale.set(quad.w, quad.h, 1)
        const dip = phase === 'live' ? flickerAt(a.parkedMs, cfg.HOLOGRAM) : 0
        // Forming is an unstable ramp, not a clean fade (spec §5.4).
        const formNoise = phase === 'forming'
          ? 0.35 + 0.65 * Math.abs(Math.sin(a.form01 * Math.PI * 7)) * a.form01
          : 1
        glassMat.opacity = cfg.HOLOGRAM.GLASS_OPACITY * formNoise * (1 - dip) * a.reveal
        shaftMat.opacity = cfg.HOLOGRAM.SHAFT_OPACITY * (1 - dip * 0.5) * a.reveal
      } else {
        shaftMat.opacity = cfg.HOLOGRAM.SHAFT_OPACITY * a.reveal * (phase === 'emitting' ? 1 : 0)
      }
    },

    screenCorners: () => corners,

    dispose() {
      smokeGeo.forEach((g) => g.dispose())
      smokeMat.dispose()
      shafts.forEach((s) => s.geometry.dispose())
      shaftMat.dispose()
      glass.geometry.dispose()
      glassMat.dispose()
      orbs.forEach((o) => o.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      }))
      group.clear()
    },
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean. This task has no unit test of its own — it contains no arithmetic, only THREE wiring, and its behaviour is asserted by the browser gates in Tasks 11 and 12.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/emitterScene.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "emitterScene: orbs, smoke points, additive shafts, glass"
```

---

## Task 9: Engine integration and the rendered-snapshot rect

**Files:**
- Modify: `src/lib/mascot/MascotEngine.ts`

**Interfaces:**
- Consumes: `createEmitterScene` (Task 8), `projectQuad` (Task 4).
- Produces: on the engine — `setHologram(a: EmitterUpdateArgs | null): void`, `loadOrbModel(): Promise<boolean>`; and `rendered.holoRect: Rect | null` inside the existing per-frame snapshot.

- [ ] **Step 1: Add the lazy orb loader**

Beside the existing room-model loader (`draco.setDecoderPath('/draco/')`, ~line 947), add a sibling that loads `/models/emitter-orb.draco.glb`. It must be **lazy** — a hero-only visit must never fetch it — and must resolve `false` rather than throw if the fetch fails, matching how the room model degrades.

- [ ] **Step 2: Host the emitter scene**

Create the scene on first successful load, add `scene.group` to the same parent the room uses so it inherits the room's transform, and call `dispose()` from the engine's existing teardown.

- [ ] **Step 3: Write the rect into the rendered snapshot**

⚠️ **This is the step the spec's §5.7 warning is about.** In `place()`, at the point the engine already writes its one-snapshot-per-frame (`rendered.x`, `rendered.y`, `rendered.diameterPx`, `camera`, `mode`), also write:

```ts
    // ⚠️ Written HERE, in the same single snapshot as the pose — never read
    // live by a consumer.
    //
    // Three rAF callbacks run per browser frame in registration order: the
    // engine's loop, the sequence's loop, then any sampler. A rect read from a
    // later callback is THIS frame's render labelled with NEXT frame's state.
    // samsara-seam.mjs cost three separate false readings learning this — a 6px
    // seam and a 2,332px jump that did not exist.
    this.rendered.holoRect = this.emitterScene
      ? projectQuad(
          { corners: this.emitterScene.screenCorners() as never, centre: [0, 0, 0], w: 0, h: 0 },
          (p) => {
            const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera)
            return [((v.x + 1) / 2) * this.cssW, ((1 - v.y) / 2) * this.cssH]
          },
        )
      : null
```

Use the engine's existing CSS-size fields for `cssW`/`cssH` — not the canvas attributes, which are `cssSize × devicePixelRatio` and were the cause of the dpr presentation bug.

- [ ] **Step 4: Verify**

Run `npx tsc --noEmit` — expected clean. Then start dev and confirm in the browser console that `window.__ttMascot().rendered.holoRect` is `null` before the sequence runs (the scene does not exist yet), which proves the field is wired without asserting behaviour that Task 10 has not enabled.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/mascot/MascotEngine.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Engine hosts the emitter scene and snapshots the hologram rect"
```

---

## Task 10: Drive the controller and publish the DOM contract

**Files:**
- Modify: `src/components/hero/SamsaraSequence.tsx`

**Interfaces:**
- Consumes: `HologramController` (Task 5), the engine surface (Task 9).
- Produces: `data-tt-hologram` on `<html>` with values `forming` / `live`; `--tt-holo-x/y/w/h` custom properties; `window.__ttHologram()` returning `{ phase, rect }` for the gates.

- [ ] **Step 1: Instantiate and drive the controller**

Create one `HologramController` in the effect, `start()` it on the frame the sequence's mode becomes `landed`, and `reset()` it when the mode leaves `landed`. Call `update(cfg, dtMs)` once per frame from the existing rAF loop, feeding the result plus `entry01`, `form01`, `parkedMs` and the room's reveal into `engine.setHologram(...)`.

- [ ] **Step 2: Publish the contract**

```tsx
      /**
       * The screen's DOM contract — spec §5.7.
       *
       * ⚠️ PRESENCE lifts, VALUE animates, and that split is load-bearing.
       * With no sequence running — reduced motion, no WebGL, sequenceEnabled
       * false — the attribute is never written, so a future subtitle/button
       * layer stays ordinary in-flow content. Gating on the value alone would
       * leave every degraded visitor a blank panel, which is the exact bug the
       * removed chatbox's Task 14 comment recorded.
       *
       * That matters more here than it did for the chatbox: this screen will
       * carry SUBTITLES and OPTION BUTTONS. If they were reachable only through
       * a working hologram, the visitors who most need them would be the ones
       * who cannot get them.
       */
      const holoOn = phase === 'forming' || phase === 'live'
      if (holoOn !== lastHoloOn || (holoOn && phase !== lastHoloPhase)) {
        lastHoloOn = holoOn
        lastHoloPhase = phase
        if (holoOn) document.documentElement.dataset.ttHologram = phase
        else delete document.documentElement.dataset.ttHologram
      }

      // ⚠️ The rect comes from the engine's rendered snapshot, never from a
      // live read — see the note in MascotEngine.place().
      const rect = eng.rendered.holoRect
      if (rect && holoOn) {
        const s = document.documentElement.style
        s.setProperty('--tt-holo-x', `${rect.x.toFixed(1)}px`)
        s.setProperty('--tt-holo-y', `${rect.y.toFixed(1)}px`)
        s.setProperty('--tt-holo-w', `${rect.w.toFixed(1)}px`)
        s.setProperty('--tt-holo-h', `${rect.h.toFixed(1)}px`)
      }
```

Expose for the gates, beside the existing `__ttSamsara*` handles:

```tsx
    w.__ttHologram = () => ({
      phase: holoRef.current?.phase ?? 'dormant',
      rect: engineRef.current?.rendered.holoRect ?? null,
    })
```

- [ ] **Step 3: Clean up on teardown**

In the effect's cleanup, alongside the existing `cancelAnimationFrame(raf)`:

```tsx
      // Removed, not left at a value: a torn-down sequence must leave the page
      // exactly as one that never had a hologram — which is in-flow and visible.
      delete document.documentElement.dataset.ttHologram
      for (const p of ['x', 'y', 'w', 'h']) {
        document.documentElement.style.removeProperty(`--tt-holo-${p}`)
      }
```

- [ ] **Step 4: Verify by hand**

Start dev, drive the sequence into the room, and confirm in the console that
`document.documentElement.dataset.ttHologram` becomes `forming` then `live`,
and that `getComputedStyle(document.documentElement).getPropertyValue('--tt-holo-w')`
is a plausible pixel value. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add "src/components/hero/SamsaraSequence.tsx"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Drive the hologram phases and publish the rect contract"
```

---

## Task 11: `samsara-emitters.mjs` — the orbs gate

**Files:**
- Create: `docs/superpowers/verification/samsara-emitters.mjs`

**Interfaces:**
- Consumes: `window.__ttSamsara`, `window.__ttSamsaraBeat`, `window.__ttHologram`, `window.__ttMascot`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the gate**

Model it on `samsara-room-chatbox.mjs`'s structure (three viewports, drive the sequence in first, then measure). Assert:

1. Both orbs reach their parked poses — read from `__ttMascot().rendered` plus a screenshot showing ink where `emitterOrbs` says they should be.
2. `__ttHologram().phase` progresses `entering → parked → emitting → forming → live`.
3. **Smoke cadence measured across at least three intervals**, by sampling lit-pixel counts in a crop under an orb over ~10s and counting peaks. One interval cannot distinguish a cadence from a one-shot.
4. Puffs originate **within the orb silhouette** — the only automated defence against §4.6's hand-measured port offsets drifting after a model re-export.
5. Orbs clear SAMSARA at **1440×900, 1280×720 and 390×844**, using the rectangle-to-ellipse test from the README's 2026-09-03 section (closest point on the orb's box to SAMSARA's centre, against its drawn radius — `rendered.diameterPx`, which accounts for `MASCOT_STRETCH_Y`).
6. Zero page errors.

Write screenshots to `samsarashots/`.

- [ ] **Step 2: Run it and confirm it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"
TT_SCRATCH="<scratchpad>" node docs/superpowers/verification/samsara-emitters.mjs
```

- [ ] **Step 3: NEGATIVE-TEST it**

⚠️ Required, not optional. Temporarily break each assertion's subject and confirm the gate goes red:

- Set `CADENCE_MS` to a huge value → the cadence assertion must fail.
- Offset `PORT_OFFSETS[0]` by `[5, 5, 5]` → the silhouette assertion must fail.
- Set `NEAR.X_FRAC` to `0.8` → the clearance assertion must fail at 1440×900.

An assertion that stays green under its own break is testing nothing. This project has produced green ticks on visibly broken builds at least four times.

- [ ] **Step 4: Revert the breaks and re-run**

Confirm green, and confirm `git status` shows only the new gate file.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/samsara-emitters.mjs
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Gate: emitter orbs arrive, park, and hold their cadence"
```

---

## Task 12: `samsara-hologram.mjs` — the screen gate

**Files:**
- Create: `docs/superpowers/verification/samsara-hologram.mjs`

**Interfaces:**
- Consumes: `window.__ttHologram`, `data-tt-hologram`, `--tt-holo-*`.

- [ ] **Step 1: Write the gate**

Assert:

1. The screen forms and reaches `live`; `data-tt-hologram` goes `forming` → `live`.
2. **The published rect matches the actually-painted quad, in PIXELS.**

   ⚠️ Comparing the published rect against `hologramGeometry`'s own maths would be two numbers that agree with each other no matter how the result is presented — the exact failure that made three rounds of measurement miss the dpr canvas bug. Screenshot-clip to the published rect and assert the glass is genuinely painted there, using **peak luma over the clip** (README, 2026-09-03). Then clip to a band just outside the rect and assert it is markedly darker, so a rect twice the true size cannot pass.
3. Flicker cadence at `FLICKER_MS`, measured over **at least three intervals**.
4. ⚠️ **The rect and the `live` value do NOT change during a flicker** (spec §5.5). Sample `--tt-holo-*` and `dataset.ttHologram` at a dip and between dips; both must be identical. This is the assertion that protects future subtitles from flashing.
5. Three viewports, including portrait — where the screen must sit **below** SAMSARA.
6. Zero page errors.

- [ ] **Step 2: Run it and confirm it passes**

- [ ] **Step 3: NEGATIVE-TEST it**

- Multiply the published rect by 1.5 before publishing → the painted-pixel assertion must fail.
- Make the flicker also write `dataset.ttHologram` → the steady-value assertion must fail.
- Set `FLICKER_MS` to 60000 → the cadence assertion must fail.

- [ ] **Step 4: Revert and re-run green**

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/samsara-hologram.mjs
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Gate: the screen forms, its rect is real, and flicker leaves it steady"
```

---

## Task 13: Extend the existing gates

**Files:**
- Modify: `docs/superpowers/verification/samsara-reduced-motion.mjs`
- Modify: `docs/superpowers/verification/samsara-kill-switch.mjs`
- Modify: `docs/superpowers/verification/samsara-fps.mjs`

- [ ] **Step 1: Reduced motion and no-WebGL**

Add to both scenarios in `samsara-reduced-motion.mjs`:

```js
  check('[reduced motion] the hologram layer is never claimed',
    r.holoAttr === false, '')
  check('[reduced motion] and no orb model is fetched',
    r.orbFetched === false, '')
```

Capture `holoAttr` via `document.documentElement.hasAttribute('data-tt-hologram')`
and `orbFetched` by listening for a request to `emitter-orb.draco.glb`. The
existing `.tt-room-note` assertions must keep passing unchanged — that is the
fail-open promise and it is not weakened by this work.

- [ ] **Step 2: Kill switch — `WANT` 3 → 4**

Add the hologram attribute as a **discriminating** check (fourth argument `true`):

```js
    check('[off] the hologram layer is never claimed', r.holoAttr === false, '', true)
```

And update the constant, replacing the comment written when the chatbox was removed:

```js
  // Was 3 from 2026-09-03 to 2026-09-04. The chatbox's two discriminating
  // assertions went with the chatbox; the hologram restores one of them,
  // because data-tt-hologram is written ONLY when the sequence runs and so
  // genuinely differs between the polarities. The note remains an invariant.
  const WANT = 4
```

- [ ] **Step 3: FPS with the hologram live**

Extend `samsara-fps.mjs` to drive through to `live` before sampling. Keep the
floor at 12 — it is a software-raster tripwire, not a performance claim. Record
the hardware figure separately; any real claim about this room needs the
discrete-GPU rows (`headless: false` plus `--use-angle=d3d11
--force_high_performance_gpu --force-gpu-preference=high-performance
--disable-frame-rate-limit`, confirmed with `WEBGL_debug_renderer_info`).

- [ ] **Step 4: Run all three, plus `TT_BREAK_KILL=1`**

```bash
node docs/superpowers/verification/samsara-reduced-motion.mjs
node docs/superpowers/verification/samsara-kill-switch.mjs
TT_BREAK_KILL=1 node docs/superpowers/verification/samsara-kill-switch.mjs
node docs/superpowers/verification/samsara-fps.mjs
```

Expected: first three green; the `TT_BREAK_KILL` run must report **all 4**
discriminating assertions red and both invariants still green.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Extend the degraded-path and fps gates for the hologram; WANT 3 -> 4"
```

---

## Task 14: The bench, then the full sweep

**Files:**
- Modify: `src/app/(frontend)/[locale]/dev/samsara/SamsaraLab.tsx`

- [ ] **Step 1: Add two bench panels**

Add `emitter orbs` and `hologram` panels to the existing `PANELS` array, one
row per config value, using the file's existing `num` / `color` row kinds.
Paths are dotted, e.g. `EMITTERS.NEAR.X_FRAC`, `HOLOGRAM.FLICKER_MS`.

⚠️ The bench must mirror the live page exactly. The moment the two disagree the
bench stops predicting the site, which is the only thing it is for.

- [ ] **Step 2: Verify the bench drives the effect**

Load `/en/dev/samsara`, drive to `live`, and confirm moving `HOLOGRAM.X_FRAC`
moves the screen and `EMITTERS.CADENCE_MS` changes the smoke rhythm.

- [ ] **Step 3: Run the full sweep**

```bash
# stop the dev server first — a build against a live server corrupts .next
npm run build
rm -rf .next
# restart dev, then:
npm run verify:config 2>&1 | grep -cE '^ok'
npx tsc --noEmit
for u in /en /id /en/dev/samsara /en/dev/mascot /en/dev/satellites /en/dev/shatter /en/dev/ignition /admin; do
  curl -s -o /dev/null -w "$u %{http_code}\n" "http://localhost:3000$u"
done
```

Then every runnable browser gate: the 13 samsara gates (including the two new
ones), 6 eyes, 5 mascot, 4 satellites, plus `eyes-reduced-motion` and
`canvas-presentation-scale`. Expect **24 gates, 24 passing**.

⚠️ `samsara-orbit-unchanged.mjs` must still pass. The hero orbit is untouched by
this work and its 0.75px tolerance is what proves it.

⚠️ Ten scripts still cannot run (`t9-*`, `preview-*`, `handoff-frontal`,
`measure-handoff`) — they import `ffmpeg-static`, which is not installed.
Pre-existing; do not add a dependency to make an unrelated suite run.

- [ ] **Step 4: Update the handoff**

Add a section to `_HANDOFF/HANDOFF.md` §0000 recording what shipped, the
`WANT` change, and that `EMITTERS`/`HOLOGRAM` remain **unfrozen pending the
owner's bench pass**.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add "src/app/(frontend)/[locale]/dev/samsara/SamsaraLab.tsx"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "Bench panels for the emitters and hologram; full sweep green"
```

---

## ⛔ Task 15: FREEZE GATE — owner tuning

**This task is not implementable. It is a stop.**

Every `EMITTERS` and `HOLOGRAM` value shipped as a starting point, not a
decision (spec §9). The owner tunes them at `/en/dev/samsara` and presses
**`copy json`**, which writes `lib/samsara/types.ts`.

⚠️ `copy json` and `copy eye socket` are NOT interchangeable — the latter writes
`lib/mascot/eyeTypes.ts`.

Only after the owner has approved the values may `types.check.ts` be tightened
from relationship assertions to pinned magnitudes, and only then is this
sub-project's config frozen.

**Do not tune these values on your own judgment, and do not freeze them without
the owner.**

---

## Self-Review

**Spec coverage.** §4.4's five modules → Tasks 2–5, 8. §4.5 fog ban → Task 8's
material setup. §4.6 hand-measured offsets → Task 1's `PORT_OFFSETS` plus Task
11's silhouette assertion. §4.7 sibling-not-fork → Task 3's header. §5.1–5.4
beats → Task 5's phases and Task 8's update. §5.2's two smoke behaviours →
Tasks 1, 3, 7 (separate config), 11 (cadence over three intervals). §5.5
flicker-not-text → Task 4's `flickerAt`, Task 8's opacity-only dip, Task 12's
steady-rect assertion. §5.6 fail-open → Task 13. §5.7 contract → Tasks 9, 10.
§6 composition → Tasks 1, 2, 4, 11. §7 performance → Task 8's no-shadow rule,
Task 13's fps. §8 CMS → Tasks 6, 7. §9 freeze → Task 15. §11 verification →
Tasks 11–14.

**Placeholder scan.** No TBD/TODO. Task 8 and Tasks 11–13 describe assertions
rather than pasting complete gate source; that is deliberate — the gates are
150–280 lines each and their exact selectors depend on Task 10's published
names, which are specified exactly in that task's Interfaces block.

**Type consistency.** `OrbCtx` is defined in Task 2 and imported by Tasks 4 and
8. `SmokeMode` is defined in Task 3 and returned by Task 5's `smokeMode()`.
`Vec3`/`Rect` are defined in Task 4 and used in Tasks 8 and 9. `HoloPhase` is
defined in Task 5 and consumed by Task 8. `PORT_OFFSETS`/`LENS_OFFSET` are
defined in Task 1 and consumed by Tasks 2 and 3. Config field names in Task 6's
resolver match Task 7's CMS field names exactly (`sizeFrac`, `entryStaggerMs`,
`flickerDurMs`, …).

**One gap found and closed:** Task 1's relationship checks import `PORT_OFFSETS`
from `./types`, so that constant must live in `types.ts` rather than in
`emitterOrbs.ts`. Task 1 defines it there, and Tasks 2 and 3 import it from
`./types` accordingly.
