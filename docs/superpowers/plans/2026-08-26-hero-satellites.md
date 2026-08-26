# Hero Orbiting Satellites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the owner-approved satellites prototype into the shipping hero — CMS-editable, test-covered, replacing `ConstellationField`.

**Architecture:** Two stacked 2D canvases with the logo's existing WebGL canvas between them, so occlusion falls out of DOM paint order. A pure config object flows CMS → `resolveSatellites` → `SatelliteField` → `SatelliteEngine`. `LogoEngine` is not modified; the field reads its separation charge through a getter published by `LogoCanvas`.

**Tech Stack:** Next.js 15 (App Router) · Payload CMS 3 · SQLite (dev) · TypeScript · plain 2D canvas (no three.js in this module) · `tsx` check scripts (this repo has no test runner) · `puppeteer-core` for browser verification.

**Spec:** [`docs/superpowers/specs/2026-08-26-hero-satellites-design.md`](../specs/2026-08-26-hero-satellites-design.md)

**Starting point:** branch `feat/hero-satellites` at `1ae60b5`. The prototype already works and is owner-approved; this plan makes it shippable. Read the spec before starting — it records *why* several non-obvious choices are the way they are.

## Global Constraints

- **Work on `feat/hero-satellites`.** Do not commit to `main`. Do not push without the owner asking.
- **Git in this repo needs** `-c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"` on every command (Windows "dubious ownership").
- **This repo has no test runner.** Tests are plain `tsx` scripts that throw, registered in `package.json`'s `verify:config`. Follow `src/lib/three/ignition/resolveIgnition.check.ts` exactly — `let failures = 0`, a `check(label, cond)` helper, `process.exit(failures ? 1 : 0)` at the end.
- **The in-app browser pane CANNOT verify this effect.** It reports the tab hidden, throttling `requestAnimationFrame` to ~1 Hz, which stalls the engine's own clock. Use headless Chrome via `puppeteer-core` at `C:/Program Files/Google/Chrome/Application/chrome.exe` with `--enable-unsafe-swiftshader --use-gl=angle`. Treat fps figures as a floor.
- **Every browser check must set** `page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])`. The owner's own machine had OS animations off in August and the whole hero correctly switched itself off.
- **CMS ranges must match the bench sliders exactly.** A bench that can produce a value the CMS rejects is worse than no bench.
- **Not localized.** Satellite appearance is numbers and hex; identical in EN and ID. Only `floatingWords` is localized, and it already exists.
- **Colour belongs to the orbit slot, not the word** (spec §7.2). Satellite *i* takes colour *i*. Reordering words does not reorder colours.
- **Standing gates before any commit that touches app code:** `npx tsc --noEmit` clean and `npm run verify:config` green.
- **Approved config values are frozen in `DEFAULT_SATELLITES`.** Do not change them. They were tuned live and signed off.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/satellites/types.ts` | `SatelliteConfig` + frozen `DEFAULT_SATELLITES`. Modify: drop prototype framing. |
| `src/lib/satellites/types.check.ts` | **New.** Defaults are frozen, internally consistent, in CMS range. |
| `src/lib/satellites/labels.ts` | **New.** Pure label placement — edge fade + overlap suppression. Extracted from the engine so it can be tested without a DOM. |
| `src/lib/satellites/labels.check.ts` | **New.** Placement assertions. |
| `src/lib/satellites/resolveSatellites.ts` | **New.** CMS ↔ engine mapping, both directions. |
| `src/lib/satellites/resolveSatellites.check.ts` | **New.** Fallback, clamping, round-trip. |
| `src/lib/satellites/SatelliteEngine.ts` | Simulation + rendering. Modify: delegate placement to `labels.ts`. |
| `src/components/hero/SatelliteField.tsx` | React wrapper. Modify: `config` becomes required. |
| `src/globals/HeroEffects.ts` | Modify: add the Satellites groups + colour array + kill switch. |
| `src/seed/index.ts` | Modify: seed the approved values. |
| `src/components/blocks/RenderBlocks.tsx` | Modify: pass `resolveSatellites(effects)`. |
| `src/components/blocks/HeroBlock.tsx` | Modify: take `satellites` prop, drop the `?satellites=` prototype switch. |
| `src/app/(frontend)/[locale]/dev/satellites/SatelliteLab.tsx` | Modify: save to CMS instead of localStorage. |
| `src/app/(frontend)/[locale]/admin-preview/hero/*` | Modify: satellites in the live preview. |
| `src/components/hero/ConstellationField.tsx` | **Delete** — last task, after owner sign-off. |
| `docs/superpowers/verification/*.mjs` | **New.** Promoted from the session scratchpad. |

---

### Task 1: Promote the config module out of prototype status

**Files:**
- Modify: `src/lib/satellites/types.ts` (header comment only — values are frozen)
- Modify: `src/lib/satellites/SatelliteEngine.ts:5-23` (header comment only)
- Create: `src/lib/satellites/types.check.ts`
- Modify: `package.json:15` (`verify:config`)

**Interfaces:**
- Consumes: nothing.
- Produces: `SatelliteConfig`, `DEFAULT_SATELLITES` — unchanged shape, both already exported.

- [ ] **Step 1: Write the failing check**

Create `src/lib/satellites/types.check.ts`:

```ts
/**
 * Assertions for the frozen satellite defaults.
 * Run: npm run verify:config
 *
 * Mirrors resolveIgnition.check.ts. This repo has no test runner; this follows
 * the existing `seed:verify` idiom of a plain tsx script that throws.
 */
import { DEFAULT_SATELLITES } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_SATELLITES
const HEX = /^#[0-9a-fA-F]{6}$/

check('defaults are frozen', Object.isFrozen(d))

// Orbit band must be ordered, or seed() spreads satellites backwards.
check('radius band ordered', d.SAT_RADIUS_MIN <= d.SAT_RADIUS_MAX)
check('radius band positive', d.SAT_RADIUS_MIN > 0)

// Dust seeds across innerR..outerR; an inverted span puts particles inside
// the orbit floor. The engine floors outerR, but the defaults should not
// depend on that rescue.
check('outer radius positive', d.OUTER_RADIUS > 0)
check('mobile outer radius positive', d.MOBILE_OUTER_RADIUS > 0)
check('inner radius positive', d.INNER_RADIUS > 0)
check('mobile inner radius positive', d.MOBILE_INNER_RADIUS > 0)

// Fractions that the engine multiplies alphas by.
for (const [k, v] of [
  ['SAT_ALPHA', d.SAT_ALPHA],
  ['DUST_ALPHA', d.DUST_ALPHA],
  ['SAT_SHADE', d.SAT_SHADE],
  ['SAT_STREAK', d.SAT_STREAK],
  ['DUST_STREAK', d.DUST_STREAK],
] as const) {
  check(`${k} within 0..1`, v >= 0 && v <= 1)
}

check('trail within 0..50', d.TRAIL >= 0 && d.TRAIL <= 50)
check('orbit direction is +/-1', d.ORBIT_DIR === 1 || d.ORBIT_DIR === -1)
check('label mode is known', ['hover', 'always', 'none'].includes(d.LABEL_MODE))

check('base colour is hex', HEX.test(d.SAT_COLOR))
check('every satellite colour is hex', d.SAT_COLORS.every((c) => HEX.test(c)))
check('label colour is hex', HEX.test(d.LABEL_COLOR))
check('dust colour is hex', HEX.test(d.DUST_COLOR))

// The owner's approved values, pinned. If a future edit drifts these, it
// should be a deliberate act with the owner in the loop, not a silent diff.
check('approved orbit band', d.SAT_RADIUS_MIN === 0.5 && d.SAT_RADIUS_MAX === 0.8)
check('approved outer radius', d.OUTER_RADIUS === 1.6)
check('approved orbit speed', d.ORBIT_SPEED === 2.2)
check('approved counter-clockwise', d.ORBIT_DIR === -1)
check('approved labels always on', d.LABEL_MODE === 'always')
check('dust off', d.DUST_COUNT === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll satellite default checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it to confirm it passes against the current defaults**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/satellites/types.check.ts
```

Expected: all `ok`, exit 0. If any FAIL, the defaults drifted from the approved set — stop and report rather than editing the assertion to match.

- [ ] **Step 3: Register it in verify:config**

In `package.json`, append to the `verify:config` script:

```
 && node --import tsx src/lib/satellites/types.check.ts
```

- [ ] **Step 4: Drop the prototype framing from the two header comments**

In `src/lib/satellites/types.ts`, replace the file header block (the one beginning `PROTOTYPE — hero orbiting satellites`) with:

```ts
/**
 * Hero orbiting satellites — configuration.
 *
 * Sub-project 3 of the hero-effects upgrade.
 * Spec: docs/superpowers/specs/2026-08-26-hero-satellites-design.md
 *
 * Ported from _ASSETS/Web-components/Black Hole — Originkit.js with the central
 * sphere removed (the 3D logo is the centre). Two particle populations: DUST
 * (retained, defaulted off) and SATELLITES (shaded spheres, each carrying one
 * CMS word).
 */
```

In `src/lib/satellites/SatelliteEngine.ts`, change the first line of its header from `PROTOTYPE — see ./types.ts. Throwaway.` to `Hero orbiting satellites — simulation and rendering.` Leave the rest of that comment intact; it explains the canvas sandwich and is still correct.

- [ ] **Step 5: Verify and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

Expected: typecheck silent, 8 suites green.

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/satellites package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(satellites): promote config module, pin approved defaults in a check suite"
```

---

### Task 2: Extract label placement as a pure, testable module

The edge-fade and overlap-suppression rules currently live inside `SatelliteEngine.draw()`, tangled with canvas calls. Two bugs already hid there (stale cached widths, and a box height guessed from font size instead of measured line-height). Pull the geometry out so it can be asserted without a browser.

**Files:**
- Create: `src/lib/satellites/labels.ts`
- Create: `src/lib/satellites/labels.check.ts`
- Modify: `src/lib/satellites/SatelliteEngine.ts` (label section of `draw()`)
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: nothing.
- Produces: `EDGE_FADE_PX: number`, `type LabelCandidate`, `type LabelPlacement`, `placeLabels(candidates, viewW, viewH, edgeFadePx): LabelPlacement[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/satellites/labels.check.ts`:

```ts
/**
 * Assertions for pure satellite label placement.
 * Run: npm run verify:config
 */
import { placeLabels, EDGE_FADE_PX, type LabelCandidate } from './labels'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const W = 1000
const H = 600
const mk = (o: Partial<LabelCandidate> & { index: number }): LabelCandidate => ({
  x: 400,
  y: 300,
  w: 60,
  h: 16,
  z: 0,
  alpha: 1,
  ...o,
})
const byIndex = (out: ReturnType<typeof placeLabels>, i: number) =>
  out.find((p) => p.index === i)!.opacity

// A label well inside the frame is untouched.
{
  const out = placeLabels([mk({ index: 0 })], W, H, EDGE_FADE_PX)
  check('interior label keeps full opacity', byIndex(out, 0) === 1)
  check('one candidate -> one placement', out.length === 1)
}

// Every candidate comes back, so callers can drive the DOM without a lookup miss.
{
  const out = placeLabels(
    [mk({ index: 0 }), mk({ index: 1, y: 100 }), mk({ index: 2, y: 500 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('all candidates returned', out.length === 3)
  check('indices preserved', [0, 1, 2].every((i) => out.some((p) => p.index === i)))
}

// Edge fade: fully outside the fade band -> 0, partway in -> partial.
{
  const out = placeLabels([mk({ index: 0, x: -60 })], W, H, EDGE_FADE_PX)
  check('label past the left edge is hidden', byIndex(out, 0) === 0)
}
{
  const half = EDGE_FADE_PX / 2
  const out = placeLabels([mk({ index: 0, x: half })], W, H, EDGE_FADE_PX)
  const o = byIndex(out, 0)
  check('label inside the fade band is partial', o > 0 && o < 1)
}
{
  // Right edge uses the box's RIGHT side, not its left — a wide label must fade
  // before its tail is cut.
  const out = placeLabels([mk({ index: 0, x: W - 60 })], W, H, EDGE_FADE_PX)
  check('right edge accounts for label width', byIndex(out, 0) < 1)
}
{
  // Bottom edge uses the box's height, which is line-height and NOT the font
  // size. Guessing the shorter value was a real bug.
  const out = placeLabels([mk({ index: 0, y: H - 16 })], W, H, EDGE_FADE_PX)
  check('bottom edge accounts for label height', byIndex(out, 0) < 1)
}

// Overlap: nearer (lower z) wins, farther is dropped entirely.
{
  const out = placeLabels(
    [mk({ index: 0, x: 400, y: 300, z: 10 }), mk({ index: 1, x: 410, y: 302, z: -10 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('nearer label survives a collision', byIndex(out, 1) === 1)
  check('farther label is dropped', byIndex(out, 0) === 0)
}

// Touching but not overlapping is not a collision.
{
  const out = placeLabels(
    [mk({ index: 0, x: 400, y: 300 }), mk({ index: 1, x: 460, y: 300 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('adjacent non-overlapping labels both survive', byIndex(out, 0) === 1 && byIndex(out, 1) === 1)
}

// A label already faded to nothing must not reserve space and block a visible one.
{
  const out = placeLabels(
    [mk({ index: 0, x: -400, y: 300, z: -50 }), mk({ index: 1, x: 400, y: 300, z: 0 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('an invisible label does not block a visible one', byIndex(out, 1) === 1)
}

// Zero-size boxes must not silently defeat suppression — that was a real bug
// when satellites inherited labelW 0 on re-seed.
{
  const out = placeLabels(
    [mk({ index: 0, w: 0, h: 0, z: 5 }), mk({ index: 1, w: 0, h: 0, z: -5 })],
    W,
    H,
    EDGE_FADE_PX,
  )
  check('zero-size boxes do not crash placement', out.length === 2)
}

// Incoming alpha is respected, not overwritten.
{
  const out = placeLabels([mk({ index: 0, alpha: 0.4 })], W, H, EDGE_FADE_PX)
  check('incoming alpha is carried through', Math.abs(byIndex(out, 0) - 0.4) < 1e-9)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll label placement checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/satellites/labels.check.ts
```

Expected: FAIL — `Cannot find module './labels'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/satellites/labels.ts`:

```ts
/**
 * Where each satellite's word may be drawn.
 *
 * Pure geometry, deliberately free of DOM and canvas, because two bugs already
 * hid in this logic when it lived inside the render loop: satellites inherited a
 * cached label width of 0 on re-seed (a zero-width box never collides, silently
 * defeating suppression), and the box height was assumed to equal the font size
 * when it is really the element's line-height, ~1.35x larger, which let labels
 * one line apart pass the overlap test while visibly colliding.
 */

/** Distance from a frame edge over which a label fades out entirely. */
export const EDGE_FADE_PX = 48

export type LabelCandidate = {
  index: number
  /** Label box, in container pixels. */
  x: number
  y: number
  w: number
  h: number
  /** Depth; lower is nearer the viewer. */
  z: number
  /** Opacity before placement rules are applied. */
  alpha: number
}

export type LabelPlacement = { index: number; opacity: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Applies two rules, in order:
 *
 * 1. Fade out over the last `edgeFadePx` before any frame edge. A sphere
 *    leaving frame reads as depth; half a word reads as a rendering bug.
 * 2. Nearest-first collision suppression. When two words overlap the one in
 *    front keeps its label — physically right, and it is the difference between
 *    a readable hero and an unreadable pile. Without it, twelve always-on labels
 *    average 5.9 overlapping pairs on a 390px frame.
 *
 * Every candidate is returned, so a caller driving DOM nodes never has to
 * handle a missing entry.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  viewW: number,
  viewH: number,
  edgeFadePx: number = EDGE_FADE_PX,
): LabelPlacement[] {
  const out: LabelPlacement[] = []
  const taken: { l: number; r: number; t: number; b: number }[] = []
  const fade = Math.max(1, edgeFadePx)

  // Nearest first. Sorting a copy keeps the caller's array order intact.
  const order = [...candidates].sort((a, b) => a.z - b.z)

  for (const c of order) {
    let opacity = clamp01(c.alpha)

    const room = Math.min(
      c.x - fade,
      viewW - (c.x + c.w) - fade,
      c.y - fade,
      viewH - (c.y + c.h) - fade,
    )
    if (room < 0) opacity *= clamp01(1 + room / fade)

    // An already-invisible label must not reserve space and hide a visible one.
    if (opacity > 0.05) {
      const box = { l: c.x, r: c.x + c.w, t: c.y, b: c.y + c.h }
      const hit = taken.some((o) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b)
      if (hit) opacity = 0
      else taken.push(box)
    }

    out.push({ index: c.index, opacity })
  }

  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/satellites/labels.check.ts
```

Expected: all `ok`, exit 0.

- [ ] **Step 5: Rewire the engine to use it**

In `src/lib/satellites/SatelliteEngine.ts`:

1. Add to the imports at the top:

```ts
import { placeLabels, EDGE_FADE_PX, type LabelCandidate } from './labels'
```

2. Delete the local `const EDGE_FADE_PX = 48` declaration and its comment (it now lives in `labels.ts`).

3. Replace the whole `// ── labels ──` block inside `draw()` — from the `const order = [...placed].sort(...)` line through the end of that `for` loop — with:

```ts
    // ── labels ──
    const candidates: LabelCandidate[] = []
    for (const { i, q, alpha } of placed) {
      const s = this.sats[i]
      if (!s.el) continue
      let a =
        c.LABEL_MODE === 'always' ? alpha : c.LABEL_MODE === 'hover' && i === nearest ? alpha : 0
      // A satellite on the far side, currently behind the mark, should not have
      // its word floating over the logo's face.
      if (
        q.z >= 0 &&
        Math.abs(q.x - this.cx) < this.W * 0.09 &&
        Math.abs(q.y - this.cy) < this.H * 0.16
      ) {
        a *= 0.15
      }
      candidates.push({
        index: i,
        x: q.x + c.LABEL_OFFSET,
        y: q.y - c.LABEL_SIZE / 2,
        w: s.labelW,
        h: s.labelH,
        z: q.z,
        alpha: a,
      })
    }

    for (const p of placeLabels(candidates, this.W, this.H, EDGE_FADE_PX)) {
      const s = this.sats[p.index]
      if (!s.el) continue
      const cand = candidates.find((k) => k.index === p.index)!
      s.el.style.opacity = p.opacity.toFixed(3)
      s.el.style.transform = `translate3d(${cand.x.toFixed(1)}px, ${cand.y.toFixed(1)}px, 0)`
    }
```

- [ ] **Step 6: Register the check and verify nothing regressed on screen**

Append to `verify:config` in `package.json`:

```
 && node --import tsx src/lib/satellites/labels.check.ts
```

Then start the dev server and re-run the on-screen measurement. Copy `check-onscreen.mjs` from the session scratchpad if it is still there; otherwise recreate it per Task 9.

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

Expected: typecheck silent, 9 suites green, and the browser measurement still reporting **0 clipped labels and 0 overlapping pairs at 1600×900, 2560×1080 and 390×844**. If overlaps reappear, the engine is passing `w`/`h` of 0 — check that `styleLabels()` still runs at the end of `seed()`.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/satellites package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "refactor(satellites): extract label placement as a pure tested module"
```

---

### Task 3: Add the CMS fields

**Files:**
- Modify: `src/globals/HeroEffects.ts` (append to `fields`)

**Interfaces:**
- Consumes: nothing.
- Produces: `hero-effects` gains `satellitesEnabled`, groups `satelliteField` / `satelliteMotion` / `satelliteLook` / `satelliteLabels` / `satelliteHold` / `satelliteBehaviour`, and array `satelliteColors` with row shape `{ color: string }`. Task 4 maps exactly these names.

**Note on ranges:** these are the bench slider ranges, with one deliberate widening. `outerRadius` goes to **3**, not the bench's 1.6, because the owner's approved value sat *exactly* on that ceiling and may have been constrained by it — the same trap that left the ignition's `wireSpeed` pinned at its CMS max of 6 across three sessions. Task 7 widens the bench slider to match.

- [ ] **Step 1: Append the fields**

In `src/globals/HeroEffects.ts`, add these entries to the end of the `fields` array (after the last existing group, before the closing `],`):

```ts
    {
      name: 'satellitesEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Coloured spheres orbiting the logo, each carrying one of the hero words. Turning this off removes them entirely — the hero keeps the logo, the video and the headline.',
      },
    },
    {
      name: 'satelliteField',
      type: 'group',
      label: 'Satellites — field',
      admin: { description: 'Where the belt sits relative to the mark' },
      fields: [
        {
          name: 'innerRadius',
          type: 'number',
          defaultValue: 3,
          min: 0.4,
          max: 6,
          admin: { description: 'Orbit floor, as a multiple of the logo’s on-screen half-height' },
        },
        {
          name: 'outerRadius',
          type: 'number',
          defaultValue: 1.6,
          min: 0.2,
          max: 3,
          admin: {
            description:
              'Reference radius, as a fraction of half the viewport’s smaller side. Satellites orbit inside a band of this — see “band inner/outer” below.',
          },
        },
        { name: 'mobileInnerRadius', type: 'number', defaultValue: 1.5, min: 0.4, max: 6 },
        {
          name: 'mobileOuterRadius',
          type: 'number',
          defaultValue: 0.78,
          min: 0.2,
          max: 3,
          admin: {
            description:
              'Used below 640px. The desktop value leaves only about half the belt on a portrait screen.',
          },
        },
        {
          name: 'tilt',
          type: 'number',
          defaultValue: 20,
          min: 0,
          max: 90,
          admin: { description: 'Inclination in degrees. 0 is edge-on, 90 is face-on.' },
        },
        { name: 'tiltSideway', type: 'number', defaultValue: 160, min: 0, max: 360 },
        {
          name: 'perspective',
          type: 'number',
          defaultValue: 1300,
          min: 300,
          max: 4000,
          admin: { description: 'Lower is a stronger perspective' },
        },
      ],
    },
    {
      name: 'satelliteMotion',
      type: 'group',
      label: 'Satellites — motion',
      fields: [
        { name: 'orbitSpeed', type: 'number', defaultValue: 2.2, min: 0, max: 20 },
        {
          name: 'orbitCcw',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Counter-clockwise on screen. Off runs them clockwise.' },
        },
        { name: 'speedScale', type: 'number', defaultValue: 0.8, min: 0.1, max: 3 },
        {
          name: 'trail',
          type: 'number',
          defaultValue: 42,
          min: 0,
          max: 50,
          admin: { description: '0 leaves no trail, 50 is the longest streak' },
        },
      ],
    },
    {
      name: 'satelliteLook',
      type: 'group',
      label: 'Satellites — look',
      fields: [
        { name: 'size', type: 'number', defaultValue: 4, min: 1, max: 40 },
        { name: 'alpha', type: 'number', defaultValue: 0.95, min: 0.05, max: 1 },
        {
          name: 'shade',
          type: 'number',
          defaultValue: 1,
          min: 0,
          max: 1,
          admin: { description: '0 is a flat disc, 1 is a fully modelled sphere' },
        },
        {
          name: 'depthScale',
          type: 'number',
          defaultValue: 0.9,
          min: 0,
          max: 2,
          admin: { description: 'Extra near/far size difference beyond the perspective divide' },
        },
        { name: 'streak', type: 'number', defaultValue: 1, min: 0, max: 1 },
        {
          name: 'ring',
          type: 'number',
          defaultValue: 1.1,
          min: 0,
          max: 6,
          admin: { description: 'Outline radius as a multiple of the sphere. 0 removes it.' },
        },
        {
          name: 'bandInner',
          type: 'number',
          defaultValue: 0.5,
          min: 0.1,
          max: 1.4,
          admin: { description: 'Innermost satellite orbit, as a fraction of the outer radius' },
        },
        { name: 'bandOuter', type: 'number', defaultValue: 0.8, min: 0.1, max: 1.4 },
        {
          name: 'tiltSpread',
          type: 'number',
          defaultValue: 15,
          min: 0,
          max: 120,
          admin: { description: 'Per-satellite inclination variation, in degrees. 0 is one shared plane.' },
        },
        {
          name: 'baseColor',
          type: 'text',
          defaultValue: '#8E1114',
          validate: hexColour,
          admin: { description: 'Used for any satellite the colour list below does not cover' },
        },
      ],
    },
    {
      name: 'satelliteColors',
      type: 'array',
      label: 'Satellites — colours, in orbit order',
      admin: {
        description:
          'Colour belongs to the ORBIT SLOT, not to the word: the first row colours the first satellite regardless of which word it carries, and regardless of language. Reordering the hero words does NOT reorder these. Extra rows are ignored; satellites past the last row use the base colour above.',
      },
      fields: [{ name: 'color', type: 'text', required: true, validate: hexColour }],
    },
    {
      name: 'satelliteLabels',
      type: 'group',
      label: 'Satellites — words',
      admin: {
        description:
          'The words themselves are the hero block’s “floating words” on the Home page, and the number of satellites follows that list.',
      },
      fields: [
        {
          name: 'mode',
          type: 'select',
          defaultValue: 'always',
          options: [
            { label: 'Always visible', value: 'always' },
            { label: 'On hover (nearest)', value: 'hover' },
            { label: 'Hidden', value: 'none' },
          ],
        },
        { name: 'size', type: 'number', defaultValue: 12, min: 8, max: 32 },
        { name: 'color', type: 'text', defaultValue: '#2B2A27', validate: hexColour },
        { name: 'offset', type: 'number', defaultValue: 14, min: 0, max: 60 },
        { name: 'hoverRadius', type: 'number', defaultValue: 90, min: 20, max: 300 },
      ],
    },
    {
      name: 'satelliteHold',
      type: 'group',
      label: 'Satellites — press and hold',
      admin: {
        description:
          'What the satellites do while a visitor holds the logo. Shares the same gesture as the hold-to-separate effect above.',
      },
      fields: [
        {
          name: 'freeze',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Stop orbiting and tremble in place while the logo is held' },
        },
        { name: 'shakePx', type: 'number', defaultValue: 3, min: 0, max: 40 },
        { name: 'shakeSpeed', type: 'number', defaultValue: 1.1, min: 0.1, max: 4 },
      ],
    },
    {
      name: 'satelliteBehaviour',
      type: 'group',
      label: 'Satellites — behaviour',
      fields: [
        { name: 'entranceMs', type: 'number', defaultValue: 1600, min: 0, max: 5000 },
        {
          name: 'scrollFadeVh',
          type: 'number',
          defaultValue: 0.6,
          min: 0,
          max: 3,
          admin: { description: 'Screens of scrolling over which the field dissolves. 0 never fades.' },
        },
        {
          name: 'seed',
          type: 'number',
          defaultValue: 20260826,
          admin: { description: 'Changing this reshuffles the starting arrangement' },
        },
      ],
    },
```

- [ ] **Step 2: Push the schema and confirm the tables**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit
```

Then restart the dev server so Drizzle applies the schema.

⚠ **If the dev server hangs on an unanswerable "DATA LOSS" prompt**, a stale temp table from an interrupted push is blocking it. Back up the DB file first, then:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node -e "const d=require('better-sqlite3')(process.env.DATABASE_URI?.replace('file:','')||'./tampa-taruno.db');console.log(d.prepare(\"SELECT name FROM sqlite_master WHERE name LIKE '__new_%'\").all())"
```

Any hit is safe to drop **only after** diffing it against its non-`__new_` counterpart. This happened once before on this project.

- [ ] **Step 3: Regenerate Payload types**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run generate:types
```

- [ ] **Step 4: Confirm the fields exist over the API**

```bash
curl -s "http://localhost:3000/api/globals/hero-effects" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(Object.keys(j).filter(k=>k.startsWith('satellite')))})"
```

Expected: the satellite group names listed. `satellitesEnabled` may be absent until seeded — that is fine, Task 4's resolver falls back.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/globals/HeroEffects.ts src/payload-types.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): satellite appearance fields on the hero-effects global"
```

---

### Task 4: CMS ↔ engine resolver

**Files:**
- Create: `src/lib/satellites/resolveSatellites.ts`
- Create: `src/lib/satellites/resolveSatellites.check.ts`
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: `SatelliteConfig`, `DEFAULT_SATELLITES` from Task 1; field names from Task 3.
- Produces: `type HeroEffectsSatellitesInput`, `resolveSatellites(cms): SatelliteConfig`, `toSatellitesPayload(cfg): HeroEffectsSatellitesInput`. Tasks 5, 7 and 8 use all three.

- [ ] **Step 1: Write the failing test**

Create `src/lib/satellites/resolveSatellites.check.ts`:

```ts
/**
 * Assertions for the pure CMS <-> engine config mapping for satellites.
 * Run: npm run verify:config
 *
 * Mirrors resolveIgnition.check.ts.
 */
import { DEFAULT_SATELLITES, type SatelliteConfig } from './types'
import { resolveSatellites, toSatellitesPayload } from './resolveSatellites'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// null / undefined / empty -> pure defaults
for (const [label, input] of [
  ['null', null],
  ['undefined', undefined],
  ['empty object', {}],
] as const) {
  const r = resolveSatellites(input as never)
  check(`${label} -> default orbit speed`, r.ORBIT_SPEED === DEFAULT_SATELLITES.ORBIT_SPEED)
  check(`${label} -> default colours`, r.SAT_COLORS.length === DEFAULT_SATELLITES.SAT_COLORS.length)
  check(`${label} -> default label mode`, r.LABEL_MODE === DEFAULT_SATELLITES.LABEL_MODE)
}

// partial values override only what they set
const partial = resolveSatellites({ satelliteMotion: { orbitSpeed: 9 } })
check('partial override applies', partial.ORBIT_SPEED === 9)
check('partial leaves siblings default', partial.TRAIL === DEFAULT_SATELLITES.TRAIL)

// nulls from a never-saved field fall back rather than becoming 0
const nulled = resolveSatellites({ satelliteMotion: { orbitSpeed: null, trail: 12 } })
check('null falls back', nulled.ORBIT_SPEED === DEFAULT_SATELLITES.ORBIT_SPEED)
check('sibling still applies', nulled.TRAIL === 12)

// the checkbox maps to a signed multiplier, both ways
check('ccw true -> -1', resolveSatellites({ satelliteMotion: { orbitCcw: true } }).ORBIT_DIR === -1)
check('ccw false -> +1', resolveSatellites({ satelliteMotion: { orbitCcw: false } }).ORBIT_DIR === 1)

// the kill switch is honoured, and false is not mistaken for "unset"
check('enabled defaults true', resolveSatellites({}).SAT_ENABLED === DEFAULT_SATELLITES.SAT_ENABLED)
check('enabled false is respected', resolveSatellites({ satellitesEnabled: false }).SAT_ENABLED === false)

// band must come back ordered even if the REST API is written to directly
const swapped = resolveSatellites({ satelliteLook: { bandInner: 0.9, bandOuter: 0.3 } })
check('band is reordered, not inverted', swapped.SAT_RADIUS_MIN <= swapped.SAT_RADIUS_MAX)

// fractions are clamped
const wild = resolveSatellites({ satelliteLook: { alpha: 5, shade: -3, streak: 99 } })
check('alpha clamped to 1', wild.SAT_ALPHA === 1)
check('shade clamped to 0', wild.SAT_SHADE === 0)
check('streak clamped to 1', wild.SAT_STREAK === 1)

// colours: valid rows kept in order, invalid dropped, empty -> defaults
const cols = resolveSatellites({
  satelliteColors: [{ color: '#AABBCC' }, { color: 'nope' }, { color: '#123456' }],
})
check('valid colours kept in order', cols.SAT_COLORS[0] === '#AABBCC' && cols.SAT_COLORS[1] === '#123456')
check('invalid colour dropped', !cols.SAT_COLORS.includes('nope'))
check('empty colour list -> defaults', resolveSatellites({ satelliteColors: [] }).SAT_COLORS.length === DEFAULT_SATELLITES.SAT_COLORS.length)

// unknown label mode falls back rather than reaching the engine
check(
  'unknown label mode falls back',
  resolveSatellites({ satelliteLabels: { mode: 'sideways' as never } }).LABEL_MODE ===
    DEFAULT_SATELLITES.LABEL_MODE,
)

// Round trip. Every mapped field is perturbed to a NON-default value first —
// round-tripping the defaults against themselves is a near-tautology, which is
// exactly the weakness the 2026-08-09 review found in resolveSeparation.check.ts.
const perturbed: SatelliteConfig = {
  ...DEFAULT_SATELLITES,
  INNER_RADIUS: 2.25,
  OUTER_RADIUS: 1.15,
  MOBILE_INNER_RADIUS: 1.75,
  MOBILE_OUTER_RADIUS: 0.61,
  TILT: 37,
  TILT_SIDEWAY: 214,
  PERSPECTIVE: 1750,
  ORBIT_SPEED: 3.4,
  ORBIT_DIR: 1,
  TRAIL: 19,
  SAT_ENABLED: false,
  SAT_SIZE: 7.5,
  SAT_COLOR: '#123456',
  SAT_COLORS: ['#111111', '#222222', '#333333'],
  SAT_ALPHA: 0.42,
  SAT_RADIUS_MIN: 0.31,
  SAT_RADIUS_MAX: 0.94,
  SAT_TILT_SPREAD: 61,
  SAT_SPEED_SCALE: 1.7,
  SAT_RING: 3.3,
  SAT_SHADE: 0.24,
  SAT_STREAK: 0.66,
  SAT_DEPTH_SCALE: 1.45,
  LABEL_MODE: 'hover',
  LABEL_SIZE: 21,
  LABEL_COLOR: '#654321',
  LABEL_OFFSET: 33,
  LABEL_HOVER_RADIUS: 155,
  HOLD_FREEZE: false,
  HOLD_SHAKE_PX: 17,
  HOLD_SHAKE_SPEED: 2.6,
  ENTRANCE_MS: 2400,
  SCROLL_FADE_VH: 1.4,
  SEED: 999001,
}
const round = resolveSatellites(toSatellitesPayload(perturbed))
const MAPPED: (keyof SatelliteConfig)[] = [
  'INNER_RADIUS', 'OUTER_RADIUS', 'MOBILE_INNER_RADIUS', 'MOBILE_OUTER_RADIUS',
  'TILT', 'TILT_SIDEWAY', 'PERSPECTIVE', 'ORBIT_SPEED', 'ORBIT_DIR', 'TRAIL',
  'SAT_ENABLED', 'SAT_SIZE', 'SAT_COLOR', 'SAT_ALPHA', 'SAT_RADIUS_MIN',
  'SAT_RADIUS_MAX', 'SAT_TILT_SPREAD', 'SAT_SPEED_SCALE', 'SAT_RING', 'SAT_SHADE',
  'SAT_STREAK', 'SAT_DEPTH_SCALE', 'LABEL_MODE', 'LABEL_SIZE', 'LABEL_COLOR',
  'LABEL_OFFSET', 'LABEL_HOVER_RADIUS', 'HOLD_FREEZE', 'HOLD_SHAKE_PX',
  'HOLD_SHAKE_SPEED', 'ENTRANCE_MS', 'SCROLL_FADE_VH', 'SEED',
]
for (const k of MAPPED) {
  check(`round trip preserves ${k}`, round[k] === perturbed[k])
  check(`${k} was actually perturbed`, round[k] !== DEFAULT_SATELLITES[k])
}
check('round trip preserves colour list', round.SAT_COLORS.join() === perturbed.SAT_COLORS.join())

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll satellite resolver checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/satellites/resolveSatellites.check.ts
```

Expected: FAIL — `Cannot find module './resolveSatellites'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/satellites/resolveSatellites.ts`:

```ts
import { DEFAULT_SATELLITES, type LabelMode, type SatelliteConfig } from './types'

/**
 * Satellites' slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 */
export type HeroEffectsSatellitesInput = {
  satellitesEnabled?: boolean | null
  satelliteField?: {
    innerRadius?: number | null
    outerRadius?: number | null
    mobileInnerRadius?: number | null
    mobileOuterRadius?: number | null
    tilt?: number | null
    tiltSideway?: number | null
    perspective?: number | null
  } | null
  satelliteMotion?: {
    orbitSpeed?: number | null
    orbitCcw?: boolean | null
    speedScale?: number | null
    trail?: number | null
  } | null
  satelliteLook?: {
    size?: number | null
    alpha?: number | null
    shade?: number | null
    depthScale?: number | null
    streak?: number | null
    ring?: number | null
    bandInner?: number | null
    bandOuter?: number | null
    tiltSpread?: number | null
    baseColor?: string | null
  } | null
  satelliteColors?: ({ color?: string | null } | null)[] | null
  satelliteLabels?: {
    mode?: LabelMode | null
    size?: number | null
    color?: string | null
    offset?: number | null
    hoverRadius?: number | null
  } | null
  satelliteHold?: {
    freeze?: boolean | null
    shakePx?: number | null
    shakeSpeed?: number | null
  } | null
  satelliteBehaviour?: {
    entranceMs?: number | null
    scrollFadeVh?: number | null
    seed?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const bool = (v: boolean | null | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback

const hex = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v : fallback

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

const LABEL_MODES: LabelMode[] = ['hover', 'always', 'none']

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveSatellites(
  cms: HeroEffectsSatellitesInput | null | undefined,
): SatelliteConfig {
  const d = DEFAULT_SATELLITES
  const f = cms?.satelliteField ?? {}
  const m = cms?.satelliteMotion ?? {}
  const k = cms?.satelliteLook ?? {}
  const l = cms?.satelliteLabels ?? {}
  const h = cms?.satelliteHold ?? {}
  const b = cms?.satelliteBehaviour ?? {}

  // The band must come back ordered: seed() spreads satellites from min to max,
  // and an inverted pair would place them backwards. Payload's min/max guards
  // the admin UI, but the REST API can be written to directly.
  const rawInner = num(k.bandInner, d.SAT_RADIUS_MIN)
  const rawOuter = num(k.bandOuter, d.SAT_RADIUS_MAX)
  const bandInner = Math.min(rawInner, rawOuter)
  const bandOuter = Math.max(rawInner, rawOuter)

  // Only rows that are really a hex colour survive; an empty or entirely
  // invalid list falls back rather than leaving every satellite on the base
  // colour, which would look like the feature had broken.
  const colors = (cms?.satelliteColors ?? [])
    .map((row) => row?.color)
    .filter((c): c is string => typeof c === 'string' && HEX.test(c))

  const mode = l.mode && LABEL_MODES.includes(l.mode) ? l.mode : d.LABEL_MODE

  return {
    ...d,
    INNER_RADIUS: num(f.innerRadius, d.INNER_RADIUS),
    OUTER_RADIUS: num(f.outerRadius, d.OUTER_RADIUS),
    MOBILE_INNER_RADIUS: num(f.mobileInnerRadius, d.MOBILE_INNER_RADIUS),
    MOBILE_OUTER_RADIUS: num(f.mobileOuterRadius, d.MOBILE_OUTER_RADIUS),
    TILT: num(f.tilt, d.TILT),
    TILT_SIDEWAY: num(f.tiltSideway, d.TILT_SIDEWAY),
    PERSPECTIVE: num(f.perspective, d.PERSPECTIVE),

    ORBIT_SPEED: num(m.orbitSpeed, d.ORBIT_SPEED),
    ORBIT_DIR: bool(m.orbitCcw, d.ORBIT_DIR < 0) ? -1 : 1,
    SAT_SPEED_SCALE: num(m.speedScale, d.SAT_SPEED_SCALE),
    TRAIL: num(m.trail, d.TRAIL),

    SAT_ENABLED: bool(cms?.satellitesEnabled, d.SAT_ENABLED),
    SAT_SIZE: num(k.size, d.SAT_SIZE),
    SAT_ALPHA: clamp01(num(k.alpha, d.SAT_ALPHA)),
    SAT_SHADE: clamp01(num(k.shade, d.SAT_SHADE)),
    SAT_DEPTH_SCALE: num(k.depthScale, d.SAT_DEPTH_SCALE),
    SAT_STREAK: clamp01(num(k.streak, d.SAT_STREAK)),
    SAT_RING: num(k.ring, d.SAT_RING),
    SAT_RADIUS_MIN: bandInner,
    SAT_RADIUS_MAX: bandOuter,
    SAT_TILT_SPREAD: num(k.tiltSpread, d.SAT_TILT_SPREAD),
    SAT_COLOR: hex(k.baseColor, d.SAT_COLOR),
    SAT_COLORS: colors.length ? colors : [...d.SAT_COLORS],

    LABEL_MODE: mode,
    LABEL_SIZE: num(l.size, d.LABEL_SIZE),
    LABEL_COLOR: hex(l.color, d.LABEL_COLOR),
    LABEL_OFFSET: num(l.offset, d.LABEL_OFFSET),
    LABEL_HOVER_RADIUS: num(l.hoverRadius, d.LABEL_HOVER_RADIUS),

    HOLD_FREEZE: bool(h.freeze, d.HOLD_FREEZE),
    HOLD_SHAKE_PX: num(h.shakePx, d.HOLD_SHAKE_PX),
    HOLD_SHAKE_SPEED: num(h.shakeSpeed, d.HOLD_SHAKE_SPEED),

    ENTRANCE_MS: num(b.entranceMs, d.ENTRANCE_MS),
    SCROLL_FADE_VH: num(b.scrollFadeVh, d.SCROLL_FADE_VH),
    SEED: num(b.seed, d.SEED),
  }
}

/** Inverse of resolveSatellites, for the dev bench's save-to-CMS button. */
export function toSatellitesPayload(c: SatelliteConfig): HeroEffectsSatellitesInput {
  return {
    satellitesEnabled: c.SAT_ENABLED,
    satelliteField: {
      innerRadius: c.INNER_RADIUS,
      outerRadius: c.OUTER_RADIUS,
      mobileInnerRadius: c.MOBILE_INNER_RADIUS,
      mobileOuterRadius: c.MOBILE_OUTER_RADIUS,
      tilt: c.TILT,
      tiltSideway: c.TILT_SIDEWAY,
      perspective: c.PERSPECTIVE,
    },
    satelliteMotion: {
      orbitSpeed: c.ORBIT_SPEED,
      orbitCcw: c.ORBIT_DIR < 0,
      speedScale: c.SAT_SPEED_SCALE,
      trail: c.TRAIL,
    },
    satelliteLook: {
      size: c.SAT_SIZE,
      alpha: c.SAT_ALPHA,
      shade: c.SAT_SHADE,
      depthScale: c.SAT_DEPTH_SCALE,
      streak: c.SAT_STREAK,
      ring: c.SAT_RING,
      bandInner: c.SAT_RADIUS_MIN,
      bandOuter: c.SAT_RADIUS_MAX,
      tiltSpread: c.SAT_TILT_SPREAD,
      baseColor: c.SAT_COLOR,
    },
    satelliteColors: c.SAT_COLORS.map((color) => ({ color })),
    satelliteLabels: {
      mode: c.LABEL_MODE,
      size: c.LABEL_SIZE,
      color: c.LABEL_COLOR,
      offset: c.LABEL_OFFSET,
      hoverRadius: c.LABEL_HOVER_RADIUS,
    },
    satelliteHold: {
      freeze: c.HOLD_FREEZE,
      shakePx: c.HOLD_SHAKE_PX,
      shakeSpeed: c.HOLD_SHAKE_SPEED,
    },
    satelliteBehaviour: {
      entranceMs: c.ENTRANCE_MS,
      scrollFadeVh: c.SCROLL_FADE_VH,
      seed: c.SEED,
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/satellites/resolveSatellites.check.ts
```

Expected: all `ok`, exit 0.

- [ ] **Step 5: Register and commit**

Append to `verify:config` in `package.json`:

```
 && node --import tsx src/lib/satellites/resolveSatellites.check.ts
```

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/satellites package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(satellites): CMS resolver with round-trip coverage"
```

---

### Task 5: Wire CMS values through to the hero

Removes the prototype's `?satellites=` query switch. After this task the satellites are on the real homepage for everyone, fed by the CMS.

**Files:**
- Modify: `src/seed/index.ts` (hero-effects block, around line 66)
- Modify: `src/components/blocks/RenderBlocks.tsx:28-45`
- Modify: `src/components/blocks/HeroBlock.tsx`
- Modify: `src/components/hero/SatelliteField.tsx`

**Interfaces:**
- Consumes: `resolveSatellites` from Task 4.
- Produces: `HeroBlock` gains a required `satellites: SatelliteConfig` prop. `SatelliteField`'s `config` becomes required.

- [ ] **Step 1: Seed the approved values**

In `src/seed/index.ts`, inside the `payload.updateGlobal({ slug: 'hero-effects', data: { ... } })` call, add alongside the existing groups:

```ts
      satellitesEnabled: true,
      satelliteField: {
        innerRadius: 3,
        outerRadius: 1.6,
        mobileInnerRadius: 1.5,
        mobileOuterRadius: 0.78,
        tilt: 20,
        tiltSideway: 160,
        perspective: 1300,
      },
      satelliteMotion: { orbitSpeed: 2.2, orbitCcw: true, speedScale: 0.8, trail: 42 },
      satelliteLook: {
        size: 4,
        alpha: 0.95,
        shade: 1,
        depthScale: 0.9,
        streak: 1,
        ring: 1.1,
        bandInner: 0.5,
        bandOuter: 0.8,
        tiltSpread: 15,
        baseColor: '#8E1114',
      },
      satelliteColors: [
        '#000000', '#ffd500', '#f96d3e', '#23e126', '#0f8a75', '#04b1b4', '#13118d',
        '#2B2A27', '#b04803', '#145c0a', '#118d1f', '#b400cc', '#bd0000',
      ].map((color) => ({ color })),
      satelliteLabels: { mode: 'always', size: 12, color: '#2B2A27', offset: 14, hoverRadius: 90 },
      satelliteHold: { freeze: true, shakePx: 3, shakeSpeed: 1.1 },
      satelliteBehaviour: { entranceMs: 1600, scrollFadeVh: 0.6, seed: 20260826 },
```

- [ ] **Step 2: Make `config` required on the field component**

In `src/components/hero/SatelliteField.tsx`, change the signature so the config must be passed. A dropped prop must fail loudly rather than silently reverting to frozen defaults — this is the exact hardening the 2026-08-09 review applied to `HeroBlock`'s `separation` prop.

Replace:

```tsx
  config = DEFAULT_SATELLITES,
```

with:

```tsx
  config,
```

and in the prop types replace `config?: SatelliteConfig` with:

```tsx
  /** Required, not optional: a dropped prop must fail loudly rather than
   *  silently reverting the field to frozen defaults. */
  config: SatelliteConfig
```

Then remove `DEFAULT_SATELLITES` from the import on line 5, leaving `import { type SatelliteConfig } from '../../lib/satellites/types'`.

- [ ] **Step 3: Thread it through RenderBlocks**

In `src/components/blocks/RenderBlocks.tsx`, add to the imports:

```tsx
import { resolveSatellites } from '../../lib/satellites/resolveSatellites'
```

and in the `case 'hero':` branch add a prop beside the existing two:

```tsx
                  satellites={resolveSatellites(effects)}
```

- [ ] **Step 4: Accept it in HeroBlock and delete the prototype switch**

In `src/components/blocks/HeroBlock.tsx`:

1. Add to the imports:

```tsx
import type { SatelliteConfig } from '../../lib/satellites/types'
```

2. In the `Props` type, add beside `separation` and `ignition`:

```tsx
  satellites: SatelliteConfig
```

3. Add `satellites,` to the destructured parameter list.

4. **Delete** the entire prototype block — the `satMode` state and the `useEffect` that reads `window.location.search`, including its comment.

5. Replace the conditional render with an unconditional one:

```tsx
      <SatelliteField
        words={floatingWords}
        config={satellites}
        active={stageLive}
        chargeRef={chargeRef}
      />
```

6. Leave `ConstellationField` exactly as it is for now — Task 10 removes it, after the owner has seen this live.

- [ ] **Step 5: Reseed and clear the cache**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run seed && rm -rf .next/cache
```

⚠ The `rm -rf .next/cache` is not optional. `getPage`/`getHeroEffects` use `unstable_cache`, which persists to disk and survives a dev-server restart, and a seed script's `revalidateTag` is a documented no-op outside a request context. Skipping this serves stale hero data and looks like the wiring failed.

- [ ] **Step 6: Verify the CMS value actually reaches the screen**

Restart the dev server, then prove the value is being read rather than defaulted — change one field to something unmistakable and confirm it takes effect:

```bash
curl -s -X POST "http://localhost:3000/api/globals/hero-effects" -H "Content-Type: application/json" -d '{"satelliteLook":{"size":18}}' > /dev/null
rm -rf "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT/.next/cache"
```

Reload `http://localhost:3000/en` in headless Chrome and confirm the satellites are visibly larger, then put it back:

```bash
curl -s -X POST "http://localhost:3000/api/globals/hero-effects" -H "Content-Type: application/json" -d '{"satelliteLook":{"size":4}}' > /dev/null
rm -rf "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT/.next/cache"
```

Partial global updates MERGE rather than nulling sibling groups — confirmed by direct test on 2026-08-09 — so posting one slice is safe.

- [ ] **Step 7: Full gates and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/id
```

Expected: typecheck silent, 10 suites green, 200 on both locales.

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/seed src/components
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(hero): satellites read from the CMS on the real homepage"
```

---

### Task 6: Prove the kill switch actually kills

Its own task because this exact bug class shipped **twice** on this project: a switch that gated only a lead time, and a switch that gated only a parameter path, each leaving the effect running in a state worse than the switch promised to restore. Reasoning about the code is not sufficient evidence.

**Files:**
- Modify: `src/components/blocks/HeroBlock.tsx`
- Create: `docs/superpowers/verification/satellites-kill-switch.mjs`

**Interfaces:**
- Consumes: `SatelliteConfig.SAT_ENABLED` from Task 4.
- Produces: nothing new.

- [ ] **Step 1: Gate the component, not just its parameters**

`SatelliteField` currently has an `enabled` prop that returns `null`, but nothing passes it. Wire it from the resolved config in `src/components/blocks/HeroBlock.tsx`:

```tsx
      <SatelliteField
        words={floatingWords}
        config={satellites}
        active={stageLive}
        chargeRef={chargeRef}
        enabled={satellites.SAT_ENABLED}
      />
```

`SatelliteField`'s mount effect already early-returns on `!enabled` and the component returns `null`, so no engine is constructed, no rAF loop starts and no canvas is created. Read that file and confirm both paths before moving on.

- [ ] **Step 2: Write the verification script**

Create `docs/superpowers/verification/satellites-kill-switch.mjs`:

```js
// The satellites kill switch must remove the field, not merely neutralise it.
//
// Two prior sub-projects shipped a switch that gated only a parameter while the
// effect kept running — once leaving a solid logo popping over a still-playing
// video, which is worse than the plain crossfade the field promised to restore.
// So this asserts the CANVASES ARE ABSENT, not that they are blank.
//
// Run with the dev server up:
//   node docs/superpowers/verification/satellites-kill-switch.mjs

import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const API = 'http://localhost:3000/api/globals/hero-effects'
const PAGE = 'http://localhost:3000/en'

const setEnabled = async (v) => {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ satellitesEnabled: v }),
  })
  if (!r.ok) throw new Error(`POST failed: ${r.status}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

const probe = async (label) => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.setViewport({ width: 1600, height: 900 })
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ])
  await page.goto(PAGE, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 15000))
  const state = await page.evaluate(() => ({
    canvases: document.querySelectorAll('[data-satellites]').length,
    labels: document.querySelectorAll('[data-satellites="labels"] > div').length,
    logo: !!document.querySelector('canvas[role="img"]'),
  }))
  await page.screenshot({ path: `docs/superpowers/verification/killswitch-${label}.png` })
  await page.close()
  return { label, ...state, errors }
}

let failures = 0
const check = (label, cond) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

await setEnabled(false)
const off = await probe('off')
check('OFF: no satellite canvases in the DOM at all', off.canvases === 0)
check('OFF: no label nodes', off.labels === 0)
check('OFF: the 3D logo still renders', off.logo === true)
check('OFF: no console errors', off.errors.length === 0)

await setEnabled(true)
const on = await probe('on')
check('ON: both canvases plus the label host are present', on.canvases === 3)
check('ON: labels exist', on.labels > 0)
check('ON: the 3D logo still renders', on.logo === true)
check('ON: no console errors', on.errors.length === 0)

await browser.close()
console.log(failures ? `\n${failures} check(s) failed.` : '\nKill switch verified in both polarities.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 3: Run it, clearing the cache between polarities**

The script POSTs to the API, so the disk cache must be cleared or the page will serve the previous value.

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && rm -rf .next/cache && node docs/superpowers/verification/satellites-kill-switch.mjs
```

Expected: all 8 `ok`. If the OFF probe still finds canvases, the switch is gating parameters rather than the component — go back to Step 1 rather than relaxing the assertion.

If OFF passes only because the cache was stale, you will see it: the ON probe will also report 0 canvases. Re-run with `rm -rf .next/cache` between probes if the values look pinned.

- [ ] **Step 4: Restore the switch and commit**

```bash
curl -s -X POST "http://localhost:3000/api/globals/hero-effects" -H "Content-Type: application/json" -d '{"satellitesEnabled":true}' > /dev/null
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && rm -rf .next/cache && npx tsc --noEmit
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/components docs/superpowers/verification
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(hero): satellites kill switch removes the field, verified both polarities"
```

---

### Task 7: Bench saves to the CMS

Replaces the prototype's localStorage persistence with a real write, matching the shatter bench.

**Files:**
- Modify: `src/app/(frontend)/[locale]/dev/satellites/SatelliteLab.tsx`
- Modify: `src/app/(frontend)/[locale]/dev/satellites/page.tsx`

**Interfaces:**
- Consumes: `resolveSatellites`, `toSatellitesPayload` from Task 4.
- Produces: nothing new.

- [ ] **Step 1: Seed the bench from the live global**

In `page.tsx`, pass the resolved config down instead of letting the lab start from frozen defaults:

```tsx
import { resolveSatellites } from '@/lib/satellites/resolveSatellites'
```

and add to the `<SatelliteLab ... />` props:

```tsx
      initialConfig={resolveSatellites(effects)}
```

- [ ] **Step 2: Accept it and replace the save handler**

In `SatelliteLab.tsx`:

1. Add `initialConfig: SatelliteConfig` to the component's props type and destructure it.

2. Change the state initialiser from `useState<SatelliteConfig>({ ...DEFAULT_SATELLITES })` to:

```tsx
  const [cfg, setCfg] = useState<SatelliteConfig>(initialConfig)
```

3. Add the import:

```tsx
import { toSatellitesPayload } from '@/lib/satellites/resolveSatellites'
```

4. Replace the `save` callback body with a real POST. The admin session cookie rides along, exactly as the shatter bench does:

```tsx
  const save = useCallback(async () => {
    setStatus('saving…')
    try {
      const res = await fetch('/api/globals/hero-effects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(toSatellitesPayload(cfg)),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setSavedAt(Date.now())
      setDirty(false)
      setStatus('saved to CMS — reload the homepage to see it live')
    } catch (err) {
      console.error('bench: save failed', err)
      setStatus('save failed — are you logged in at /admin?')
    }
  }, [cfg])
```

5. Delete `loadSaved`, the `STORE_KEY` constant, the `Saved` type, the localStorage restore effect and `clearSaved`'s `localStorage.removeItem` line. Keep the `reset` button, but have it reset to `initialConfig` rather than clearing storage:

```tsx
  const clearSaved = useCallback(() => {
    setCfg(initialConfig)
    setWordText((initialWords.length ? initialWords : FALLBACK_WORDS).join('\n'))
    setDirty(false)
  }, [initialConfig, initialWords])
```

6. Change the status line under the buttons from `'saves to this browser, not the CMS'` to `'saves to the Hero Effects global'`.

- [ ] **Step 3: Widen the outer-radius slider to match the CMS**

The approved value sat exactly on the old ceiling. In the `GROUPS` array, change the `OUTER_RADIUS` row's `max` from `1.6` to `3`, and `MOBILE_OUTER_RADIUS`'s to `3` if present. Every other slider range already matches Task 3's field ranges — verify each one rather than assuming.

- [ ] **Step 4: Verify the round trip through a real save**

With the dev server up and logged in at `/admin`:

1. Open `http://localhost:3000/en/dev/satellites`
2. Change `Orbit speed` to a distinctive value, e.g. 5.5
3. Click **save**, confirm the status says saved
4. Confirm it landed:

```bash
curl -s "http://localhost:3000/api/globals/hero-effects" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).satelliteMotion))"
```

Expected: `orbitSpeed: 5.5`.

5. Put it back to 2.2 through the bench and save again, then:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && rm -rf .next/cache
```

- [ ] **Step 5: Commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add "src/app/(frontend)/[locale]/dev/satellites"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(dev): satellites bench saves to the CMS"
```

---

### Task 8: Satellites in the admin live preview

The hero live preview shipped in PR #2 mounts the real `HeroBlock`. It now needs the satellites config, or the preview will diverge from the homepage.

**Files:**
- Modify: `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx`
- Modify: `src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx`

**Interfaces:**
- Consumes: `resolveSatellites` from Task 4.
- Produces: nothing new.

- [ ] **Step 1: Pass the saved config in**

In `page.tsx`, add the import:

```tsx
import { resolveSatellites } from '@/lib/satellites/resolveSatellites'
```

and add to `<HeroPreview ... />`:

```tsx
        savedSatellites={resolveSatellites(effects)}
```

- [ ] **Step 2: Accept and forward it**

In `HeroPreview.tsx`:

1. Add to the imports:

```tsx
import {
  resolveSatellites,
  type HeroEffectsSatellitesInput,
} from '@/lib/satellites/resolveSatellites'
import type { SatelliteConfig } from '@/lib/satellites/types'
```

2. Add to the props type, beside `savedIgnition: IgnitionConfig`:

```tsx
  savedSatellites: SatelliteConfig
```

3. Beside the existing `let ignition = props.savedIgnition` (around line 74), add:

```tsx
  let satellites = props.savedSatellites
```

4. Inside the existing `if (hasLiveEffects) { ... }` block, add a third line beside the two already there:

```tsx
    satellites = resolveSatellites(data as HeroEffectsSatellitesInput)
```

⚠ Do **not** add `'satellitesEnabled' in data` to the `hasLiveEffects` guard. That guard deliberately tests for a key only a real `hero-effects` payload carries, and it already covers this case — `timing` is present in every such payload. Adding more keys widens the false-positive surface the comment above it warns about.

5. Add the prop to the `<HeroBlock ... />` call, beside `ignition={ignition}`:

```tsx
        satellites={satellites}
```

- [ ] **Step 3: Verify the preview updates without saving**

1. Open `/admin` → Hero Effects, with the live preview pane visible
2. Change **Satellites — look → size**
3. Confirm the preview's satellites resize **before** you click Save

⚠ Live-preview updates round-trip through a real endpoint; they are not merged locally. For the globals case the request targets the global's own endpoint, so this works without a document id — but if nothing updates, check the browser network tab for a request to `/api/globals/hero-effects` before assuming the wiring is wrong.

⚠ The in-app browser pane cannot verify this either: Payload's admin uses `RenderIfInViewport`, whose IntersectionObserver the pane starves the same way it starves rAF. Symptom is an empty `.render-fields` div with no errors. Use real Chrome or headless.

- [ ] **Step 4: Build check and commit**

A new or changed preview route must survive a real production build — `useSearchParams` in this route already failed `next build` once while `next dev` compiled it happily.

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run build
```

Expected: build completes with no `missing-suspense-with-csr-bailout`.

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add "src/app/(frontend)/[locale]/admin-preview"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): satellites in the hero live preview"
```

---

### Task 9: Promote the verification harness

The prototype's scripts live in a session scratchpad that will be cleared. Move them into the repo beside the ignition harness, as that directory's README already argues for.

**Files:**
- Create: `docs/superpowers/verification/satellites-capture.mjs`
- Create: `docs/superpowers/verification/satellites-orbit-hold.mjs`
- Create: `docs/superpowers/verification/satellites-onscreen.mjs`
- Create: `docs/superpowers/verification/satellites-degradation.mjs`
- Modify: `docs/superpowers/verification/README.md`

**Interfaces:**
- Consumes: `window.__ttSatellites()` published by `SatelliteEngine`'s constructor, returning `{ cx, cy, charge, sats: {x,y}[] }`.
- Produces: nothing importable.

- [ ] **Step 1: Copy the four scripts in**

Copy from the session scratchpad if still present, renaming with the `satellites-` prefix. If the scratchpad was cleared, recreate them from the descriptions in spec §10 — each is short, and their assertions are listed there. The four are:

| Script | Asserts |
|---|---|
| `satellites-capture.mjs` | fps via real `performance.now()` deltas; per-canvas ink; ink changes between frames; label count; zero console errors |
| `satellites-orbit-hold.mjs` | orbit direction from the sign of the cross product about the centre; hold freezes travel and starts a shake, driven by the real charge |
| `satellites-onscreen.mjs` | on-screen fraction, clipped labels and overlapping label pairs at 1600×900, 2560×1080 and 390×844 |
| `satellites-degradation.mjs` | reduced motion byte-stable AND non-trivially inked; mobile animating |

- [ ] **Step 2: Harden the reduced-motion assertion**

`satellites-degradation.mjs` must assert **both** that the field is byte-stable and that its ink is non-trivial. Byte-stability alone passes happily on a blank canvas — which is exactly how a real defect stayed invisible until ink was measured. Add:

```js
const MIN_STATIC_INK = 500 // a near-empty static field is a defect, not a pass
check('reduced motion is byte-stable', a.back === b.back && a.front === b.front)
check('reduced motion still renders something', a.back + a.front > MIN_STATIC_INK)
```

- [ ] **Step 3: Run all four against the dev server**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"
node docs/superpowers/verification/satellites-capture.mjs
node docs/superpowers/verification/satellites-orbit-hold.mjs
node docs/superpowers/verification/satellites-onscreen.mjs
node docs/superpowers/verification/satellites-degradation.mjs
```

Expected, matching the prototype's measured baseline:

- fps ≥ 50 under software rasterisation, zero console errors
- direction counter-clockwise; charge reaches 1.0 while held; mean travel drops from ~145 px to ~8 px
- 99–100% of satellites on screen, 0 clipped labels, 0 overlapping pairs at all three viewports
- reduced motion byte-stable with ink well above 500; mobile animating

- [ ] **Step 4: Document them and commit**

Add a Satellites section to `docs/superpowers/verification/README.md` listing the four scripts, and repeat the standing warning that the in-app browser pane cannot verify this class of effect.

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(satellites): promote the verification harness into the repo"
```

---

### Task 10: Retire ConstellationField — owner gate

**⚠ STOP. Do not start this task without the owner confirming they have seen the satellites live on the real homepage and want the constellation gone.** The spec stages this deliberately: ship behind the switch, let the owner look, then delete. Deleting early destroys the fallback while it is still the thing that might be wanted back.

**Files:**
- Delete: `src/components/hero/ConstellationField.tsx`
- Modify: `src/components/blocks/HeroBlock.tsx`
- Modify: `src/blocks/index.ts` (only if the owner also wants `constellationEnabled` gone)
- Modify: `src/lib/three/calibration.ts` (nothing — already shared)

**Interfaces:**
- Consumes: nothing.
- Produces: `HeroBlock` no longer renders `ConstellationField`.

- [ ] **Step 1: Confirm the exclusion zones are genuinely unused**

`ConstellationField` reads `data-constellation-avoid` attributes to keep words off the headline and header. The satellites ignore them entirely. At the approved radii the belt clears the headline — but that is a property of the current numbers, not a guarantee.

Before deleting, measure it. Add a temporary check to `satellites-onscreen.mjs` that counts label boxes intersecting the headline's box:

```js
const collisions = await page.evaluate(() => {
  const head = document.querySelector('.hero-text1')
  if (!head) return -1
  const h = head.getBoundingClientRect()
  return [...document.querySelectorAll('[data-satellites="labels"] > div')]
    .filter((el) => parseFloat(el.style.opacity || '0') > 0.25)
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.left < h.right && h.left < r.right && r.top < h.bottom && h.top < r.bottom
    }).length
})
```

Run it during the first 7 seconds, while the headline is still on screen.

- If collisions are 0 across several samples, record that in the spec and proceed.
- If they are not 0, **stop and report to the owner**. Porting avoidance is a design decision, not a cleanup.

- [ ] **Step 2: Remove the render and the import**

In `src/components/blocks/HeroBlock.tsx`, delete the `<ConstellationField ... />` element and its `import` line. Leave the `constellationEnabled` prop in place for now — removing a CMS field is a separate, owner-approved change.

- [ ] **Step 3: Delete the component**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" rm src/components/hero/ConstellationField.tsx
```

This also closes spec §4's note that `ConstellationField` duplicates the logo-box
calculation inline rather than using the shared `logoScreenBox()` helper — the duplicate
goes with the file. **If the owner defers this task indefinitely, that duplication stays,
and a change to the cover-scale maths would then need making in two places.** Worth
switching it to the helper at that point rather than leaving it.

- [ ] **Step 4: Full gates**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config && npm run build
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/id
node docs/superpowers/verification/satellites-capture.mjs
node docs/superpowers/verification/satellites-degradation.mjs
```

Expected: typecheck silent, 10 suites green, build clean, 200 on both locales, harness green.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add -A
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "refactor(hero): retire ConstellationField, superseded by the satellites"
```

---

## After the plan

1. **Whole-branch review before merge.** Both prior sub-projects had a production-reachable bug survive every task-level check and get caught only by a review of the complete branch. Budget for it.
2. **Re-verify the gates on `main` after merging**, not only on the branch — the established discipline on this project.
3. **Update `_HANDOFF/HANDOFF.md`.** Sub-project 3 has been "not started" through several sessions and this closes it. Record that the orbs design is superseded, and that the prototype-first order is what made the difference.
4. **Two things the owner has never weighed in on**, both flagged repeatedly and still open: the ignition's `wireSpeed` sitting on its CMS max of 6, and the ignition ramp colours whose crest still reads gold rather than red. They have been flagged three times across three sessions without an answer. Ask directly rather than flagging a fourth time.
