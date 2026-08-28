# Mascot Animated LED Eyes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working eye prototype on `feat/hero-mascot` into shipped code — frozen approved shapes pinned by checks, a ~29-field CMS surface, a kill switch that removes the display entirely, and a verification harness.

**Architecture:** The display is already drawn inside the mascot's own `MeshStandardMaterial` via `onBeforeCompile`, masked to the measured front-cap disc in object space. This plan does not change that. It splits the prototype's single `EyeTuning` blob into (a) `EXPRESSIONS` — 14 frozen owner-approved shapes living in `eyes.ts`, code-only — and (b) `MascotEyesConfig` — the look/scanline/beat/weight surface that becomes CMS fields, resolved over frozen defaults exactly as `resolveMascot` does.

**Tech Stack:** TypeScript, three.js (r1xx, `MeshStandardMaterial` + `onBeforeCompile`), GLSL, Next.js 15 App Router, Payload CMS 3 (SQLite/Drizzle), `tsx` check scripts, `puppeteer-core` + `sharp` for browser verification.

**Spec:** [`docs/superpowers/specs/2026-08-28-mascot-eyes-design.md`](../specs/2026-08-28-mascot-eyes-design.md)

## Global Constraints

- **Branch:** `feat/hero-mascot`. Do **not** merge to `main`. `main` is at `ac6687e` and must stay untouched.
- **`verify:config` baseline is 625 assertions, 0 failures.** It must never drop. Every new check suite is appended to the `verify:config` script in `package.json`.
- **`npx tsc --noEmit` must be clean at every commit.**
- **The in-app browser pane CANNOT verify this feature.** It reports the tab hidden and throttles `requestAnimationFrame` to ~1 Hz, stalling the engine's own clock. Use headless Chrome via `puppeteer-core` at `C:/Program Files/Google/Chrome/Application/chrome.exe` with `--enable-unsafe-swiftshader --use-gl=angle`.
- **Never run `npm run build` while `npm run dev` is live.** It corrupts `.next` for the running server. Stop dev, build, `rm -rf .next`, restart.
- **`BOB_PX` must be 0 in any pixel-diff verification.** With the default bob the body drifts vertically between screenshots and the diff measures that, not the eyes — it previously produced a near-uniform 44–62 across every expression, three assertions passing for the wrong reason.
- **When asserting something happened, wait for the condition; never sleep a fixed time.** When asserting nothing *ever* happens, only elapsed time can support it — keep the fixed sleep there.
- **Writing to `hero-effects` over REST requires auth.** `POST /api/users/login` first, then `Authorization: JWT <token>`. Reads are open.
- **Approved values are decisions, not defaults.** Do not "tidy" the deliberate left/right asymmetries in the `look*` family, and do not point `wink`'s eyes at another expression's shape.
- **Admin credentials for local verification:** `admin@tampa-taruno.local` / `tampataruno-2026`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/mascot/eyes.ts` | **Modify.** Keeps `EyeShape`, `Expression`, the frozen `EXPRESSIONS` table, `packEye`/`lerpEye`/`rightOf` (all already here), the GLSL chunks. Gains `EXPRESSION_ORDER` and `pickWeighted`, moved in from `eyeTuning.ts`. |
| `src/lib/mascot/eyes.check.ts` | **Create.** Pins the 14 approved shapes; tests packing, lerp, mirrored-vs-shared semantics, weighted pick. |
| `src/lib/mascot/eyeTypes.ts` | **Create.** Frozen `DEFAULT_MASCOT_EYES` + `MascotEyesConfig` — the CMS surface only. No shapes. |
| `src/lib/mascot/eyeTypes.check.ts` | **Create.** Pins the approved look/beat/weight values. |
| `src/lib/mascot/resolveMascotEyes.ts` | **Create.** CMS → `MascotEyesConfig`, plus `toMascotEyesPayload` for the bench's save. |
| `src/lib/mascot/resolveMascotEyes.check.ts` | **Create.** Fallback, clamp, and a round-trip that perturbs every mapped field first. |
| `src/lib/mascot/eyeTuning.ts` | **Delete.** Superseded by `eyeTypes.ts` + the moved helpers. |
| `src/lib/mascot/MascotEngine.ts` | **Modify.** `setEyeTuning` → `setEyeConfig`; shapes read from `EXPRESSIONS`; kill switch skips shader injection entirely. |
| `src/components/hero/MascotLayer.tsx` | **Modify.** `eyeTuning` prop → required `eyes: MascotEyesConfig`. |
| `src/components/blocks/HeroBlock.tsx` | **Modify.** Accept and forward `eyes`. |
| `src/components/blocks/RenderBlocks.tsx` | **Modify.** `eyes={resolveMascotEyes(effects)}`. |
| `src/app/(frontend)/[locale]/admin-preview/hero/{page,HeroPreview}.tsx` | **Modify.** Same resolver wiring so live preview matches. |
| `src/globals/HeroEffects.ts` | **Modify.** Adds `mascotEyesEnabled` + 4 groups (~29 fields). |
| `src/seed/index.ts` | **Modify.** Seeds every new field to the approved values. |
| `src/app/(frontend)/[locale]/dev/mascot/EyePanel.tsx` | **Modify.** Retargeted at `MascotEyesConfig`; shape sliders write a local override, not config. |
| `src/app/(frontend)/[locale]/dev/mascot/MascotLab.tsx` | **Modify.** Holds `MascotEyesConfig` state; saves to CMS. |
| `docs/superpowers/verification/eyes-*.mjs` | **Create.** Six scripts + one zoom tool. |

---

## Task 1: Move the shape helpers into `eyes.ts` and pin the approved shapes

Establishes the frozen table as the single source of shape truth before anything depends on it.

**Files:**
- Modify: `src/lib/mascot/eyes.ts`
- Create: `src/lib/mascot/eyes.check.ts`
- Modify: `package.json` (append to `verify:config`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `EXPRESSION_ORDER: string[]` — `Object.keys(EXPRESSIONS)`, the stable display/iteration order. **New here** (moved from `eyeTuning.ts`).
  - `pickWeighted(weights: Record<string, number>, rand: number, avoid?: string | null): string | null` — **new here** (moved from `eyeTuning.ts`).
  - `EXPRESSIONS: Readonly<Record<string, Expression>>` — now frozen.
  - `rightOf(x: Expression): EyeShape` — **already exported from `eyes.ts`; do not re-declare it.**

- [ ] **Step 1: Write the failing check suite**

Create `src/lib/mascot/eyes.check.ts`:

```ts
/**
 * Assertions for the frozen, owner-approved eye shapes and the pure shape
 * helpers. Run: npm run verify:config
 *
 * Mirrors src/lib/mascot/types.check.ts. This repo has no test runner; this
 * follows the existing `seed:verify` idiom of a plain tsx script that throws.
 */
import {
  EXPRESSIONS,
  EXPRESSION_ORDER,
  lerpEye,
  packEye,
  pickWeighted,
  rightOf,
  type EyeShape,
} from './eyes'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// ── the table itself ────────────────────────────────────────────────
check('EXPRESSIONS is frozen', Object.isFrozen(EXPRESSIONS))
check('14 expressions', EXPRESSION_ORDER.length === 14)
for (const name of EXPRESSION_ORDER) {
  check(`${name}: name field matches its key`, EXPRESSIONS[name].name === name)
}

// Only `wink` has independently tuned eyes. Spec §5.3.
for (const name of EXPRESSION_ORDER) {
  const hasRight = EXPRESSIONS[name].right != null
  check(`${name}: right eye ${name === 'wink' ? 'is' : 'is not'} separate`, hasRight === (name === 'wink'))
}

// ── the approved values, verbatim from spec §5.3 ────────────────────
// Pinned so a later edit is a deliberate act with the owner in the loop, not
// a silent diff. These took three live tuning rounds.
const APPROVED: Record<string, Partial<EyeShape>> = {
  neutral: { dx: 0.25, dy: 0.09, gaze: 0, w: 0.42, h: 0.68, lean: 0, crescent: 0 },
  blink: { dx: 0.26, dy: 0.05, gaze: 0, w: 0.4, h: 0.03, lean: 0, crescent: 0 },
  squint: { dx: 0.21, dy: 0.2, gaze: 0, w: 0.6, h: 0.11, lean: 0, crescent: 0 },
  wide: { dx: 0.21, dy: 0.17, gaze: 0, w: 0.6, h: 0.78, lean: 0, crescent: 0 },
  happy: { dx: 0.25, dy: 0.1, gaze: 0, w: 0.45, h: 0.47, lean: 24, crescent: 0.3 },
  lookLeft: { dx: 0.18, dy: 0.09, gaze: -0.35, w: 0.38, h: 0.6, lean: 0, crescent: 0 },
  lookRight: { dx: 0.18, dy: 0.09, gaze: 0.36, w: 0.38, h: 0.6, lean: 0, crescent: 0 },
  lookUp: { dx: 0.11, dy: 0.5, gaze: 0, w: 0.38, h: 0.56, lean: -19, crescent: 0 },
  lookDown: { dx: 0.12, dy: -0.5, gaze: -0.01, w: 0.38, h: 0.52, lean: 25, crescent: 0 },
  lookUpLeft: { dx: 0.08, dy: 0.46, gaze: -0.3, w: 0.38, h: 0.57, lean: 0, crescent: 0 },
  lookUpRight: { dx: 0.07, dy: 0.38, gaze: 0.28, w: 0.38, h: 0.57, lean: 0, crescent: 0 },
  lookDownLeft: { dx: 0.09, dy: -0.37, gaze: -0.34, w: 0.38, h: 0.52, lean: 11, crescent: 0 },
  lookDownRight: { dx: 0.08, dy: -0.45, gaze: 0.29, w: 0.38, h: 0.52, lean: 12, crescent: 0 },
  wink: { dx: 0.26, dy: 0.11, gaze: 0.03, w: 0.39, h: 0.49, lean: -1, crescent: 0 },
}
for (const [name, want] of Object.entries(APPROVED)) {
  const got = EXPRESSIONS[name].left
  for (const [k, v] of Object.entries(want)) {
    check(`approved ${name}.${k}`, got[k as keyof EyeShape] === v)
  }
}
// wink's right eye is tuned independently of happy — spec §2.
{
  const r = rightOf(EXPRESSIONS.wink)
  check('approved wink.R.dx', r.dx === 0.25)
  check('approved wink.R.dy', r.dy === 0.04)
  check('approved wink.R.gaze', r.gaze === -0.05)
  check('approved wink.R.w', r.w === 0.45)
  check('approved wink.R.h', r.h === 0.44)
  check('approved wink.R.crescent', r.crescent === 0.22)
  check('wink.R differs from happy', r.h !== EXPRESSIONS.happy.left.h)
}

// The deliberate asymmetries. Spec §5.3 — a future pass must not mirror these.
check('lookUpLeft/Right dy differ on purpose',
  EXPRESSIONS.lookUpLeft.left.dy === 0.46 && EXPRESSIONS.lookUpRight.left.dy === 0.38)
check('lookDownLeft/Right gaze magnitudes differ on purpose',
  Math.abs(EXPRESSIONS.lookDownLeft.left.gaze) === 0.34 &&
  Math.abs(EXPRESSIONS.lookDownRight.left.gaze) === 0.29)

// ── packEye: slot layout the shader reads ───────────────────────────
{
  const out = new Float32Array(24).fill(9)
  const e: EyeShape = { dx: 1, dy: 2, gaze: 6, w: 3, h: 4, lean: 90, crescent: 5 }
  packEye(e, out, 0)
  check('slot0 dx', out[0] === 1)
  check('slot1 dy', out[1] === 2)
  check('slot2 w', out[2] === 3)
  check('slot3 h', out[3] === 4)
  check('slot4 lean is RADIANS', Math.abs(out[4] - Math.PI / 2) < 1e-6)
  check('slot5 crescent', out[5] === 5)
  check('slot6 gaze', out[6] === 6)
  check('slots 7..11 zeroed', out.slice(7, 12).every((v) => v === 0))
  check('does not write past its 12 slots', out[12] === 9)
}

// ── lerpEye ─────────────────────────────────────────────────────────
{
  const a: EyeShape = { dx: 0, dy: 0, gaze: 0, w: 0, h: 0, lean: 0, crescent: 0 }
  const b: EyeShape = { dx: 1, dy: 2, gaze: 3, w: 4, h: 5, lean: 6, crescent: 7 }
  const m = lerpEye(a, b, 0.5)
  check('lerp midpoint dx', m.dx === 0.5)
  check('lerp midpoint gaze', m.gaze === 1.5)
  check('lerp midpoint crescent', m.crescent === 3.5)
  check('lerp t=0 is a', JSON.stringify(lerpEye(a, b, 0)) === JSON.stringify(a))
  check('lerp t=1 is b', JSON.stringify(lerpEye(a, b, 1)) === JSON.stringify(b))
  check('lerp interpolates EVERY field', Object.keys(m).length === Object.keys(b).length)
}

// ── pickWeighted ────────────────────────────────────────────────────
{
  const only = { ...Object.fromEntries(EXPRESSION_ORDER.map((k) => [k, 0])), happy: 1 }
  check('single positive weight always wins', pickWeighted(only, 0.99) === 'happy')
  check('rand 0 picks the first eligible', pickWeighted(only, 0) === 'happy')

  const none = Object.fromEntries(EXPRESSION_ORDER.map((k) => [k, 0]))
  // An owner who zeroes the pool wants the face at REST, not a fallback to an
  // expression they removed on purpose.
  check('empty pool returns null', pickWeighted(none, 0.5) === null)

  // avoid = NO_REPEAT. Dropped from the running total rather than re-rolled,
  // so a pool whose only positive weight IS the avoided entry still returns
  // something instead of spinning.
  check('avoid excludes that entry', pickWeighted({ ...none, happy: 1, blink: 1 }, 0.1, 'happy') === 'blink')
  check('avoid on a single-entry pool returns null', pickWeighted(only, 0.5, 'happy') === null)

  // Negative weights are treated as 0, never as a reversed contribution.
  check('negative weight is clamped out', pickWeighted({ ...none, happy: -5, blink: 1 }, 0.5) === 'blink')
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll eye shape checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/mascot/eyes.check.ts
```

Expected: FAIL — `EXPRESSION_ORDER` and `pickWeighted` are not exported from `./eyes` (they currently live in `eyeTuning.ts`), and `EXPRESSIONS` is not frozen. `rightOf` already resolves.

- [ ] **Step 3: Move the helpers into `eyes.ts`**

⚠️ `rightOf` is **already exported** from `eyes.ts` — do not add it again, that is a duplicate-identifier error. Only `EXPRESSION_ORDER` and `pickWeighted` move.

In `src/lib/mascot/eyes.ts`, append after the `EXPRESSIONS` declaration:

```ts
/** Stable order for iteration, the bench's picker, and the weighted pool. */
export const EXPRESSION_ORDER = Object.keys(EXPRESSIONS)

/**
 * Picks an expression by weight.
 *
 * `avoid` implements NO_REPEAT: it is dropped from the running total rather
 * than re-rolled, so a pool whose only positive weight IS the avoided entry
 * still returns something instead of spinning. Returns null when nothing is
 * eligible, which the caller reads as "play no glance this pass" — an owner
 * who zeroes the pool wants the face at rest, not a fallback to an expression
 * they removed on purpose.
 */
export function pickWeighted(
  weights: Record<string, number>,
  rand: number,
  avoid?: string | null,
): string | null {
  let total = 0
  for (const k of EXPRESSION_ORDER) {
    if (k === avoid) continue
    total += Math.max(0, weights[k] ?? 0)
  }
  if (total <= 0) return null
  let r = rand * total
  for (const k of EXPRESSION_ORDER) {
    if (k === avoid) continue
    r -= Math.max(0, weights[k] ?? 0)
    if (r <= 0) return k
  }
  return null
}
```

Then freeze the table. Change the declaration line:

```ts
export const EXPRESSIONS: Record<string, Expression> = {
```

to:

```ts
export const EXPRESSIONS: Readonly<Record<string, Expression>> = Object.freeze({
```

and change its closing `}` to `})`.

- [ ] **Step 4: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/mascot/eyes.check.ts
```

Expected: PASS, `All eye shape checks passed.`

- [ ] **Step 5: Register the suite and confirm nothing regressed**

In `package.json`, append to the end of the `verify:config` value:

```
 && node --import tsx src/lib/mascot/eyes.check.ts
```

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

Expected: typecheck clean; `verify:config` exits 0 with **more than 625** `ok` lines and zero `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mascot/eyes.ts src/lib/mascot/eyes.check.ts package.json
git commit -m "test(mascot): pin the 14 approved eye shapes; move helpers into eyes.ts"
```

---

## Task 2: The frozen eye config type

The CMS surface, separate from the shapes. Nothing consumes it yet.

**Files:**
- Create: `src/lib/mascot/eyeTypes.ts`
- Create: `src/lib/mascot/eyeTypes.check.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `EXPRESSION_ORDER` from Task 1.
- Produces:
  - `type MascotEyesConfig` — fields listed below.
  - `DEFAULT_MASCOT_EYES: MascotEyesConfig` — frozen.

- [ ] **Step 1: Write the failing check suite**

Create `src/lib/mascot/eyeTypes.check.ts`:

```ts
/**
 * Assertions for the frozen eye configuration — the CMS-editable surface.
 * The SHAPES are not here; they are frozen in eyes.ts (spec §7.1).
 * Run: npm run verify:config
 */
import { EXPRESSION_ORDER } from './eyes'
import { DEFAULT_MASCOT_EYES } from './eyeTypes'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_MASCOT_EYES
const HEX = /^#[0-9a-fA-F]{6}$/

check('defaults are frozen', Object.isFrozen(d))
check('weights are frozen', Object.isFrozen(d.WEIGHTS))

// Approved values, verbatim from spec §5.2.
check('approved COLOR', d.COLOR === '#F2A81C')
check('approved CORE', d.CORE === '#FFF0BE')
check('approved SOCKET (pure black, not the old #06080B)', d.SOCKET === '#000000')
check('approved GLOW', d.GLOW === 0.55)
check('approved GAP', d.GAP === 0.38)
check('approved SOCKET_SPAN', d.SOCKET_SPAN === 1.34)
check('approved SCANLINE_MAX', d.SCANLINE_MAX === 9)
check('approved SCANLINE_MIN_PX', d.SCANLINE_MIN_PX === 44)
check('approved SCANLINE_RAMP', d.SCANLINE_RAMP === 12)
check('approved GLANCE_SECONDS', d.GLANCE_SECONDS === 0.6)
check('approved GLANCE_PEAK', d.GLANCE_PEAK === 0.45)
check('approved FACING_THRESHOLD', d.FACING_THRESHOLD === 0.3)
check('approved CHARGE_CROSSOVER', d.CHARGE_CROSSOVER === 0.7)
check('approved NO_REPEAT', d.NO_REPEAT === false)
check('enabled by default', d.ENABLED === true)

check('COLOR is hex', HEX.test(d.COLOR))
check('CORE is hex', HEX.test(d.CORE))
check('SOCKET is hex', HEX.test(d.SOCKET))

// FACE_RADIUS is MEASURED, not taste: the smooth front cap ends at 0.50 model
// units and the bezel relief begins. Spec §4.1 / §7.2 — deliberately NOT a CMS
// field, because a control inviting someone to move it can only break the mask.
check('FACE_RADIUS is the measured 0.50', d.FACE_RADIUS === 0.5)

// Fractions the engine uses directly.
check('GLANCE_PEAK within 0..1', d.GLANCE_PEAK > 0 && d.GLANCE_PEAK < 1)
check('CHARGE_CROSSOVER within 0..1', d.CHARGE_CROSSOVER > 0 && d.CHARGE_CROSSOVER < 1)
check('GLANCE_SECONDS positive', d.GLANCE_SECONDS > 0)
check('SOCKET_SPAN positive', d.SOCKET_SPAN > 0)

// Every expression must carry a weight. A missing key reads as 0 in
// pickWeighted, which would silently drop that expression from the beat.
for (const name of EXPRESSION_ORDER) {
  check(`weight present for ${name}`, typeof d.WEIGHTS[name] === 'number')
}
check('no weight for an unknown expression',
  Object.keys(d.WEIGHTS).every((k) => EXPRESSION_ORDER.includes(k)))

// neutral is the rest state; wide belongs to the hold reaction. Spec §5.4.
check('neutral is not in the glance pool', d.WEIGHTS.neutral === 0)
check('wide is not in the glance pool', d.WEIGHTS.wide === 0)
check('blink is the most frequent', d.WEIGHTS.blink === 2)
check('pool is not empty', EXPRESSION_ORDER.some((k) => d.WEIGHTS[k] > 0))

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll eye config checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/mascot/eyeTypes.check.ts
```

Expected: FAIL — `Cannot find module './eyeTypes'`.

- [ ] **Step 3: Write `eyeTypes.ts`**

Create `src/lib/mascot/eyeTypes.ts`:

```ts
/**
 * Hero mascot — the CMS-editable surface of the LED face display.
 *
 * Design: docs/superpowers/specs/2026-08-28-mascot-eyes-design.md
 *
 * ── What is deliberately NOT here ─────────────────────────────────────
 * The 14 expression SHAPES. They live frozen in ./eyes.ts and are pinned by
 * eyes.check.ts (spec §7.1). Editing `lookDownLeft.gaze` in a Payload form
 * with no mascot on screen is not a workflow anyone can succeed at — those
 * shapes took a live bench and three tuning rounds, and they are the design of
 * the character rather than content. Changing one is a code change; the bench
 * at /dev/mascot is the tool for it.
 *
 * FACE_RADIUS is here but NOT exposed to the CMS: it is a MEASURED property of
 * the model (the smooth front cap ends at 0.50 model units, where the
 * ornamental bezel relief begins), and a field inviting someone to move it
 * could only ever break the display mask.
 */

export type MascotEyesConfig = {
  /** Kill switch. False must leave the mascot exactly as it was before this
   *  feature existed — painted eyes visible, no socket darkening, no display. */
  ENABLED: boolean

  // ── look ────────────────────────────────────────────────────────────
  /** Body of the lit blob. Amber, not the reference video's cyan, so the hero
   *  keeps ONE warm accent rather than gaining a second, cold one. */
  COLOR: string
  /** Hot centre of the blob. */
  CORE: string
  /** Darkening laid over the cap so the mascot's PAINTED amber ovals do not
   *  show through and ring the new eyes with the old ones. */
  SOCKET: string
  GLOW: number
  /** Half-distance between the two eye home positions, in display units. */
  GAP: number
  /** How far past the display radius the socket darkening reaches.
   *  ⚠️ The shader HARD-RETURNS past this — there is no fade, so anything
   *  beyond it is cut with a sharp edge. At the approved 1.34 there is no
   *  headroom left: lookUpLeft already reaches 1.35. Raising this is the
   *  release valve if any gaze or dy is ever pushed further. Spec §6. */
  SOCKET_SPAN: number
  /** ⚠️ MEASURED, not taste. Not a CMS field. See the file header. */
  FACE_RADIUS: number

  // ── scanlines ───────────────────────────────────────────────────────
  /** Line count at full strength. */
  SCANLINE_MAX: number
  /** Body diameter (px) below which scanlines are off — 7 lines over an 18px
   *  eye is moire, not texture. Above the 28px base size on purpose, so they
   *  appear only over the nearer part of the orbit. */
  SCANLINE_MIN_PX: number
  /** px of body diameter per additional line, above the gate. */
  SCANLINE_RAMP: number

  // ── the beat ────────────────────────────────────────────────────────
  /** How long one glance takes, start to resolved. Kept a little shorter than
   *  the face-forward window so it lands and resolves while it can be seen. */
  GLANCE_SECONDS: number
  /** Where in the glance the expression peaks, 0..1. */
  GLANCE_PEAK: number
  /** cos(spin) above which the face counts as turned toward the viewer. */
  FACING_THRESHOLD: number
  /** Charge at which the press-and-hold reaction crosses from wide to shut. */
  CHARGE_CROSSOVER: number
  /** Never play the same expression two passes running. */
  NO_REPEAT: boolean

  /** Relative frequency in the glance pool, per expression name.
   *  0 removes it from the beat entirely. */
  WEIGHTS: Readonly<Record<string, number>>
}

/**
 * Owner-approved on screen 2026-08-28 across three live tuning rounds at
 * /dev/mascot. Frozen, and pinned field-by-field by eyeTypes.check.ts so a
 * later edit is a deliberate act with the owner in the loop, not a silent diff.
 */
export const DEFAULT_MASCOT_EYES: MascotEyesConfig = Object.freeze({
  ENABLED: true,

  COLOR: '#F2A81C',
  CORE: '#FFF0BE',
  SOCKET: '#000000',
  GLOW: 0.55,
  GAP: 0.38,
  SOCKET_SPAN: 1.34,
  FACE_RADIUS: 0.5,

  SCANLINE_MAX: 9,
  SCANLINE_MIN_PX: 44,
  SCANLINE_RAMP: 12,

  GLANCE_SECONDS: 0.6,
  GLANCE_PEAK: 0.45,
  FACING_THRESHOLD: 0.3,
  CHARGE_CROSSOVER: 0.7,
  NO_REPEAT: false,

  WEIGHTS: Object.freeze({
    neutral: 0,
    blink: 2,
    squint: 1,
    wide: 0,
    happy: 1,
    lookLeft: 1,
    lookRight: 1,
    lookUp: 1,
    lookDown: 1,
    lookUpLeft: 1,
    lookUpRight: 1,
    lookDownLeft: 1,
    lookDownRight: 1,
    wink: 1,
  }),
})
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/mascot/eyeTypes.check.ts
```

Expected: PASS, `All eye config checks passed.`

- [ ] **Step 5: Register and confirm**

Append to `verify:config` in `package.json`:

```
 && node --import tsx src/lib/mascot/eyeTypes.check.ts
```

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

Expected: typecheck clean, `verify:config` exits 0, zero `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mascot/eyeTypes.ts src/lib/mascot/eyeTypes.check.ts package.json
git commit -m "feat(mascot): frozen eye config — the CMS surface, shapes excluded"
```

---

## Task 3: The CMS resolver

**Files:**
- Create: `src/lib/mascot/resolveMascotEyes.ts`
- Create: `src/lib/mascot/resolveMascotEyes.check.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DEFAULT_MASCOT_EYES`, `MascotEyesConfig` (Task 2); `EXPRESSION_ORDER` (Task 1).
- Produces:
  - `type HeroEffectsEyesInput`
  - `resolveMascotEyes(cms: HeroEffectsEyesInput | null | undefined): MascotEyesConfig`
  - `toMascotEyesPayload(c: MascotEyesConfig): HeroEffectsEyesInput`

- [ ] **Step 1: Write the failing check suite**

Create `src/lib/mascot/resolveMascotEyes.check.ts`:

```ts
/**
 * Fallback / clamp / round-trip for the eye resolver.
 * Run: npm run verify:config
 * Mirrors src/lib/mascot/resolveMascot.check.ts.
 */
import { EXPRESSION_ORDER } from './eyes'
import { DEFAULT_MASCOT_EYES } from './eyeTypes'
import { resolveMascotEyes, toMascotEyesPayload } from './resolveMascotEyes'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_MASCOT_EYES

// Nothing saved -> every field is the frozen default.
check('null cms -> defaults', JSON.stringify(resolveMascotEyes(null)) === JSON.stringify(d))
check('undefined cms -> defaults', JSON.stringify(resolveMascotEyes(undefined)) === JSON.stringify(d))
check('empty object -> defaults', JSON.stringify(resolveMascotEyes({})) === JSON.stringify(d))

// A sibling group applies while others fall back.
{
  const r = resolveMascotEyes({ mascotEyesBeat: { glanceSeconds: 1.4 } })
  check('sibling applies', r.GLANCE_SECONDS === 1.4)
  check('untouched sibling falls back', r.GLOW === d.GLOW)
}

// null inside a group falls back — Payload returns nulls for never-saved fields.
{
  const r = resolveMascotEyes({ mascotEyesLook: { glow: null, gap: null } })
  check('null glow -> default', r.GLOW === d.GLOW)
  check('null gap -> default', r.GAP === d.GAP)
}

// A malformed hex is rejected rather than passed to THREE.Color.
{
  const r = resolveMascotEyes({ mascotEyesLook: { color: 'not-a-colour', socketColor: '#ABC' } })
  check('bad hex -> default colour', r.COLOR === d.COLOR)
  check('short hex -> default socket', r.SOCKET === d.SOCKET)
}
{
  const r = resolveMascotEyes({ mascotEyesLook: { color: '#123ABC' } })
  check('valid hex applies', r.COLOR === '#123ABC')
}

// 0..1 fields are clamped, so a bad CMS value cannot produce a divide-by-zero
// or an inverted beat.
{
  const r = resolveMascotEyes({ mascotEyesBeat: { glancePeak: 5, chargeCrossover: -3 } })
  check('glancePeak clamped below 1', r.GLANCE_PEAK < 1 && r.GLANCE_PEAK > 0)
  check('chargeCrossover clamped above 0', r.CHARGE_CROSSOVER > 0 && r.CHARGE_CROSSOVER < 1)
}
{
  const r = resolveMascotEyes({ mascotEyesBeat: { glanceSeconds: 0 } })
  check('glanceSeconds floored above 0', r.GLANCE_SECONDS > 0)
}

// NaN / Infinity from a corrupt row must not reach the shader.
{
  const r = resolveMascotEyes({ mascotEyesLook: { glow: Number.NaN, socketSpan: Number.POSITIVE_INFINITY } })
  check('NaN glow -> default', r.GLOW === d.GLOW)
  check('Infinite socketSpan -> default', r.SOCKET_SPAN === d.SOCKET_SPAN)
}

// FACE_RADIUS is not CMS-mapped and must always be the measured value.
check('FACE_RADIUS is never overridable', resolveMascotEyes({} as never).FACE_RADIUS === 0.5)

// Weights: a missing one falls back rather than becoming 0, which would
// silently drop that expression from the beat.
{
  const r = resolveMascotEyes({ mascotEyesWeights: { happy: 4 } })
  check('given weight applies', r.WEIGHTS.happy === 4)
  check('missing weight falls back', r.WEIGHTS.blink === d.WEIGHTS.blink)
  check('every expression still has a weight',
    EXPRESSION_ORDER.every((k) => typeof r.WEIGHTS[k] === 'number'))
}
{
  const r = resolveMascotEyes({ mascotEyesWeights: { happy: -2 } })
  check('negative weight clamped to 0', r.WEIGHTS.happy === 0)
}

// Round trip: perturb EVERY mapped field to a non-default value first.
// Round-tripping defaults against themselves is a near-tautology — the exact
// weakness the 2026-08-09 review found in resolveSeparation.check.ts.
{
  const perturbed: typeof d = {
    ENABLED: false,
    COLOR: '#112233',
    CORE: '#445566',
    SOCKET: '#778899',
    GLOW: 1.25,
    GAP: 0.51,
    SOCKET_SPAN: 1.9,
    FACE_RADIUS: 0.5, // not mapped; must survive as the measured value
    SCANLINE_MAX: 14,
    SCANLINE_MIN_PX: 61,
    SCANLINE_RAMP: 22,
    GLANCE_SECONDS: 1.15,
    GLANCE_PEAK: 0.66,
    FACING_THRESHOLD: 0.12,
    CHARGE_CROSSOVER: 0.41,
    NO_REPEAT: true,
    WEIGHTS: Object.freeze(
      Object.fromEntries(EXPRESSION_ORDER.map((k, i) => [k, (i % 4) + 1])),
    ),
  }
  const round = resolveMascotEyes(toMascotEyesPayload(perturbed))
  for (const k of Object.keys(perturbed) as (keyof typeof perturbed)[]) {
    check(`round trip preserves ${k}`, JSON.stringify(round[k]) === JSON.stringify(perturbed[k]))
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll eye resolver checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/mascot/resolveMascotEyes.check.ts
```

Expected: FAIL — `Cannot find module './resolveMascotEyes'`.

- [ ] **Step 3: Write the resolver**

Create `src/lib/mascot/resolveMascotEyes.ts`:

```ts
import { EXPRESSION_ORDER } from './eyes'
import { DEFAULT_MASCOT_EYES, type MascotEyesConfig } from './eyeTypes'

/**
 * The eyes' slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 *
 * FACE_RADIUS is deliberately absent — it is a measured property of the model,
 * not a preference. See eyeTypes.ts.
 */
export type HeroEffectsEyesInput = {
  mascotEyesEnabled?: boolean | null
  mascotEyesLook?: {
    color?: string | null
    coreColor?: string | null
    socketColor?: string | null
    glow?: number | null
    gap?: number | null
    socketSpan?: number | null
  } | null
  mascotEyesScanlines?: {
    max?: number | null
    minBodyPx?: number | null
    ramp?: number | null
  } | null
  mascotEyesBeat?: {
    glanceSeconds?: number | null
    glancePeak?: number | null
    facingThreshold?: number | null
    chargeCrossover?: number | null
    noRepeat?: boolean | null
  } | null
  mascotEyesWeights?: Record<string, number | null | undefined> | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: boolean | null | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

const hex = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v : fallback

/** Keeps a fraction strictly inside 0..1 — the beat divides by these. */
const frac = (v: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(0.999, Math.max(0.001, v)) : fallback

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveMascotEyes(
  cms: HeroEffectsEyesInput | null | undefined,
): MascotEyesConfig {
  const d = DEFAULT_MASCOT_EYES
  const l = cms?.mascotEyesLook ?? {}
  const s = cms?.mascotEyesScanlines ?? {}
  const b = cms?.mascotEyesBeat ?? {}
  const w = cms?.mascotEyesWeights ?? {}

  // A missing weight falls back to its default rather than to 0 — 0 would
  // silently drop that expression out of the beat.
  const weights: Record<string, number> = {}
  for (const k of EXPRESSION_ORDER) {
    weights[k] = Math.max(0, num(w?.[k], d.WEIGHTS[k] ?? 0))
  }

  return {
    ENABLED: bool(cms?.mascotEyesEnabled, d.ENABLED),

    COLOR: hex(l.color, d.COLOR),
    CORE: hex(l.coreColor, d.CORE),
    SOCKET: hex(l.socketColor, d.SOCKET),
    GLOW: num(l.glow, d.GLOW),
    GAP: num(l.gap, d.GAP),
    SOCKET_SPAN: num(l.socketSpan, d.SOCKET_SPAN),
    // Never CMS-mapped. Measured: the smooth front cap ends at 0.50.
    FACE_RADIUS: d.FACE_RADIUS,

    SCANLINE_MAX: num(s.max, d.SCANLINE_MAX),
    SCANLINE_MIN_PX: num(s.minBodyPx, d.SCANLINE_MIN_PX),
    SCANLINE_RAMP: num(s.ramp, d.SCANLINE_RAMP),

    GLANCE_SECONDS: Math.max(0.01, num(b.glanceSeconds, d.GLANCE_SECONDS)),
    GLANCE_PEAK: frac(num(b.glancePeak, d.GLANCE_PEAK), d.GLANCE_PEAK),
    FACING_THRESHOLD: num(b.facingThreshold, d.FACING_THRESHOLD),
    CHARGE_CROSSOVER: frac(num(b.chargeCrossover, d.CHARGE_CROSSOVER), d.CHARGE_CROSSOVER),
    NO_REPEAT: bool(b.noRepeat, d.NO_REPEAT),

    WEIGHTS: weights,
  }
}

/** The inverse, for the dev bench's save-to-CMS button. */
export function toMascotEyesPayload(c: MascotEyesConfig): HeroEffectsEyesInput {
  return {
    mascotEyesEnabled: c.ENABLED,
    mascotEyesLook: {
      color: c.COLOR,
      coreColor: c.CORE,
      socketColor: c.SOCKET,
      glow: c.GLOW,
      gap: c.GAP,
      socketSpan: c.SOCKET_SPAN,
    },
    mascotEyesScanlines: {
      max: c.SCANLINE_MAX,
      minBodyPx: c.SCANLINE_MIN_PX,
      ramp: c.SCANLINE_RAMP,
    },
    mascotEyesBeat: {
      glanceSeconds: c.GLANCE_SECONDS,
      glancePeak: c.GLANCE_PEAK,
      facingThreshold: c.FACING_THRESHOLD,
      chargeCrossover: c.CHARGE_CROSSOVER,
      noRepeat: c.NO_REPEAT,
    },
    mascotEyesWeights: { ...c.WEIGHTS },
  }
}
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/mascot/resolveMascotEyes.check.ts
```

Expected: PASS, `All eye resolver checks passed.`

- [ ] **Step 5: Register and confirm**

Append to `verify:config` in `package.json`:

```
 && node --import tsx src/lib/mascot/resolveMascotEyes.check.ts
```

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

Expected: typecheck clean, exits 0, zero `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mascot/resolveMascotEyes.ts src/lib/mascot/resolveMascotEyes.check.ts package.json
git commit -m "feat(mascot): eye config resolver with a perturbed round-trip check"
```

---

## Task 4: Engine takes `MascotEyesConfig`; kill switch skips injection

Replaces the prototype's `setEyeTuning(EyeTuning)` with `setEyeConfig(MascotEyesConfig)`, reads shapes from `EXPRESSIONS`, and makes `ENABLED: false` prevent shader injection entirely.

**Files:**
- Modify: `src/lib/mascot/MascotEngine.ts`
- Delete: `src/lib/mascot/eyeTuning.ts`
- Modify: `src/components/hero/MascotLayer.tsx`

**Interfaces:**
- Consumes: `MascotEyesConfig`, `DEFAULT_MASCOT_EYES` (Task 2); `EXPRESSIONS`, `EXPRESSION_ORDER`, `pickWeighted`, `rightOf`, `lerpEye`, `packEye` (Task 1).
- Produces:
  - `MascotEngine.setEyeConfig(c: MascotEyesConfig): void`
  - `MascotEngine.setInspect(v: { on: boolean; angleDeg: number; sizePx: number }): void` (unchanged)
  - `MascotLayer` prop `eyes: MascotEyesConfig` (**required**, not optional)

- [ ] **Step 1: Swap the engine's config type**

In `src/lib/mascot/MascotEngine.ts`:

Replace the `eyeTuning` import block:

```ts
import {
  DEFAULT_EYE_TUNING,
  pickWeighted,
  type EyeTuning,
  type TunedExpression,
} from './eyeTuning'
```

with:

```ts
import { DEFAULT_MASCOT_EYES, type MascotEyesConfig } from './eyeTypes'
```

and extend the existing `./eyes` import to pull in the moved helpers:

```ts
import {
  EXPRESSIONS,
  EYES_FRAGMENT_CHUNK,
  EYES_VERTEX_CHUNK,
  lerpEye,
  packEye,
  pickWeighted,
  rightOf,
  type Expression,
  type EyeShape,
} from './eyes'
```

Replace the `tuning` field declaration:

```ts
  private tuning: EyeTuning = DEFAULT_EYE_TUNING
```

with:

```ts
  private eyes: MascotEyesConfig = DEFAULT_MASCOT_EYES
```

- [ ] **Step 2: Rewrite the setter and the shape resolver**

Replace the whole `setEyeTuning` method with:

```ts
  /**
   * Live eye configuration. Rides the same no-rebuild path setConfig() uses, so
   * a slider drag does not tear down the engine and lose the pinned expression.
   */
  setEyeConfig(c: MascotEyesConfig) {
    const wasEnabled = this.eyes.ENABLED
    this.eyes = c
    const u = this.eyeUniforms
    ;(u.uEyeColor.value as THREE.Color).set(c.COLOR)
    ;(u.uEyeCore.value as THREE.Color).set(c.CORE)
    ;(u.uSocketColor.value as THREE.Color).set(c.SOCKET)
    u.uEyeGlow.value = c.GLOW
    u.uEyeGap.value = c.GAP
    u.uSocketSpan.value = c.SOCKET_SPAN
    u.uFaceRadius.value = c.FACE_RADIUS

    // Toggling the switch has to rebuild the material: when off, the display's
    // chunks are not injected AT ALL. Merely zeroing uEyesOn would leave the
    // socket mask compiled in and the mascot's painted eyes still covered —
    // which is exactly the half-disabled state this project has shipped three
    // times. Spec §7.4.
    if (this.model && wasEnabled !== c.ENABLED) this.patchEyes()

    // Re-write the current shape immediately: without this a change only
    // appears on the next glance, which reads as the control being dead.
    if (this.forcedExpr) this.setExpression(this.forcedExpr)
    if (this.reduced) this.drawStatic()
  }
```

Replace `exprOf` (which read `this.tuning.shapes`) with a direct lookup — shapes are frozen now, so there is no per-instance override:

```ts
  /** Shapes are frozen in ./eyes.ts; an unknown name resolves to neutral. */
  private exprOf(name: string): Expression {
    return EXPRESSIONS[name] ?? EXPRESSIONS.neutral
  }
```

Update `setExpression` to use `rightOf`:

```ts
  /** Drive the display: set the expression, optionally blended toward another. */
  setExpression(name: string, blendTo?: string, t = 0) {
    const a = this.exprOf(name)
    const b = blendTo ? this.exprOf(blendTo) : a
    const k = blendTo ? Math.min(1, Math.max(0, t)) : 0
    this.writeEyes(lerpEye(a.left, b.left, k), lerpEye(rightOf(a), rightOf(b), k))
  }
```

- [ ] **Step 3: Point `updateEyes` at the new config**

In `updateEyes`, replace `const t = this.tuning` with `const t = this.eyes`, and replace the weighted pick line's `t.weights` with `t.WEIGHTS`:

```ts
      this.glanceExpr = pickWeighted(
        t.WEIGHTS,
        Math.random(),
        t.NO_REPEAT ? this.lastGlance : null,
      )
```

All other reads in that method (`t.SCANLINE_MIN_PX`, `t.SCANLINE_MAX`, `t.SCANLINE_RAMP`, `t.FACING_THRESHOLD`, `t.GLANCE_SECONDS`, `t.CHARGE_CROSSOVER`, `t.GLANCE_PEAK`) already match the new field names and need no change.

- [ ] **Step 4: Gate the shader injection on `ENABLED`**

At the top of `patchEyes()`, before any material is touched, add the guard and make it able to *undo* a previous injection:

```ts
  private patchEyes() {
    for (const m of this.materials) {
      // OFF means the chunks are never injected — the mascot renders with its
      // own painted eyes, exactly as before this feature existed. Clearing
      // onBeforeCompile and forcing a recompile is what makes the switch
      // reversible at runtime rather than only at mount. Spec §7.4.
      if (!this.eyes.ENABLED) {
        m.onBeforeCompile = () => {}
        m.needsUpdate = true
        continue
      }
      // ... existing injection body for this material, unchanged ...
    }
  }
```

Keep the existing per-material body exactly as it is, including its needle assertion.

- [ ] **Step 5: Make `MascotLayer` pass a required config**

In `src/components/hero/MascotLayer.tsx`:

Replace the import:

```ts
import type { EyeTuning } from '../../lib/mascot/eyeTuning'
```

with:

```ts
import type { MascotEyesConfig } from '../../lib/mascot/eyeTypes'
```

Replace the two optional props in the destructuring and the type block. Change `eyeTuning,` to `eyes,` and replace:

```ts
  eyeTuning?: EyeTuning
  inspect?: { on: boolean; angleDeg: number; sizePx: number }
```

with:

```ts
  /**
   * REQUIRED, not optional. An optional config would silently fall back to the
   * engine's defaults if a caller ever dropped the prop — the same failure the
   * 2026-08-09 review found when `separation` was optional on HeroBlock.
   */
  eyes: MascotEyesConfig
  /** ⚠️ BENCH ONLY. Parks the mascot face-on and blown up for shape work. */
  inspect?: { on: boolean; angleDeg: number; sizePx: number }
```

Replace the effect:

```ts
  useEffect(() => {
    if (eyeTuning) engineRef.current?.setEyeTuning(eyeTuning)
  }, [eyeTuning])
```

with:

```ts
  useEffect(() => {
    engineRef.current?.setEyeConfig(eyes)
  }, [eyes])
```

and add `engine.setEyeConfig(eyes)` in the mount effect, immediately after `engine.setConfig(config)`.

- [ ] **Step 6: Delete the prototype module**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && rm src/lib/mascot/eyeTuning.ts
```

- [ ] **Step 7: Typecheck — expect callers to break**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit
```

Expected: FAIL, listing `HeroBlock.tsx`, `RenderBlocks.tsx`, `HeroPreview.tsx`, `MascotLab.tsx`, `EyePanel.tsx` as missing the new `eyes` prop or importing the deleted module. **That is the intended state at this step** — Tasks 5 and 7 fix them. Do not commit yet.

- [ ] **Step 8: Wire the hero so typecheck is clean**

In `src/components/blocks/HeroBlock.tsx`: add the import

```ts
import type { MascotEyesConfig } from '../../lib/mascot/eyeTypes'
```

add `eyes: MascotEyesConfig` to the props type next to `mascot: MascotConfig`, add `eyes,` to the destructuring next to `mascot,`, and pass it through:

```tsx
      <MascotLayer
        config={mascot}
        belt={satellites}
        active={stageLive}
        enabled={mascot.ENABLED}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
        eyes={eyes}
      />
```

In `src/components/blocks/RenderBlocks.tsx`, add the import and the prop:

```ts
import { resolveMascotEyes } from '../../lib/mascot/resolveMascotEyes'
```

```tsx
                  mascot={resolveMascot(effects)}
                  eyes={resolveMascotEyes(effects)}
```

In `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx`, mirror it next to `savedMascot`:

```tsx
        savedEyes={resolveMascotEyes(effects)}
```

In `src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx`, add a `savedEyes: MascotEyesConfig` prop, resolve live edits next to the existing `mascot = resolveMascot(...)` line:

```ts
    eyes = resolveMascotEyes(data as HeroEffectsEyesInput)
```

initialise `let eyes = savedEyes` alongside `let mascot = savedMascot`, and pass `eyes={eyes}` to `<HeroBlock>`.

- [ ] **Step 9: Typecheck and confirm the gates**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

Expected: typecheck clean (the two bench files are fixed in Task 7 — if they still error, comment out the `<EyePanel>` usage temporarily rather than changing engine code), `verify:config` exits 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(mascot): engine takes MascotEyesConfig; kill switch skips shader injection"
```

---

## Task 5: CMS fields and seed

**Files:**
- Modify: `src/globals/HeroEffects.ts`
- Modify: `src/seed/index.ts`

**Interfaces:**
- Consumes: field names must match `HeroEffectsEyesInput` from Task 3 exactly.
- Produces: the `hero-effects` columns the resolver reads.

- [ ] **Step 1: Add the fields**

In `src/globals/HeroEffects.ts`, after the `mascotBehaviour` group, insert:

```ts
    {
      name: 'mascotEyesEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'The mascot’s animated LED face. Turning this off restores its original painted eyes exactly — no socket darkening, no display. The expression SHAPES are not editable here: they were tuned on screen and are frozen in code; changing one is a code change.',
      },
    },
    {
      name: 'mascotEyesLook',
      type: 'group',
      label: 'Mascot eyes — look',
      fields: [
        colourField('color', '#F2A81C', {
          description: 'The lit eye. Amber rather than the reference’s cyan, so the hero keeps one warm accent.',
        }),
        colourField('coreColor', '#FFF0BE', { description: 'Hot centre of the eye.' }),
        colourField('socketColor', '#000000', {
          description: 'Darkening over the faceplate. It exists to cover the mascot’s own PAINTED amber ovals — lighten it and the old eyes show through around the new ones.',
        }),
        { name: 'glow', type: 'number', defaultValue: 0.55, min: 0, max: 2 },
        {
          name: 'gap',
          type: 'number',
          defaultValue: 0.38,
          min: 0,
          max: 0.9,
          admin: { description: 'Half-distance between the two eyes.' },
        },
        {
          name: 'socketSpan',
          type: 'number',
          defaultValue: 1.34,
          min: 0.3,
          max: 2.5,
          admin: {
            description:
              'How far the darkening reaches. ⚠️ Anything drawn past this is CUT with a hard edge, not faded, and at 1.34 there is no headroom left — one expression already reaches 1.35. Raise this, never lower it.',
          },
        },
      ],
    },
    {
      name: 'mascotEyesScanlines',
      type: 'group',
      label: 'Mascot eyes — scanlines',
      fields: [
        { name: 'max', type: 'number', defaultValue: 9, min: 0, max: 20 },
        {
          name: 'minBodyPx',
          type: 'number',
          defaultValue: 44,
          min: 0,
          max: 200,
          admin: {
            description:
              'Body size below which scanlines are off. Deliberately above the mascot’s 28px base, so they appear only as it swings near — 7 lines over an 18px eye is moire, not texture.',
          },
        },
        { name: 'ramp', type: 'number', defaultValue: 12, min: 1, max: 60 },
      ],
    },
    {
      name: 'mascotEyesBeat',
      type: 'group',
      label: 'Mascot eyes — beat',
      admin: {
        description:
          'The mascot plays ONE expression each time its face sweeps past the viewer, then returns to neutral. There is no idle timer and no cursor tracking — the face is only toward you about a quarter of each turn.',
      },
      fields: [
        { name: 'glanceSeconds', type: 'number', defaultValue: 0.6, min: 0.1, max: 3 },
        {
          name: 'glancePeak',
          type: 'number',
          defaultValue: 0.45,
          min: 0.05,
          max: 0.95,
          admin: { description: 'Where in the glance the expression peaks.' },
        },
        {
          name: 'facingThreshold',
          type: 'number',
          defaultValue: 0.3,
          min: -0.5,
          max: 0.95,
          admin: { description: 'How square-on the face must be to count as facing you.' },
        },
        {
          name: 'chargeCrossover',
          type: 'number',
          defaultValue: 0.7,
          min: 0.05,
          max: 0.95,
          admin: { description: 'While the mark is held: the eyes widen, then squeeze shut past this point.' },
        },
        { name: 'noRepeat', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'mascotEyesWeights',
      type: 'group',
      label: 'Mascot eyes — expression frequency',
      admin: {
        description:
          'How often each expression is picked. 0 removes it entirely. “Neutral” is the resting face and “wide” belongs to the press-and-hold reaction, so both are 0 here by design.',
      },
      fields: [
        { name: 'neutral', type: 'number', defaultValue: 0, min: 0, max: 4 },
        { name: 'blink', type: 'number', defaultValue: 2, min: 0, max: 4 },
        { name: 'squint', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'wide', type: 'number', defaultValue: 0, min: 0, max: 4 },
        { name: 'happy', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookLeft', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookRight', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookUp', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookDown', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookUpLeft', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookUpRight', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookDownLeft', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'lookDownRight', type: 'number', defaultValue: 1, min: 0, max: 4 },
        { name: 'wink', type: 'number', defaultValue: 1, min: 0, max: 4 },
      ],
    },
```

- [ ] **Step 2: Seed the approved values**

In `src/seed/index.ts`, after the `mascotBehaviour` line, add:

```ts
      // Eyes — owner-tuned at /dev/mascot across three rounds, signed off
      // 2026-08-28. Mirrors DEFAULT_MASCOT_EYES exactly;
      // src/lib/mascot/eyeTypes.check.ts pins the same numbers. The expression
      // SHAPES are frozen in src/lib/mascot/eyes.ts, not seeded.
      mascotEyesEnabled: true,
      mascotEyesLook: {
        color: '#F2A81C',
        coreColor: '#FFF0BE',
        socketColor: '#000000',
        glow: 0.55,
        gap: 0.38,
        socketSpan: 1.34,
      },
      mascotEyesScanlines: { max: 9, minBodyPx: 44, ramp: 12 },
      mascotEyesBeat: {
        glanceSeconds: 0.6,
        glancePeak: 0.45,
        facingThreshold: 0.3,
        chargeCrossover: 0.7,
        noRepeat: false,
      },
      mascotEyesWeights: {
        neutral: 0, blink: 2, squint: 1, wide: 0, happy: 1,
        lookLeft: 1, lookRight: 1, lookUp: 1, lookDown: 1,
        lookUpLeft: 1, lookUpRight: 1, lookDownLeft: 1, lookDownRight: 1, wink: 1,
      },
```

- [ ] **Step 3: Push the schema and verify no stale temp tables**

Stop the dev server first, then start it so Drizzle pushes the new columns:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run dev
```

Wait for `Ready`, then in another shell:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node -e "
const {createClient}=require('@libsql/client');
const c=createClient({url:'file:./tampa-taruno.db'});
c.execute(\"SELECT name FROM sqlite_master WHERE name LIKE '__new_%'\").then(r=>{
  console.log('temp tables:', r.rows.length? r.rows.map(x=>x.name).join(', '):'none');
  return c.execute('PRAGMA integrity_check');
}).then(r=>console.log('integrity:', r.rows[0].integrity_check));
"
```

Expected: `temp tables: none`, `integrity: ok`. **A stale `__new_hero_effects` has blocked this project's dev server twice.** If one appears, diff it against the real table across all columns before dropping it, and back up the DB first.

- [ ] **Step 4: Reseed and clear the CMS cache**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run seed && rm -rf .next/cache
```

`revalidateTag` is a no-op outside a request context and `unstable_cache` persists to disk, so the cache clear is required or the site keeps serving pre-seed data.

- [ ] **Step 5: Verify the fields round-trip through the real API**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && curl -s http://localhost:3000/api/globals/hero-effects | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const g=JSON.parse(s);
  console.log('enabled:', g.mascotEyesEnabled);
  console.log('look:', JSON.stringify(g.mascotEyesLook));
  console.log('beat:', JSON.stringify(g.mascotEyesBeat));
  console.log('weights.blink:', g.mascotEyesWeights?.blink);
});"
```

Expected: `enabled: true`, the look group with `socketColor: '#000000'`, the beat group, and `weights.blink: 2`.

- [ ] **Step 6: Commit**

```bash
git add src/globals/HeroEffects.ts src/seed/index.ts
git commit -m "feat(cms): mascot eyes — enable, look, scanlines, beat, expression weights"
```

---

## Task 6: The kill switch, verified both ways

Its own task because this bug class has shipped three times on this project.

**Files:**
- Create: `docs/superpowers/verification/eyes-kill-switch.mjs`

**Interfaces:**
- Consumes: the CMS fields from Task 5, the engine gate from Task 4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the verification script**

Create `docs/superpowers/verification/eyes-kill-switch.mjs`:

```js
/**
 * mascotEyesEnabled OFF must restore the mascot's ORIGINAL PAINTED EYES —
 * not merely blank the display. A switch that leaves the socket darkening
 * compiled in would cover the painted ovals and leave the face a black disc,
 * which is WORSE than the state the switch promises to restore. This bug class
 * (a switch that half-disables) has shipped THREE times on this project.
 *
 * Flips the real CMS value both ways via authenticated POST and samples the
 * face pixels each time.
 *
 * Run: node docs/superpowers/verification/eyes-kill-switch.mjs
 * Requires: npm run dev on :3000
 */
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:3000'
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

const token = await fetch(`${BASE}/api/users/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
})
  .then((r) => r.json())
  .then((j) => j.token)
if (!token) throw new Error('login failed — is the dev server up and seeded?')

const setEnabled = (v) =>
  fetch(`${BASE}/api/globals/hero-effects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ mascotEyesEnabled: v }),
  }).then((r) => r.json())

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1400, height: 900 },
})

// BOB_PX=0 and a frozen, face-on, enlarged mascot so the two samples are
// comparable. With the default bob the body drifts between screenshots and any
// pixel comparison measures that instead of the eyes.
const URL =
  `${BASE}/en/dev/mascot?ENTRANCE_MS=200&SPIN_SPEED=0&SPEED_SCALE=0&SIZE=340` +
  '&BOB_PX=0&TRAIL_ENABLED=0&LABEL_ENABLED=0&RADIUS=0.1&HEIGHT=0&DEPTH_SCALE=0'

async function sample() {
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
  // Hide the logo so it cannot paint over the parked mascot.
  await page.evaluate(() => {
    const l = [...document.querySelectorAll('label')].find((n) => n.innerText.includes('show logo'))
    const b = l?.querySelector('input[type=checkbox]')
    if (b && b.checked) b.click()
  })
  await new Promise((r) => setTimeout(r, 2500))
  const s = await page.evaluate(() => window.__ttMascot())
  const half = Math.round((s.diameterPx ?? 340) * 0.3)
  const buf = await page.screenshot({
    clip: {
      x: Math.round(s.pos.x - half),
      y: Math.round(s.pos.y - half),
      width: half * 2,
      height: half * 2,
    },
  })
  await page.close()
  // Mean luminance of the face crop. The painted eyes sit on a lit brass
  // faceplate; the socket darkening drops that sharply.
  let sum = 0
  let n = 0
  for (let i = 0; i < buf.length - 3; i += 400) {
    sum += buf[i]
    n++
  }
  return { mean: sum / n, raw: buf.length }
}

try {
  await setEnabled(true)
  const on = await sample()
  await setEnabled(false)
  const off = await sample()

  check('ON and OFF render differently', Math.abs(on.mean - off.mean) > 1,
    `on ${on.mean.toFixed(1)} vs off ${off.mean.toFixed(1)}`)
  // OFF must be BRIGHTER: no socket darkening laid over the faceplate.
  check('OFF is not the black-disc half-disabled state', off.mean > on.mean,
    `off ${off.mean.toFixed(1)} should exceed on ${on.mean.toFixed(1)}`)
} finally {
  await setEnabled(true) // leave it on
  await browser.close()
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nEye kill switch verified both ways.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node docs/superpowers/verification/eyes-kill-switch.mjs
```

Expected: PASS both checks. If `puppeteer-core` is missing, install it in the session scratchpad (never in the app) and run from there — the app's `package.json` must not gain it.

- [ ] **Step 3: Prove the check can actually fail**

Temporarily change the engine's guard in `patchEyes()` from `if (!this.eyes.ENABLED)` to `if (false)` — the half-disabled state the switch is supposed to prevent. Re-run:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node docs/superpowers/verification/eyes-kill-switch.mjs
```

Expected: FAIL on both checks. **Then revert the guard** and confirm it passes again. A kill-switch check that cannot fail is worth nothing, and this project has been bitten by exactly that.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/verification/eyes-kill-switch.mjs
git commit -m "test(mascot): kill switch restores the painted eyes, verified both ways"
```

---

## Task 7: Retarget the bench

The bench is now the only tool for shape work, so it must keep working.

**Files:**
- Modify: `src/app/(frontend)/[locale]/dev/mascot/EyePanel.tsx`
- Modify: `src/app/(frontend)/[locale]/dev/mascot/MascotLab.tsx`

**Interfaces:**
- Consumes: `MascotEyesConfig`, `DEFAULT_MASCOT_EYES`, `toMascotEyesPayload`, `EXPRESSIONS`, `EXPRESSION_ORDER`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Retarget `EyePanel` at the new config**

In `EyePanel.tsx`, replace the imports:

```ts
import {
  DEFAULT_EYE_TUNING,
  EXPRESSION_ORDER,
  cloneEyeTuning,
  type EyeTuning,
} from '@/lib/mascot/eyeTuning'
import type { EyeShape } from '@/lib/mascot/eyes'
```

with:

```ts
import { EXPRESSIONS, EXPRESSION_ORDER, type EyeShape } from '@/lib/mascot/eyes'
import { DEFAULT_MASCOT_EYES, type MascotEyesConfig } from '@/lib/mascot/eyeTypes'
```

Change the component's props from `tuning: EyeTuning` / `onChange: (t: EyeTuning) => void` to `config: MascotEyesConfig` / `onChange: (c: MascotEyesConfig) => void`, and update every `tuning.X` read to `config.X`. The weights slider becomes:

```tsx
      <Slider
        label={`Weight in glance pool${(config.WEIGHTS[sel] ?? 0) === 0 ? ' (never plays)' : ''}`}
        value={config.WEIGHTS[sel] ?? 0}
        min={0}
        max={4}
        step={1}
        onChange={(v) => onChange({ ...config, WEIGHTS: { ...config.WEIGHTS, [sel]: v } })}
      />
```

and the reset button uses `DEFAULT_MASCOT_EYES`.

- [ ] **Step 2: Make the shape sliders edit a local override**

Shapes are frozen now, so the panel keeps its own editable copy and pushes it through the existing `window.__ttMascotExpr` dev handle. Add near the other state:

```tsx
  /**
   * Shapes are FROZEN in eyes.ts and are not CMS-editable (spec §7.1), so the
   * panel holds its own working copy. `copy shapes` emits it as the literal
   * EXPRESSIONS body to paste back into eyes.ts — that paste IS the approval
   * step, and it is why this bench still exists after the config split.
   */
  const [shapes, setShapes] = useState<Record<string, { left: EyeShape; right: EyeShape | null }>>(
    () =>
      Object.fromEntries(
        EXPRESSION_ORDER.map((k) => [
          k,
          { left: { ...EXPRESSIONS[k].left }, right: EXPRESSIONS[k].right ? { ...EXPRESSIONS[k].right } : null },
        ]),
      ),
  )
```

Replace the `copy json` button's handler so it emits both halves:

```tsx
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(JSON.stringify({ config, shapes }, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [config, shapes])
```

Keep every existing behaviour that this session paid for: selecting an expression **holds** it (`setPinned(true)` + `pin(name)`), the release button, the inspect/truth banner, and the "eyes differ" left/right toggle.

- [ ] **Step 3: Update `MascotLab`**

Replace the eye state and pass-through:

```tsx
  const [eyes, setEyes] = useState<MascotEyesConfig>({ ...DEFAULT_MASCOT_EYES })
```

```tsx
      <MascotLayer
        config={cfg}
        belt={satellites}
        active={active}
        enabled={overridesApplied && cfg.ENABLED}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
        onStatus={setMascotStatus}
        eyes={eyes}
        inspect={inspect}
      />
```

```tsx
      <EyePanel config={eyes} onChange={setEyes} inspect={inspect} onInspect={setInspect} />
```

and extend the existing `save` callback's body to write both slices in one POST:

```ts
        body: JSON.stringify({ ...toMascotPayload(cfg), ...toMascotEyesPayload(eyes) }),
```

- [ ] **Step 4: Typecheck and confirm the bench loads**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en/dev/mascot
```

Expected: typecheck clean, `200`.

- [ ] **Step 5: Confirm a control still reaches the engine**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node -e "
const p=require('puppeteer-core');
(async()=>{
 const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--enable-unsafe-swiftshader','--use-gl=angle'],defaultViewport:{width:1400,height:900}});
 const pg=await b.newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto('http://localhost:3000/en/dev/mascot?ENTRANCE_MS=200',{waitUntil:'networkidle2',timeout:60000});
 await pg.waitForFunction(()=>window.__ttMascot&&window.__ttMascot().loaded,{timeout:60000});
 await new Promise(r=>setTimeout(r,2500));
 const ok=await pg.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='happy');if(!el)return false;el.click();return true;});
 console.log('selected happy:',ok,'| page errors:',errs.length);
 await b.close();process.exit(ok&&!errs.length?0:1);
})();"
```

Expected: `selected happy: true | page errors: 0`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(frontend)/[locale]/dev/mascot/EyePanel.tsx" "src/app/(frontend)/[locale]/dev/mascot/MascotLab.tsx"
git commit -m "refactor(mascot): bench drives MascotEyesConfig; shapes edited as a local override"
```

---

## Task 8: Rendering, legibility and clearance verification

**Files:**
- Create: `docs/superpowers/verification/eyes-render.mjs`
- Create: `docs/superpowers/verification/eyes-legibility.mjs`
- Create: `docs/superpowers/verification/eyes-clearance.mjs`
- Create: `docs/superpowers/verification/eyes-zoom.mjs`

**Interfaces:**
- Consumes: `window.__ttMascot()` (publishes `pos`, `diameterPx`, `spin`, `inspect`, `loaded`) and `window.__ttMascotExpr(name)`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the render + distinctness script**

Create `docs/superpowers/verification/eyes-render.mjs`:

```js
/**
 * Every expression must RENDER, and all 91 pairs must be visually distinct.
 *
 * This is the guard against the display's documented silent failure: feeding a
 * quantized `position` to the object-space mask makes every fragment fail, the
 * shader compiles clean, nothing throws, and the mascot simply shows its
 * PAINTED eyes as if the feature were absent. "No console errors" proves
 * nothing here — only pixels do.
 *
 * Run: node docs/superpowers/verification/eyes-render.mjs
 * Requires: npm run dev on :3000
 */
import puppeteer from 'puppeteer-core'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')
import { mkdirSync } from 'node:fs'

const OUT = (process.env.TT_SHOTS ?? 'eyeshots') + '/'
mkdirSync(OUT, { recursive: true })

// ⚠️ BOB_PX=0 is load-bearing, not cosmetic. With the default bob the body
// drifts vertically between screenshots and every pixel difference measures
// THAT rather than the eyes — it once produced a near-uniform 44-62 across
// every expression, i.e. three assertions passing for the wrong reason.
const URL =
  'http://localhost:3000/en/dev/mascot?ENTRANCE_MS=200&SPIN_SPEED=0&SPEED_SCALE=0' +
  '&SIZE=340&BOB_PX=0&TRAIL_ENABLED=0&LABEL_ENABLED=0'

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 4000))

const s = await page.evaluate(() => window.__ttMascot())
const half = 130
const clip = {
  x: Math.max(0, Math.round(s.pos.x - half)),
  y: Math.max(0, Math.round(s.pos.y - half)),
  width: half * 2,
  height: half * 2,
}

const names = await page.evaluate(() => window.__ttMascotExpr('neutral'))
const shots = []
for (const name of names) {
  await page.evaluate((n) => window.__ttMascotExpr(n), name)
  await new Promise((r) => setTimeout(r, 350))
  const file = `${OUT}${name}.png`
  await page.screenshot({ path: file, clip })
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
  // Lit amber pixels: clearly red>green>blue and bright. The PAINTED eyes are
  // dark amber in shadow; the lit display is far brighter.
  let lit = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 150 && data[i] > data[i + 2] + 45 && data[i + 1] > data[i + 2] + 15) lit++
  }
  shots.push({ name, lit, data, info, file })
  console.log(`  ${name.padEnd(15)} lit px = ${lit}`)
}

const dist = (a, b) => {
  let d = 0
  for (let i = 0; i < a.data.length; i += a.info.channels) {
    d += Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2])
  }
  return d / (a.data.length / a.info.channels) / 3
}

// Contact sheet — single screenshots have hidden real defects on this project
// more than once.
const cols = 4
const TH = 260
const tiles = []
for (let i = 0; i < shots.length; i++) {
  tiles.push({
    input: await sharp(shots[i].file).resize(TH, TH).toBuffer(),
    left: (i % cols) * TH,
    top: Math.floor(i / cols) * TH,
  })
}
await sharp({
  create: { width: cols * TH, height: Math.ceil(shots.length / cols) * TH, channels: 3, background: '#222' },
}).composite(tiles).png().toFile(`${OUT}sheet.png`)

await browser.close()

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

check('14 expressions registered', shots.length === 14, `got ${shots.length}`)

// 1. The display draws at all.
const dark = shots.filter((x) => x.lit < 40)
check('every expression is lit', dark.length === 0, dark.map((x) => x.name).join(', '))

// 2. Every expression differs from neutral.
const neutral = shots.find((x) => x.name === 'neutral')
const flat = shots.filter((x) => x.name !== 'neutral' && dist(neutral, x) < 1)
check('all differ from neutral', flat.length === 0, flat.map((x) => x.name).join(', '))

// 3. No two expressions are the same picture.
const collisions = []
for (let i = 0; i < shots.length; i++) {
  for (let j = i + 1; j < shots.length; j++) {
    const d = dist(shots[i], shots[j])
    if (d < 1) collisions.push(`${shots[i].name}=${shots[j].name}`)
  }
}
check('all pairs distinct', collisions.length === 0, collisions.join(', '))

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(`\nsheet: ${OUT}sheet.png`)
console.log(failures ? `\n${failures} check(s) failed.` : '\nEye render checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node docs/superpowers/verification/eyes-render.mjs
```

Expected: 14 expressions, all lit, all pairs distinct, 0 console errors.

- [ ] **Step 3: Write the legibility script**

Create `docs/superpowers/verification/eyes-legibility.mjs`:

```js
/**
 * Does each expression stay distinguishable at the size it actually SHIPS?
 *
 * The mascot is 12.6px on the far side of the orbit and 70px at closest
 * approach; the tuning bench shows the face at 340px+. This takes the crops
 * eyes-render.mjs already wrote and downsamples them to the real sizes.
 *
 * ⚠️ Downsampling a large render is NOT the same as rendering small — there is
 * no per-size antialiasing or mip selection — so treat these as an OPTIMISTIC
 * upper bound. It rules out expressions being identical at size; it does not
 * establish that a viewer reads fourteen distinct feelings at 12.6px, where the
 * display is about 6px across.
 *
 * Run: node docs/superpowers/verification/eyes-legibility.mjs
 * Requires: eyes-render.mjs to have run first.
 */
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')
import { readdirSync } from 'node:fs'

const DIR = (process.env.TT_SHOTS ?? 'eyeshots') + '/'
const SIZES = [
  { px: 12.6, note: 'far side of the orbit' },
  { px: 28, note: 'the configured SIZE' },
  { px: 70, note: 'closest approach' },
]
// Below this mean per-channel difference two crops are, in practice, the same
// picture. Deliberately low so the verdict errs toward optimism.
const SAME = 3

const names = readdirSync(DIR).filter((f) => f.endsWith('.png') && f !== 'sheet.png').map((f) => f.replace('.png', ''))
if (names.length !== 14) {
  console.error(`FAIL  expected 14 crops in ${DIR}, found ${names.length} — run eyes-render.mjs first`)
  process.exit(1)
}

const dist = (a, b) => {
  let d = 0
  for (let i = 0; i < a.data.length; i += a.info.channels) {
    d += Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2])
  }
  return d / (a.data.length / a.info.channels) / 3
}

let failures = 0
for (const { px, note } of SIZES) {
  const n = Math.max(4, Math.round(px))
  const imgs = {}
  for (const name of names) {
    imgs[name] = await sharp(`${DIR}${name}.png`).resize(n, n, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true })
  }
  const collisions = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (dist(imgs[names[i]], imgs[names[j]]) < SAME) collisions.push(`${names[i]}=${names[j]}`)
    }
  }
  const pairs = (names.length * (names.length - 1)) / 2
  const ok = collisions.length === 0
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${String(px).padStart(5)}px (${note}): ${collisions.length}/${pairs} colliding  ${collisions.slice(0, 6).join(', ')}`)
}

console.log(failures ? `\n${failures} size(s) failed.` : '\nEye legibility checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 4: Write the clearance script**

Create `docs/superpowers/verification/eyes-clearance.mjs`:

```js
/**
 * How close does each eye come to the socket mask?
 *
 * The shader HARD-RETURNS when r > SOCKET_SPAN — there is no fade, so anything
 * past it is cut with a sharp edge. The approved values leave no headroom:
 * lookUpLeft already reaches 1.35 against a span of 1.34. That overshoot is
 * ~1.7px at 715px and sub-pixel at ship size, so it is the RECORDED BASELINE
 * rather than a failure. This script fails on anything WORSE than that.
 *
 * Pure geometry, no browser: reads the frozen shapes and config directly.
 * Run: node --import tsx docs/superpowers/verification/eyes-clearance.mjs
 */
import { EXPRESSIONS, EXPRESSION_ORDER, rightOf } from '../../../src/lib/mascot/eyes.ts'
import { DEFAULT_MASCOT_EYES } from '../../../src/lib/mascot/eyeTypes.ts'

const { GAP, SOCKET_SPAN } = DEFAULT_MASCOT_EYES
// The worst overshoot the owner approved, 2026-08-28. Spec §6.
const BASELINE_WORST = 1.36

const rimMax = (s, side) => {
  const cx = (GAP + s.dx) * side + s.gaze
  const cy = s.dy
  const a = ((s.lean * side) * Math.PI) / 180
  let worst = 0
  for (let i = 0; i < 720; i++) {
    const th = (i / 720) * Math.PI * 2
    const ex = s.w * Math.cos(th)
    const ey = s.h * Math.sin(th)
    // A leaned ellipse's extreme is not simply centre + w, so sample the rim.
    const rx = ex * Math.cos(a) - ey * Math.sin(a)
    const ry = ex * Math.sin(a) + ey * Math.cos(a)
    worst = Math.max(worst, Math.hypot(cx + rx, cy + ry))
  }
  return worst
}

let failures = 0
let worstOverall = 0
console.log(`socket span ${SOCKET_SPAN}   (smooth front cap ends at 1.00)\n`)
const rows = EXPRESSION_ORDER.map((name) => {
  const e = EXPRESSIONS[name]
  return { name, reach: Math.max(rimMax(e.left, -1), rimMax(rightOf(e), 1)) }
}).sort((a, b) => b.reach - a.reach)

for (const r of rows) {
  worstOverall = Math.max(worstOverall, r.reach)
  const m = SOCKET_SPAN - r.reach
  const flag = m < 0 ? 'CLIPPED' : m < 0.06 ? 'tight' : ''
  console.log(`  ${r.name.padEnd(15)} reach ${r.reach.toFixed(3)}  margin ${m.toFixed(3)}  ${flag}`)
}

const ok = worstOverall <= BASELINE_WORST
if (!ok) failures++
console.log(
  `\n${ok ? 'ok  ' : 'FAIL'}  worst reach ${worstOverall.toFixed(3)} vs recorded baseline ${BASELINE_WORST}`,
)
if (!ok) {
  console.error('      A shape now reaches further than the owner approved. Either pull it back,')
  console.error('      or raise SOCKET_SPAN — which is the documented release valve (spec §6).')
}
process.exit(failures ? 1 : 0)
```

- [ ] **Step 5: Write the zoom tool**

Create `docs/superpowers/verification/eyes-zoom.mjs`:

```js
/**
 * Render ONE expression large and crop tight to the face.
 *
 * NOT an assertion — a TOOL, and it exists because of a real mistake: during
 * tuning the crescents were diagnosed as rendering "hollow rings", and the
 * shader's core shading was changed to fix it. At 715px they turned out to be
 * SOLID all along; the ring was an artifact of judging a ~100px face in a
 * contact-sheet thumbnail. The shading change was reverted.
 *
 * ZOOM BEFORE DIAGNOSING.
 *
 * Usage: node docs/superpowers/verification/eyes-zoom.mjs <expression> [sizePx]
 */
import puppeteer from 'puppeteer-core'

const NAME = process.argv[2] || 'neutral'
const SIZE = Number(process.argv[3] || 760)

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1600, height: 1100 },
})
const page = await browser.newPage()
await page.goto(
  `http://localhost:3000/en/dev/mascot?ENTRANCE_MS=200&SPIN_SPEED=0&SPEED_SCALE=0&SIZE=${SIZE}` +
    '&BOB_PX=0&TRAIL_ENABLED=0&LABEL_ENABLED=0&RADIUS=0.1&HEIGHT=0&DEPTH_SCALE=0',
  { waitUntil: 'networkidle2', timeout: 60000 },
)
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3500))

// RADIUS 0.1 parks the mascot over the mark, and the logo paints on top of it.
for (const t of ['show logo', 'show satellites']) {
  await page.evaluate((x) => {
    const l = [...document.querySelectorAll('label')].find((n) => n.innerText.includes(x))
    const b = l?.querySelector('input[type=checkbox]')
    if (b && b.checked) b.click()
  }, t)
}
await new Promise((r) => setTimeout(r, 700))
await page.evaluate((n) => window.__ttMascotExpr(n), NAME)
await new Promise((r) => setTimeout(r, 600))

const s = await page.evaluate(() => window.__ttMascot())
const d = s.diameterPx ?? SIZE
const half = Math.round(d * 0.42)
const out = `zoom-${NAME}.png`
await page.screenshot({
  path: out,
  clip: {
    x: Math.max(0, Math.round(s.pos.x - half)),
    y: Math.max(0, Math.round(s.pos.y - half)),
    width: half * 2,
    height: half * 2,
  },
})
console.log(`${NAME}: body ${d.toFixed(0)}px -> ${out}`)
await browser.close()
```

- [ ] **Step 6: Run all three and eyeball the sheet**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node docs/superpowers/verification/eyes-render.mjs && node docs/superpowers/verification/eyes-legibility.mjs && node --import tsx docs/superpowers/verification/eyes-clearance.mjs && node docs/superpowers/verification/eyes-zoom.mjs happy
```

Expected: all pass; `eyes-clearance` reports worst reach ≈ 1.354 under the 1.36 baseline; `zoom-happy.png` shows solid crescents.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/verification/eyes-render.mjs docs/superpowers/verification/eyes-legibility.mjs docs/superpowers/verification/eyes-clearance.mjs docs/superpowers/verification/eyes-zoom.mjs
git commit -m "test(mascot): eye render, legibility, socket clearance and a zoom tool"
```

---

## Task 9: Beat and reduced-motion verification

**Files:**
- Create: `docs/superpowers/verification/eyes-beat.mjs`
- Create: `docs/superpowers/verification/eyes-reduced-motion.mjs`
- Modify: `src/lib/mascot/MascotEngine.ts` (`drawStatic` sets neutral)

**Interfaces:**
- Consumes: `window.__ttMascot()`, `window.__ttMascotExpr(null)`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Make the reduced-motion frame explicitly neutral**

In `MascotEngine.drawStatic()`, before the draw call, add:

```ts
    // A visitor who asked for stillness must not get a face caught mid-glance.
    // Spec §8.3.
    this.glanceT = 1
    this.glanceExpr = null
    this.setExpression('neutral')
```

- [ ] **Step 2: Write the beat script**

Create `docs/superpowers/verification/eyes-beat.mjs`:

```js
/**
 * The beat: one expression per orbit pass, resolving back to neutral, plus the
 * press-and-hold reaction.
 *
 * Samples the eye uniforms indirectly through the rendered face, because the
 * engine does not publish them: a run of frames is captured while the mascot
 * spins normally, and each frame is scored for how much lit area it shows.
 * Neutral is the widest resting shape, so the beat appears as dips and changes
 * in that trace rather than a flat line.
 *
 * Run: node docs/superpowers/verification/eyes-beat.mjs
 * Requires: npm run dev on :3000
 */
import puppeteer from 'puppeteer-core'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

// Face-on and parked so the display is always visible, but the SPIN still
// runs — the beat is driven by cos(spin) crossing the facing threshold, so
// freezing the spin would freeze the beat too.
await page.goto(
  'http://localhost:3000/en/dev/mascot?ENTRANCE_MS=200&SPEED_SCALE=0&SIZE=340&BOB_PX=0' +
    '&TRAIL_ENABLED=0&LABEL_ENABLED=0&DEPTH_SCALE=0',
  { waitUntil: 'networkidle2', timeout: 60000 },
)
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3000))
// Make sure nothing is pinned from a previous script.
await page.evaluate(() => window.__ttMascotExpr(null))

const s = await page.evaluate(() => window.__ttMascot())
const half = 120
const clip = {
  x: Math.max(0, Math.round(s.pos.x - half)),
  y: Math.max(0, Math.round(s.pos.y - half)),
  width: half * 2,
  height: half * 2,
}

const litOf = async () => {
  const buf = await page.screenshot({ clip })
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let lit = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 150 && data[i] > data[i + 2] + 45) lit++
  }
  return lit
}

// One full revolution is 3.2s at SPIN_SPEED 113. Sample ~8s to catch several
// passes.
const trace = []
for (let i = 0; i < 40; i++) {
  const facing = await page.evaluate(() => Math.cos(window.__ttMascot().spin))
  trace.push({ facing, lit: facing > 0.3 ? await litOf() : null })
  await new Promise((r) => setTimeout(r, 200))
}

const facingFrames = trace.filter((t) => t.lit !== null)
check('face turned toward the viewer during the run', facingFrames.length > 3, `${facingFrames.length} frames`)

const lits = facingFrames.map((t) => t.lit)
const spread = Math.max(...lits) - Math.min(...lits)
// A dead beat would hold one shape and produce a near-flat trace.
check('the face changes shape while facing', spread > 300, `lit spread ${spread}`)

// Press-and-hold: eyes go wide then squeeze shut. Drive the real gesture.
await page.evaluate(() => window.__ttMascotExpr(null))
const canvas = await page.$('canvas')
const box = await canvas.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await new Promise((r) => setTimeout(r, 400))
const midHold = await litOf()
await new Promise((r) => setTimeout(r, 1200))
const lateHold = await litOf()
await page.mouse.up()

check('hold squeezes the eyes shut at the peak', lateHold < midHold,
  `mid ${midHold} -> late ${lateHold}`)
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nEye beat checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 3: Write the reduced-motion script**

Create `docs/superpowers/verification/eyes-reduced-motion.mjs`:

```js
/**
 * Under prefers-reduced-motion the mascot renders a single static frame. The
 * eyes must be present and NEUTRAL in it — not blank, and not frozen
 * mid-glance. This site honours the preference in 19 places; a visitor who
 * asked for stillness must not get a blinking face.
 *
 * An earlier effect on this project shipped a "static frame" that was very
 * nearly empty, so this asserts non-emptiness explicitly.
 *
 * Run: node docs/superpowers/verification/eyes-reduced-motion.mjs
 */
import puppeteer from 'puppeteer-core'
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
await page.goto(
  'http://localhost:3000/en/dev/mascot?ENTRANCE_MS=0&SIZE=340&DEPTH_SCALE=0&TRAIL_ENABLED=0&LABEL_ENABLED=0',
  { waitUntil: 'networkidle2', timeout: 60000 },
)
await page.waitForFunction(() => window.__ttMascot && window.__ttMascot().loaded, { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3000))

const s = await page.evaluate(() => window.__ttMascot())
const half = 120
const clip = {
  x: Math.max(0, Math.round(s.pos.x - half)),
  y: Math.max(0, Math.round(s.pos.y - half)),
  width: half * 2,
  height: half * 2,
}

const litOf = async () => {
  const buf = await page.screenshot({ clip })
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let lit = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 150 && data[i] > data[i + 2] + 45) lit++
  }
  return lit
}

const a = await litOf()
await new Promise((r) => setTimeout(r, 2500))
const b = await litOf()

check('static frame is not blank', a > 200, `${a} lit px`)
check('frame does not change over 2.5s', Math.abs(a - b) < 30, `${a} -> ${b}`)
check('spin is not advancing', (await page.evaluate(() => window.__ttMascot().spin)) === 0)

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nEye reduced-motion checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 4: Run both**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node docs/superpowers/verification/eyes-beat.mjs && node docs/superpowers/verification/eyes-reduced-motion.mjs
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/verification/eyes-beat.mjs docs/superpowers/verification/eyes-reduced-motion.mjs src/lib/mascot/MascotEngine.ts
git commit -m "test(mascot): beat and reduced-motion verification; static frame is neutral"
```

---

## Task 10: Degradation, README, and the full gate sweep

**Files:**
- Modify: `docs/superpowers/verification/README.md`
- Modify: `src/lib/mascot/MascotEngine.ts` (defensive guards)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Harden the shader injection against a compile failure**

Spec §10: the display is additive to an existing material and must never be able to blank the mascot. In `patchEyes()`, wrap the per-material injection so a thrown error leaves that material stock:

```ts
      try {
        // ... existing injection body, including the needle assertion ...
      } catch (err) {
        // The eyes are additive. A failure here must leave the mascot rendering
        // with its own painted face, never blank it.
        console.error('MascotEngine: eye display disabled — shader patch failed', err)
        m.onBeforeCompile = () => {}
        m.needsUpdate = true
      }
```

- [ ] **Step 2: Guard the uniform write against a short array**

In `writeEyes`, before packing:

```ts
  private writeEyes(l: EyeShape, r: EyeShape) {
    const L = this.eyeUniforms.uEyeL.value as Float32Array
    const R = this.eyeUniforms.uEyeR.value as Float32Array
    // Never let a malformed shape reach the shader as NaN — a NaN in the SDF
    // makes the whole eye vanish with nothing logged.
    if (L.length < 12 || R.length < 12) return
    packEye(l, L, 0)
    packEye(r, R, 0)
  }
```

- [ ] **Step 3: Document the traps in the harness README**

Append to `docs/superpowers/verification/README.md`:

```markdown
## Mascot eyes (`eyes-*.mjs`)

`eyes-render` · `eyes-legibility` · `eyes-clearance` · `eyes-beat` ·
`eyes-kill-switch` · `eyes-reduced-motion`, plus `eyes-zoom` (a tool, not a check).

Run order matters once: `eyes-legibility` consumes the crops `eyes-render` writes.

**Three traps, each paid for in real debugging time:**

1. **`BOB_PX` must be 0 for any pixel comparison.** With the default bob the
   body drifts vertically between screenshots and the diff measures *that*, not
   the eyes. It produced a near-uniform 44–62 across every expression — three
   assertions passing for the wrong reason.

2. **Wait for the condition, never sleep a fixed time, when asserting something
   HAPPENED.** A fixed 6s sleep in `mascot-kill-switch.mjs` raced a cold 530 KB
   GLB fetch and reported "model never fetched" on a build where it loads
   perfectly. The inverse also holds: when asserting nothing *ever* happens,
   only elapsed time can support it, so keep the fixed sleep on the OFF
   polarity.

3. **Zoom before diagnosing.** The crescent eyes were diagnosed as rendering
   "hollow rings" from a contact-sheet thumbnail, and the shader's core shading
   was changed to fix it. At 715px they were solid all along; the change made no
   visible difference and was reverted. `eyes-zoom.mjs <expression>` exists for
   exactly this.

**A silent-failure note specific to this display:** feeding a quantized
`position` to the object-space mask makes every fragment fail — the shader
compiles clean, nothing throws, and the mascot shows its PAINTED eyes as if the
feature were absent. "No console errors" proves nothing here. `eyes-render.mjs`
asserts on pixels for that reason.
```

- [ ] **Step 4: Full gate sweep**

Stop the dev server, then:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config && npm run build && rm -rf .next
```

Expected: typecheck clean; `verify:config` exits 0 with zero `FAIL` and **more than 625** `ok` lines; production build succeeds. **The build must not run while dev is live** — it corrupts `.next` for the running server.

- [ ] **Step 5: Restart dev and run the whole browser harness**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run dev
```

Then in another shell:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && \
  node docs/superpowers/verification/eyes-render.mjs && \
  node docs/superpowers/verification/eyes-legibility.mjs && \
  node --import tsx docs/superpowers/verification/eyes-clearance.mjs && \
  node docs/superpowers/verification/eyes-beat.mjs && \
  node docs/superpowers/verification/eyes-kill-switch.mjs && \
  node docs/superpowers/verification/eyes-reduced-motion.mjs && \
  node docs/superpowers/verification/mascot-capture.mjs && \
  node docs/superpowers/verification/mascot-sorting.mjs && \
  node docs/superpowers/verification/mascot-occlusion.mjs && \
  node docs/superpowers/verification/mascot-label.mjs && \
  node docs/superpowers/verification/mascot-degradation.mjs && \
  node docs/superpowers/verification/mascot-kill-switch.mjs
```

Expected: every script exits 0. The pre-existing `mascot-*` scripts must be unaffected — the eyes change nothing about the orbit, depth sorting, occlusion or label placement.

- [ ] **Step 6: Confirm the real homepage still works**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && for L in en id; do curl -s -o /dev/null -w "$L %{http_code}\n" "http://localhost:3000/$L"; done
```

Expected: `en 200`, `id 200`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(mascot): eye degradation guards and harness README; full gate sweep green"
```

---

## Task 11: Update the handoff

**Files:**
- Modify: `D:\TAMPA TARUNO\WEBSITE\_HANDOFF\HANDOFF.md`

**⚠️ The real `_HANDOFF/` is OUTSIDE the git repo**, a sibling of `_WEB_PRODUCT` at the `WEBSITE` root. Do **not** write to `_WEB_PRODUCT/_HANDOFF/` — a stray duplicate there has been created by accident before.

- [ ] **Step 1: Rewrite §00b**

Replace the "MID-BRAINSTORM / spec NOT yet written" framing in §00b with the shipped state. It must record:

- Spec: `docs/superpowers/specs/2026-08-28-mascot-eyes-design.md`; plan: `docs/superpowers/plans/2026-08-28-mascot-eyes.md`.
- **14 expressions**, all owner-approved across three live tuning rounds, frozen in `eyes.ts` and pinned by `eyes.check.ts`.
- **Two capabilities the prototype lacked**, both found only because tuning happened on screen: `gaze` (a shared horizontal offset — `dx` is mirrored, so the six `look*` directions were structurally impossible rather than badly tuned) and `crescent` (a subtraction, replacing `smile`, because the reference's happy eye is hollow).
- **CMS scope:** look/scanlines/beat/weights editable (~29 fields); the 105 shape numbers frozen in code. Changing an expression is a code change; the bench is the tool.
- **⚠️ Socket clearance has no headroom.** `lookUpLeft` reaches 1.35 against `SOCKET_SPAN 1.34`. Sub-pixel at ship size, but the margin is gone — raising `SOCKET_SPAN` is the release valve.
- **⚠️ The deliberate asymmetries** in `lookUpLeft/Right` and `lookDownLeft/Right`, and that `wink` is *not* one eye closed. Do not normalise either.
- The three verification traps from Task 10 Step 3.
- The new `verify:config` assertion count, and that all `mascot-*` harness scripts still pass.
- **Still not merged.** `main` remains at `ac6687e`.

- [ ] **Step 2: Update the §00 header line**

Change the file's `Last updated` / phase line so it no longer says the eyes are mid-brainstorm.

- [ ] **Step 3: Verify you edited the right file**

```bash
ls "D:/TAMPA TARUNO/WEBSITE/_HANDOFF/HANDOFF.md" && ls "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT/_HANDOFF" 2>/dev/null && echo "!! stray _HANDOFF inside the repo — delete it" || echo "ok: no stray _HANDOFF in the repo"
```

Expected: the real file exists; no stray folder inside `_WEB_PRODUCT`.

- [ ] **Step 4: Report to the owner**

The handoff is outside git, so there is nothing to commit. Summarise for the owner: what shipped, the socket-clearance limit, that shapes are code-frozen, and that **the branch is still unmerged** — ask whether to merge `feat/hero-mascot` to `main` with `--no-ff`, re-running the standing gates on `main` afterwards per this project's established discipline.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 owner's decisions | 1, 2 (pinned values) |
| §3 what tuning caught | 1 (`gaze`/`crescent` already in `eyes.ts`), documented in 11 |
| §4.1–4.3 architecture, quantization trap | 4 (injection guard preserves the needle assertion), 10 (try/catch) |
| §4.4 visibility budget | 8 (`eyes-legibility`) |
| §5.1 shape model | 1 (`packEye` slot assertions) |
| §5.2 look and beat values | 2 |
| §5.3 the 14 expressions | 1 |
| §5.4 glance weights | 2, 5 |
| §6 socket clearance | 8 (`eyes-clearance`, baseline-guarded) |
| §7.1 CMS scope | 2, 5 |
| §7.2 fields | 5 |
| §7.3 generous ranges | 5 |
| §7.4 kill switch | 4 (engine gate), 6 (verified, and proven able to fail) |
| §7.5 resolver | 3 |
| §7.6 modules | 4 (delete `eyeTuning.ts`), 7 (bench retarget) |
| §8.1 glance on each pass | 9 (`eyes-beat`) |
| §8.2 press-and-hold | 9 |
| §8.3 reduced motion | 9 |
| §9 verification | 6, 8, 9, 10 |
| §10 degradation | 10 |
| §11 out of scope | nothing built |

No gaps.

**Placeholder scan:** every code step carries real code. No "TBD", no "add error handling", no "similar to Task N".

**Type consistency:** `MascotEyesConfig` / `DEFAULT_MASCOT_EYES` (Task 2) are the names used in Tasks 3, 4, 5, 7. `resolveMascotEyes` / `toMascotEyesPayload` / `HeroEffectsEyesInput` (Task 3) match their use in Tasks 4 and 7. `setEyeConfig` (Task 4) is the name used in Task 7's bench wiring. The CMS field names in Task 5 match `HeroEffectsEyesInput` in Task 3 field for field. `EXPRESSION_ORDER`, `pickWeighted`, `rightOf` (Task 1) are imported in Tasks 2, 3 and 4.

**One note for the executor:** Task 4 deliberately leaves the tree not typechecking between Steps 7 and 8. It is a single mechanical rename spanning the engine and its callers, and splitting it would mean committing a broken build. Do not commit inside that window.
