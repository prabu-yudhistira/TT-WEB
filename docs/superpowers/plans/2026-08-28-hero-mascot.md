# Hero Orbiting Mascot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the owner-tuned mascot prototype into the shipping hero — CMS-editable, test-covered, mounted on the real homepage behind a kill switch.

**Architecture:** The mascot is a single hard-coded 3D object on its own WebGL layer (one `<canvas>` whose `z-index` flips as it crosses the mark), orbiting the satellites' belt. It is positioned by the *same* `projectOrbit()` the satellites use — extracted to `src/lib/satellites/project.ts` in the prototype — so it cannot desync from the belt. A pure config flows CMS → `resolveMascot` → `HeroBlock` → `MascotLayer` → `MascotEngine`. `LogoEngine` and `SatelliteEngine` are not modified in behaviour; the mascot reads the logo's separation charge through the same getter the satellites use.

**Tech Stack:** Next.js 15 (App Router) · Payload CMS 3 · SQLite (dev) · TypeScript · three.js 0.185 (`GLTFLoader` + `DRACOLoader` + `RoomEnvironment`) · `tsx` check scripts (this repo has no test runner) · `puppeteer-core` for browser verification · `@gltf-transform` / `meshoptimizer` / `draco3dgltf` (dev-only, asset pipeline).

**Spec:** [`docs/superpowers/specs/2026-08-28-hero-mascot-design.md`](../specs/2026-08-28-hero-mascot-design.md)

**Starting point:** branch `feat/hero-mascot` at `e413e8c`. The prototype (`504cc31`) already works and is owner-approved; this plan makes it shippable. Read the spec before starting — it records *why* several non-obvious choices are the way they are (the orthographic camera, `HEIGHT` being load-bearing, additive blending being an informed choice, per-layer sorting).

## Global Constraints

- **Work on `feat/hero-mascot`.** Do not commit to `main`. Do not push without the owner asking.
- **Git in this repo needs** `-c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"` on every command (Windows "dubious ownership"). Identity is already set per-repo (`prabu-yudhistira` / `tampataruno@gmail.com`).
- **This repo has no test runner.** Tests are plain `tsx` scripts that throw, chained in `package.json`'s `verify:config`. Follow `src/lib/satellites/types.check.ts` exactly — `let failures = 0`, a `check(label: string, cond: boolean)` helper that `console.error`s `FAIL ${label}` and increments, `console.log`s `ok ${label}` otherwise, then `console.log(failures ? \`\\n${failures} check(s) failed.\` : '\\nAll … checks passed.')` and `process.exit(failures ? 1 : 0)` at the end.
- **The in-app browser pane CANNOT verify this effect.** It reports the tab hidden, throttling `requestAnimationFrame` to ~1 Hz, which stalls the engine's own clock. Use headless Chrome via `puppeteer-core` at `C:/Program Files/Google/Chrome/Application/chrome.exe` launched with `--enable-unsafe-swiftshader --use-gl=angle --hide-scrollbars`. Treat fps figures as a floor, not real-device performance.
- **Every browser check that measures motion must first** `await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])` — the owner's own machine had OS animations off in August and the whole hero correctly switched itself off. **Reduced-motion checks** set `value: 'reduce'` instead.
- **CMS ranges must be strictly wider than the approved value** (spec §5.3). This project shipped an owner-approved value sitting exactly on its own CMS ceiling once (`wireSpeed`, flagged across three sessions). And **the bench must not be able to produce a value the CMS rejects** — a bench that can is worse than no bench.
- **`HEIGHT` must stay positive** (spec §5.1). It biases the mascot's depth toward the viewer, which is the only reason it never sorts wrongly against a satellite bead despite orbiting inside the bead band. The CMS `height` field's `min` must be `> 0` (use `20`).
- **Not localized.** Mascot appearance is numbers and hex; identical EN/ID. `mascotLabelText` is a string but is **also not localized** (spec §9.3) — `SAMSARA` is presented identically in both languages, like the `line1`/`line2` Javanese mottos.
- **The mascot shares the satellites' orbital plane.** `TILT`, `TILT_SIDEWAY`, `PERSPECTIVE`, `ORBIT_DIR`, and the base `ORBIT_SPEED` are read from `resolveSatellites`, never duplicated onto the mascot group. `SPEED_SCALE` multiplies the satellites' `ORBIT_SPEED`.
- **Approved config values are frozen in `DEFAULT_MASCOT`** (`src/lib/mascot/types.ts`). Do not change them. They were tuned live and signed off 2026-08-28.
- **Standing gates before every commit that touches app code:** `npx tsc --noEmit` clean AND `npm run verify:config` green. Both must be shown passing in the step output, not assumed.
- **Writing to `hero-effects` over REST requires auth.** `access: { read: () => true }` opens reads only; an unauthenticated `POST` returns **403**. For writes, log in first:

  ```bash
  TT_TOKEN=$(curl -s -X POST "http://localhost:3000/api/users/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@tampa-taruno.local","password":"tampataruno-2026"}' \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
  ```

  Then add `-H "Authorization: JWT $TT_TOKEN"` to every write. Those are the seeded local dev credentials, already in `_HANDOFF/HANDOFF.md`, not production secrets. The dev bench is unaffected — it runs in the browser and rides the admin session cookie via `credentials: 'same-origin'`.
- **⚠️ Never run `npm run build` while `npm run dev` is up** — it corrupts `.next` for the running server (hit three times on hero-effects work; symptom `SyntaxError … after JSON at position N` out of `loadManifest`, or `__webpack_modules__[moduleId] is not a function`). Sequence: stop dev → `rm -rf .next` → `npm run build` → `rm -rf .next` → start dev clean.
- **Scratchpad for throwaway files:** `C:/Users/YUDHIS~1/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/<session>/scratchpad`. Verification scripts that ship go in `docs/superpowers/verification/`.
- **Payload dev server auto-pushes the SQLite schema** (drizzle, `push` defaults on in dev). After adding fields, restart dev and watch for a `DATA LOSS` prompt (means a non-nullable column — all mascot fields must be nullable/have defaults so this never appears) and for stale temp tables: `sqlite3 tampa-taruno.db "SELECT name FROM sqlite_master WHERE name LIKE '__new_%'"` — any hit is only safe to drop after diffing it against its non-`__new_` counterpart, and after a DB backup.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/mascot/types.ts` | `MascotConfig` + frozen `DEFAULT_MASCOT`. Modify: header comment only — values are frozen. |
| `src/lib/mascot/types.check.ts` | **New.** Defaults frozen, internally consistent, every value strictly inside its CMS range, `HEIGHT > 0`, approved numbers pinned. |
| `src/lib/mascot/mascotTrail.ts` | **New.** Pure gold-dust particle bookkeeping — emit, age, fade, ring-buffer, frame-stall clamp. Extracted from `MascotEngine` so it can be tested without a GL context. |
| `src/lib/mascot/mascotTrail.check.ts` | **New.** Emission rate honours fractional carry; stall clamp caps at 40; fade curve; dead motes reported as alpha 0; ring buffer wraps without gaps. |
| `src/lib/mascot/MascotEngine.ts` | Scene, ortho camera, orbit, spin, label, dust. Modify: consume `mascotTrail.ts`; drop prototype framing from the header. |
| `src/lib/mascot/resolveMascot.ts` | **New.** CMS ↔ engine mapping, both directions (`resolveMascot` / `toMascotPayload`). |
| `src/lib/mascot/resolveMascot.check.ts` | **New.** Fallback for null/absent; clamping; round-trip that perturbs **every** mapped field. |
| `src/lib/satellites/project.ts` | Shared `projectOrbit` + `orbitGeometry`. No change — already extracted in the prototype. |
| `src/lib/satellites/project.check.ts` | **New.** Pins `projectOrbit` / `orbitGeometry` output against fixtures, so the extraction both engines now depend on cannot silently drift. |
| `src/lib/satellites/labels.ts` | `placeLabels` gained an optional `reserved: LabelBox[]`. No change — already in the prototype. |
| `src/lib/satellites/labels.check.ts` | Modify: add assertions for the `reserved` parameter. |
| `src/components/hero/MascotLayer.tsx` | React wrapper. Modify: drop prototype framing; `config` + `belt` stay required. |
| `src/components/hero/SatelliteField.tsx` | Modify: nothing new — `labelBoxRef` prop already added in the prototype. Verify it is wired. |
| `src/components/blocks/HeroBlock.tsx` | Modify: take required `mascot: MascotConfig` prop; create `labelBoxRef`; mount `<MascotLayer>` before `<LogoStage>`; pass `labelBoxRef` to both `SatelliteField` and `MascotLayer`. |
| `src/components/blocks/RenderBlocks.tsx` | Modify: `hero` case passes `mascot={resolveMascot(effects)}`. |
| `src/globals/HeroEffects.ts` | Modify: add `mascotEnabled` + the Mascot groups + `mascotLabelText`. |
| `src/seed/index.ts` | Modify: seed the approved mascot values; fix the stale 13-entry `satelliteColors` (drop `#000000`, now 12). |
| `src/app/(frontend)/[locale]/dev/mascot/MascotLab.tsx` | Modify: add a save-to-CMS button using `toMascotPayload`. |
| `src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx` | Modify: resolve + pass `mascot`, live-update it. |
| `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx` | Modify: pass `savedMascot={resolveMascot(effects)}`. |
| `scripts/build-mascot.mjs` | No change — in repo, reproduces `public/models/mascot.draco.glb` byte-for-byte. |
| `package.json` | Modify: register the four new `.check.ts` files in `verify:config`; add a `build:mascot` script alias. |
| `docs/superpowers/verification/mascot-*.mjs` | **New.** Promoted from the session scratchpad. |
| `docs/superpowers/verification/README.md` | Modify: add the mascot harness section. |

---

### Task 1: Config + shared-projection checks, out of prototype status

**Files:**
- Modify: `src/lib/mascot/types.ts` (header comment only — values frozen)
- Modify: `src/lib/mascot/MascotEngine.ts:11-15` (header comment only)
- Modify: `src/components/hero/MascotLayer.tsx:10-13` (header comment only)
- Create: `src/lib/mascot/types.check.ts`
- Create: `src/lib/satellites/project.check.ts`
- Modify: `package.json` (`verify:config` chain)

**Interfaces:**
- Consumes: `DEFAULT_MASCOT`, `MascotConfig` from `src/lib/mascot/types.ts` (already exported, shape unchanged); `projectOrbit`, `orbitGeometry`, `OrbitPlane`, `Projected`, `OrbitGeometry` from `src/lib/satellites/project.ts` (already exported).
- Produces: nothing new — this task only adds guards.

- [ ] **Step 1: Write `src/lib/mascot/types.check.ts`**

```ts
/**
 * Assertions for the frozen mascot defaults.
 * Run: npm run verify:config
 *
 * Mirrors src/lib/satellites/types.check.ts. This repo has no test runner;
 * this follows the existing `seed:verify` idiom of a plain tsx script that throws.
 */
import { DEFAULT_MASCOT } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const d = DEFAULT_MASCOT
const HEX = /^#[0-9a-fA-F]{6}$/

check('defaults are frozen', Object.isFrozen(d))

// HEIGHT is load-bearing: it biases depth toward the viewer so the mascot never
// sorts wrongly against a bead despite orbiting inside the bead band. Spec §5.1.
check('HEIGHT is positive', d.HEIGHT > 0)

// Fractions the engine multiplies alphas / sizes by.
for (const [k, v] of [
  ['OPACITY', d.OPACITY],
  ['TRAIL_GLOW', d.TRAIL_GLOW],
  ['TRAIL_OPACITY', d.TRAIL_OPACITY],
  ['TRAIL_TWINKLE', d.TRAIL_TWINKLE],
] as const) {
  check(`${k} within 0..1`, v >= 0 && v <= 1)
}

check('RADIUS positive', d.RADIUS > 0)
check('MOBILE_RADIUS positive', d.MOBILE_RADIUS > 0)
check('SIZE positive', d.SIZE > 0)
check('MOBILE_SIZE positive', d.MOBILE_SIZE > 0)
check('SPEED_SCALE non-negative', d.SPEED_SCALE >= 0)
check('TRAIL_SECONDS positive', d.TRAIL_SECONDS > 0)
check('TRAIL_DENSITY non-negative', d.TRAIL_DENSITY >= 0)

check('dust colour is hex', HEX.test(d.TRAIL_COLOR))
check('dust core colour is hex', HEX.test(d.TRAIL_CORE_COLOR))
check('label colour is hex', HEX.test(d.LABEL_COLOR))
check('label text is non-empty', typeof d.LABEL_TEXT === 'string' && d.LABEL_TEXT.trim().length > 0)

// Every value strictly INSIDE the CMS range it will be clamped to (Task 6
// defines the ranges; these bounds must match). A value on the boundary means
// the slider stopped where taste was still heading. Spec §5.3.
const inside = (label: string, v: number, lo: number, hi: number) =>
  check(`${label} strictly inside [${lo}, ${hi}]`, v > lo && v < hi)
inside('RADIUS', d.RADIUS, 0.3, 2.5)
inside('MOBILE_RADIUS', d.MOBILE_RADIUS, 0.3, 2.5)
inside('SPEED_SCALE', d.SPEED_SCALE, 0, 3)
inside('SIZE', d.SIZE, 20, 420)
inside('MOBILE_SIZE', d.MOBILE_SIZE, 16, 300)
inside('SPIN_SPEED', d.SPIN_SPEED, -180, 180)
inside('DEPTH_SCALE', d.DEPTH_SCALE, 0, 3)
inside('HEIGHT', d.HEIGHT, 20, 300)
inside('TRAIL_DENSITY', d.TRAIL_DENSITY, 0, 400)
inside('TRAIL_SECONDS', d.TRAIL_SECONDS, 0.05, 5)

// The owner's approved values, pinned. A future drift should be a deliberate
// act with the owner in the loop, not a silent diff.
check('approved RADIUS', d.RADIUS === 0.71)
check('approved HEIGHT', d.HEIGHT === 136)
check('approved SIZE', d.SIZE === 28)
check('approved SPIN_SPEED', d.SPIN_SPEED === 113)
check('approved SPEED_SCALE', d.SPEED_SCALE === 0.52)
check('approved DEPTH_SCALE (not the satellites 0.9)', d.DEPTH_SCALE === 0.3)
check('approved additive trail', d.TRAIL_ADDITIVE === true)
check('approved dust colour', d.TRAIL_COLOR === '#FDB721')
check('approved dust core colour', d.TRAIL_CORE_COLOR === '#FFFCD6')
check('approved label text', d.LABEL_TEXT === 'SAMSARA')
check('approved label halo off', d.LABEL_HALO === 0)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll mascot default checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Write `src/lib/satellites/project.check.ts`**

```ts
/**
 * Pins the shared orbital projection. BOTH SatelliteEngine and MascotEngine
 * now call projectOrbit()/orbitGeometry(); this makes the extraction from
 * SatelliteEngine's old inline math a change that cannot pass silently.
 * Run: npm run verify:config
 */
import { projectOrbit, orbitGeometry, type OrbitPlane } from './project'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

const plane: OrbitPlane = { TILT: 20, TILT_SIDEWAY: 160, PERSPECTIVE: 1300 }
const tiltRad = (plane.TILT * Math.PI) / 180

// angle 0: point is on +x of the orbit, z should be ~0 (at the plane crossing),
// scale should be ~1 (no perspective divide at zero depth).
{
  const p = projectOrbit(plane, 100, 100, 300, 0, 0, tiltRad)
  check('angle 0 -> z ~ 0', near(p.z, 0, 1e-9))
  check('angle 0 -> scale ~ 1', near(p.scale, 1, 1e-9))
}

// The sign of z must flip between the near and far halves of the orbit — this
// is what the mascot's canvas z-index and the satellites' back/front split key
// off. angle pi/2 vs 3pi/2.
{
  const near90 = projectOrbit(plane, 100, 100, 300, Math.PI / 2, 0, tiltRad)
  const far270 = projectOrbit(plane, 100, 100, 300, (3 * Math.PI) / 2, 0, tiltRad)
  check('z changes sign across the orbit', Math.sign(near90.z) === -Math.sign(far270.z))
  check('z is non-zero at the sides', Math.abs(near90.z) > 1)
}

// Deterministic fixture. Values computed by hand from the projection math for
// projectOrbit({TILT:20,TILT_SIDEWAY:160,PERSPECTIVE:1300}, cx640 cy400, r300,
// angle pi/3, height 12, tilt 20deg). If this ever fails, RE-DERIVE it — do not
// just paste the new output, that would defeat the lock.
{
  const p = projectOrbit(plane, 640, 400, 300, Math.PI / 3, 12, tiltRad)
  check('fixture x ~ 492.1', Math.abs(p.x - 492.1) < 0.5)
  check('fixture y ~ 363.9', Math.abs(p.y - 363.9) < 0.5)
  check('fixture z ~ 240.0', Math.abs(p.z - 240.0) < 0.5)
  check('fixture scale ~ 0.8441', Math.abs(p.scale - 0.8441) < 0.001)
}

// orbitGeometry: outerR is always strictly above innerR (an inverted span
// would seed particles inside the orbit floor).
{
  const cfg = {
    INNER_RADIUS: 3,
    OUTER_RADIUS: 1.6,
    MOBILE_INNER_RADIUS: 1.5,
    MOBILE_OUTER_RADIUS: 0.78,
  }
  const desktop = orbitGeometry(cfg, 1440, 900, { cx: 720, cy: 450, hh: 180 }, false)
  check('desktop outerR > innerR', desktop.outerR > desktop.innerR)
  check('desktop centre passed through', desktop.cx === 720 && desktop.cy === 450)
  const mobile = orbitGeometry(cfg, 390, 844, { cx: 195, cy: 300, hh: 90 }, true)
  check('mobile outerR > innerR', mobile.outerR > mobile.innerR)
  // A tall narrow window can make INNER_RADIUS 3 of a tall mark exceed a radius
  // measured off the short side — the floor must still hold.
  const tall = orbitGeometry(cfg, 400, 1600, { cx: 200, cy: 800, hh: 300 }, false)
  check('tall-window outerR > innerR', tall.outerR > tall.innerR)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll projection checks passed.')
process.exit(failures ? 1 : 0)
```

If the hand-computed fixture values above are off (arithmetic slip), the check will fail on first run. Confirm the real numbers once with `node --import tsx -e "import('./src/lib/satellites/project.ts').then(m=>{const p=(20*Math.PI)/180;console.log(m.projectOrbit({TILT:20,TILT_SIDEWAY:160,PERSPECTIVE:1300},640,400,300,Math.PI/3,12,p))})"`, correct the four expected values in place, and leave the "RE-DERIVE, don't paste" comment — a future failure means the projection math changed and must be reviewed, not rubber-stamped.

- [ ] **Step 3: Register both checks in `package.json`**

Append to the `verify:config` value, before the closing quote:

```
 && node --import tsx src/lib/mascot/types.check.ts && node --import tsx src/lib/satellites/project.check.ts
```

- [ ] **Step 4: Run the two new checks — expect PASS**

```bash
node --import tsx src/lib/mascot/types.check.ts && node --import tsx src/lib/satellites/project.check.ts
```

Expected: both end `All … checks passed.` and exit 0. If `types.check.ts` fails an `inside(...)` assertion, the CMS range in Task 6 must be widened, not the default changed.

- [ ] **Step 5: Drop prototype framing from the two remaining headers**

`src/lib/mascot/types.ts` header was already updated in `504cc31` (reads "owner-tuned … and signed off (2026-08-28)"). No change needed there.

`src/lib/mascot/MascotEngine.ts` lines 11-15 — replace:

```ts
/**
 * Hero orbiting mascot — simulation and rendering.
 *
 * ⚠️ PROTOTYPE. Throwaway, built to be tuned on screen and then rewritten
 * properly against an approved spec. Not TDD'd, not check-suited.
```

with:

```ts
/**
 * Hero orbiting mascot — simulation and rendering.
 *
 * Design: docs/superpowers/specs/2026-08-28-hero-mascot-design.md
 * Config: src/lib/mascot/types.ts (frozen DEFAULT_MASCOT). Pure particle
 * bookkeeping lives in ./mascotTrail.ts so it can be tested without a GL context.
```

`src/components/hero/MascotLayer.tsx` lines 10-13 — replace:

```ts
 * ⚠️ PROTOTYPE. Built to be tuned at /dev/mascot and then rewritten against an
 * approved spec.
 *
```

with a single blank continuation line (delete those three lines).

- [ ] **Step 6: Standing gates**

```bash
npx tsc --noEmit && npm run verify:config
```

Expected: `tsc` silent (exit 0); `verify:config` ends with the mascot and projection suites both green, `0 check(s) failed` overall.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/mascot/types.check.ts src/lib/satellites/project.check.ts src/lib/mascot/MascotEngine.ts src/components/hero/MascotLayer.tsx package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(mascot): pin frozen defaults and the shared orbit projection

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract the gold-dust trail as a pure, testable module

The prototype's trail logic lives inside `MascotEngine.emit()` / `updateTrail()`, tangled with GPU buffer writes. The particle bookkeeping — fractional emission carry, the 40-mote frame-stall clamp, the fade-in/fade-out curve, the ring-buffer cursor — is exactly the kind of silent-failure surface that hid two bugs in the satellites' label code. Pull it out.

**Files:**
- Create: `src/lib/mascot/mascotTrail.ts`
- Create: `src/lib/mascot/mascotTrail.check.ts`
- Modify: `src/lib/mascot/MascotEngine.ts` (`emit`, `updateTrail`, the `Mote` type, `emitDebt`/`moteNext`/`motes` fields)
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: `MascotConfig` from `./types`.
- Produces:
  - `type Mote = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; seed: number }`
  - `function makeMotePool(size: number): Mote[]` — all fields 0 (including `seed`)
  - `function moteFade(age: number): number` — pure fade curve: `age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88`, clamped ≥ 0
  - `class TrailState` with:
    - `constructor(pool: Mote[], rng: () => number = Math.random)` — the injectable `rng` is what makes the emission tests deterministic
    - `emit(cfg: MascotConfig, x: number, y: number, dtSec: number, alpha: number, elapsed: number): void` — sheds new motes; `alpha <= 0.001` or `!cfg.TRAIL_ENABLED` resets the fractional carry and emits nothing
    - `sample(cfg: MascotConfig, elapsed: number, alpha: number, dtSec?: number): { i: number; x: number; y: number; alpha: number; size: number }[]` — one entry per pool slot; dead slots have `alpha === 0`; advances live motes by `dtSec` (default 0)
  - The GPU write in `MascotEngine` becomes a thin loop over `sample()`'s return.

- [ ] **Step 1: Write `src/lib/mascot/mascotTrail.check.ts` (failing)**

```ts
/**
 * Assertions for the gold-dust particle bookkeeping. Pure — no GL context.
 * Run: npm run verify:config
 */
import { DEFAULT_MASCOT } from './types'
import { makeMotePool, moteFade, TrailState } from './mascotTrail'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const cfg = { ...DEFAULT_MASCOT }
// Deterministic RNG so emission counts and mote lifetimes are exact.
// 0.5 -> every random(0,1)=0.5, so life = TRAIL_SECONDS * (0.7 + 0.5*0.6) = 1.0x.
const half = () => 0.5

// ── fade curve (pure) ──
check('fade at age 0 is 0', moteFade(0) === 0)
check('fade peaks at the 12% mark', moteFade(0.12) === 1)
check('fade in: 6% is below 12%', moteFade(0.06) < moteFade(0.12))
check('fade out: 60% is below 12%', moteFade(0.6) < moteFade(0.12))
check('fade at age 0.99 is near zero', moteFade(0.99) < 0.02)
check('fade never negative past end of life', moteFade(1.2) <= 0)

// ── fractional emission carry ──
// DENSITY 130/s over a 1/60 s frame is 2.1667 motes. Frame 1 emits 2, carry
// 0.1667. Frame 2 adds 2.1667 -> 2.333 -> emits 2, carry 0.333. Two frames = 4.
{
  const t = new TrailState(makeMotePool(900), half)
  t.emit(cfg, 0, 0, 1 / 60, 1, 0)
  t.emit(cfg, 0, 0, 1 / 60, 1, 1 / 60)
  const alive = t.sample(cfg, 2 / 60, 1).filter((m) => m.alpha > 0).length
  check('two 1/60s frames emit exactly 4 motes', alive === 4)
}

// ── frame-stall clamp ──
{
  const t = new TrailState(makeMotePool(900), half)
  t.emit(cfg, 0, 0, 5, 1, 0) // 5s * 130/s = 650 motes wanted
  const alive = t.sample(cfg, 0, 1).filter((m) => m.alpha > 0).length
  check('stall clamp caps a huge dt at 40 motes', alive === 40)
}

// ── disabled / faded emits nothing, carry resets ──
{
  const t = new TrailState(makeMotePool(900), half)
  t.emit({ ...cfg, TRAIL_ENABLED: false }, 0, 0, 1 / 60, 1, 0)
  check('disabled trail emits nothing', t.sample(cfg, 0, 1).every((m) => m.alpha === 0))
  const t2 = new TrailState(makeMotePool(900), half)
  t2.emit(cfg, 0, 0, 0, 1, 0) // dtSec 0
  check('zero dt emits nothing', t2.sample(cfg, 0, 1).every((m) => m.alpha === 0))
  const t3 = new TrailState(makeMotePool(900), half)
  t3.emit(cfg, 0, 0, 1 / 60, 0, 0) // alpha 0
  check('zero global alpha emits nothing', t3.sample(cfg, 0, 1).every((m) => m.alpha === 0))
}

// ── a live mote reports position, fade, size; a dead slot reports alpha 0 ──
{
  const t = new TrailState(makeMotePool(4), half)
  t.emit({ ...cfg, TRAIL_DENSITY: 600, TRAIL_TWINKLE: 0 }, 100, 200, 1 / 60, 1, 0)
  // life = TRAIL_SECONDS(1.4) * (0.7 + 0.5*0.6) = 1.4. Sample at elapsed 0.7 -> age 0.5.
  const s = t.sample({ ...cfg, TRAIL_TWINKLE: 0 }, 0.7, 1)
  const live = s.filter((m) => m.alpha > 0)
  // density 600/s * (1/60)s = 10 wanted, pool holds 4 -> ring wraps, all 4 written
  check('every pool slot is live at mid-life', live.length === 4)
  check('live mote alpha = TRAIL_OPACITY * moteFade(0.5)', Math.abs(live[0].alpha - cfg.TRAIL_OPACITY * moteFade(0.5)) < 1e-9)
  // Past end of life every slot is dead.
  check('all dead after 2 lifetimes', t.sample(cfg, 3.0, 1).every((m) => m.alpha === 0))
}

// ── ring buffer wraps without gaps ──
{
  const pool = makeMotePool(20)
  const t = new TrailState(pool, half)
  for (let f = 0; f < 30; f++) t.emit({ ...cfg, TRAIL_DENSITY: 600 }, f, f, 1 / 60, 1, f / 60)
  check('ring buffer fills every slot', pool.every((m) => m.life > 0))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll trail checks passed.')
process.exit(failures ? 1 : 0)
```

Note: with the deterministic `half` RNG every mote gets identical `life` and `size`, which is fine for these structural checks. `moteFade` is exported specifically so the fade curve is tested as a pure function rather than inferred through `sample()`'s per-mote age arithmetic.

- [ ] **Step 2: Run it — expect FAIL (module missing)**

```bash
node --import tsx src/lib/mascot/mascotTrail.check.ts
```

Expected: `Cannot find module './mascotTrail'` or similar.

- [ ] **Step 3: Write `src/lib/mascot/mascotTrail.ts`**

Lift the logic verbatim from `MascotEngine`'s current `emit()` and `updateTrail()`, dropping only the GPU buffer writes (`this.dustPos[...]` etc.). Keep every comment — they explain the `gl_PointSize` trap and the vertex-stage cull, which still apply to the caller.

```ts
import type { MascotConfig } from './types'

/**
 * Gold-dust trail — pure particle bookkeeping, no GL context.
 *
 * Extracted from MascotEngine so the fractional emission carry, the frame-stall
 * clamp, the fade curve and the ring buffer can be tested directly — the same
 * discipline that caught two silent bugs in the satellites' label module.
 * MascotEngine's job shrinks to: call emit() with the mascot's real position,
 * then write sample()'s output into the Points geometry's attributes.
 *
 * The GPU side stays in MascotEngine and its comments there still apply — in
 * particular gl_PointSize is set to LITERAL pixels because the camera is
 * orthographic; do not convert it to the perspective idiom 300.0/-mv.z, that
 * assumes a far larger world scale (the trap that cost the ignition 5.9 fps).
 */

export type Mote = {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
  size: number
  seed: number
}

export function makeMotePool(size: number): Mote[] {
  const pool = new Array<Mote>(size)
  for (let i = 0; i < size; i++) {
    pool[i] = { x: 0, y: 0, vx: 0, vy: 0, born: 0, life: 0, size: 0, seed: 0 }
  }
  return pool
}

/**
 * Fade curve: in fast over the first 12% of life, out slowly over the rest. A
 * mote that pops in at full brightness reads as a glitch rather than as
 * something being shed. Exported so it can be tested without going through a
 * mote's per-particle age arithmetic.
 */
export function moteFade(age: number): number {
  const f = age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88
  return f > 0 ? f : 0
}

export class TrailState {
  private next = 0
  /** Fractional carry so a density that is not a multiple of the frame rate still emits evenly. */
  private debt = 0

  constructor(
    private pool: Mote[],
    /** Injectable for deterministic tests; MascotEngine passes the default. */
    private rng: () => number = Math.random,
  ) {}

  emit(cfg: MascotConfig, x: number, y: number, dtSec: number, alpha: number, elapsed: number): void {
    if (!cfg.TRAIL_ENABLED || alpha <= 0.001 || dtSec <= 0) {
      this.debt = 0
      return
    }
    this.debt += cfg.TRAIL_DENSITY * dtSec
    let n = Math.floor(this.debt)
    this.debt -= n
    // A stall (tab restored, slow frame) must not dump hundreds of motes at one
    // point — that reads as a blob, not a wake.
    if (n > 40) n = 40
    for (let i = 0; i < n; i++) {
      const m = this.pool[this.next]
      this.next = (this.next + 1) % this.pool.length
      const a = this.rng() * Math.PI * 2
      const rad = this.rng() * cfg.TRAIL_SPREAD
      m.x = x + Math.cos(a) * rad
      m.y = y + Math.sin(a) * rad
      const da = this.rng() * Math.PI * 2
      const sp = cfg.TRAIL_DRIFT * (0.35 + this.rng() * 0.65)
      m.vx = Math.cos(da) * sp
      m.vy = Math.sin(da) * sp
      m.born = elapsed
      m.life = cfg.TRAIL_SECONDS * (0.7 + this.rng() * 0.6)
      m.size = cfg.TRAIL_SIZE * (0.55 + this.rng() * 0.9)
      m.seed = this.rng()
    }
  }

  /** One entry per pool slot; dead slots have alpha 0. Advances live motes by dtSec (default 0). */
  sample(
    cfg: MascotConfig,
    elapsed: number,
    alpha: number,
    dtSec = 0,
  ): { i: number; x: number; y: number; alpha: number; size: number }[] {
    const out: { i: number; x: number; y: number; alpha: number; size: number }[] = []
    for (let i = 0; i < this.pool.length; i++) {
      const m = this.pool[i]
      const age = m.life > 0 ? (elapsed - m.born) / m.life : 2
      if (age >= 1 || age < 0) {
        out.push({ i, x: m.x, y: m.y, alpha: 0, size: 0 })
        continue
      }
      m.x += m.vx * dtSec
      m.y += m.vy * dtSec
      const twinkle = 1 - cfg.TRAIL_TWINKLE * 0.5 * (1 + Math.sin(elapsed * 9 + m.seed * 40))
      out.push({
        i,
        x: m.x,
        y: m.y,
        alpha: Math.max(0, cfg.TRAIL_OPACITY * moteFade(age) * twinkle * alpha),
        size: m.size * (1 - age * 0.45),
      })
    }
    return out
  }
}
```

- [ ] **Step 4: Run the check — expect PASS**

```bash
node --import tsx src/lib/mascot/mascotTrail.check.ts
```

Expected: `All trail checks passed.`

- [ ] **Step 5: Rewire `MascotEngine` to consume it**

In `src/lib/mascot/MascotEngine.ts`:

- Delete the local `type Mote = {...}`. Import `Mote`, `makeMotePool`, `TrailState` from `./mascotTrail`.
- Change `const MAX_MOTES = 900` to `const MAX_MOTES = 2600` with the comment: `// ceil(TRAIL_DENSITY max 400 * TRAIL_SECONDS max 5 * 1.3) — the CMS cannot ask for more live motes than the pool holds.`
- Replace the `motes`, `moteNext`, `emitDebt` fields with `private trail!: TrailState`.
- In `buildTrail()`, after allocating `dustPos`/`dustAlpha`/`dustSize` (bump those to `MAX_MOTES * n` too — they are already sized off `MAX_MOTES`, so this follows automatically), do `this.trail = new TrailState(makeMotePool(MAX_MOTES))`.
- Delete `emit()` entirely. Delete the body of `updateTrail()` and replace with:

```ts
private updateTrail(dtSec: number, alpha: number, emitX: number, emitY: number) {
  const c = this.cfg
  this.dustMat.uniforms.uColor.value.set(c.TRAIL_COLOR)
  this.dustMat.uniforms.uCore.value.set(c.TRAIL_CORE_COLOR)
  this.dustMat.uniforms.uGlow.value = c.TRAIL_GLOW
  const wantBlend = c.TRAIL_ADDITIVE ? THREE.AdditiveBlending : THREE.NormalBlending
  if (this.dustMat.blending !== wantBlend) {
    this.dustMat.blending = wantBlend
    this.dustMat.needsUpdate = true
  }

  this.trail.emit(c, emitX, emitY, dtSec, alpha, this.elapsed)
  for (const m of this.trail.sample(c, this.elapsed, alpha, dtSec)) {
    this.dustPos[m.i * 3] = m.x
    this.dustPos[m.i * 3 + 1] = m.y
    this.dustPos[m.i * 3 + 2] = -1
    this.dustAlpha[m.i] = m.alpha
    this.dustSize[m.i] = m.size * this.dpr
  }
  this.dustGeo.attributes.position.needsUpdate = true
  this.dustGeo.attributes.aAlpha.needsUpdate = true
  this.dustGeo.attributes.aSize.needsUpdate = true
}
```

- In `place()`, replace the two lines `this.emit(X, Y, dtSec, alpha)` / `this.updateTrail(dtSec, alpha)` with `this.updateTrail(dtSec, alpha, X, Y)`.
- `drawStatic()` calls `this.place(1, 0, 0)` — dtSec 0 means `emit` sheds nothing and `sample` advances nothing. Confirm that still holds (it does: `TrailState.emit` with `dtSec = 0` adds `0` to `debt`).

- [ ] **Step 6: Standing gates + browser smoke**

```bash
npx tsc --noEmit && npm run verify:config
```

Then, with `npm run dev` up, capture the trail to confirm the refactor is visually identical:

```bash
node <scratchpad>/mascot-capture.mjs "http://localhost:3000/en/dev/mascot" 6 800 trail-after-refactor
```

Expected: contact sheet shows the same granular gold wake as before; `console errors: 0`.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/mascot/mascotTrail.ts src/lib/mascot/mascotTrail.check.ts src/lib/mascot/MascotEngine.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "refactor(mascot): extract gold-dust bookkeeping to a pure module

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `reserved` label boxes — assertions

The prototype added an optional `reserved: LabelBox[]` parameter to `placeLabels` so the satellites yield label space to the mascot's word (cross-engine collision 13.3% → 0.8%). It has no test.

**Files:**
- Modify: `src/lib/satellites/labels.check.ts`

**Interfaces:**
- Consumes: `placeLabels(candidates, viewW, viewH, edgeFadePx?, reserved?)`, `type LabelBox = { l: number; r: number; t: number; b: number }`, `type LabelCandidate`, `EDGE_FADE_PX` from `src/lib/satellites/labels.ts` (all already exported).
- Produces: nothing.

- [ ] **Step 1: Read the current check file**

```bash
sed -n '1,40p' src/lib/satellites/labels.check.ts
```

Note the `check` helper name and how existing `placeLabels` calls are structured, so the new block matches.

- [ ] **Step 2: Append a `reserved`-parameter block**

Before the final `console.log(failures ? …)` line in `src/lib/satellites/labels.check.ts`, add:

```ts
// ── reserved boxes (the mascot's word, placed by a different engine) ──
{
  // One satellite label sitting exactly where the mascot's word is.
  const cand = [{ index: 0, x: 100, y: 100, w: 60, h: 16, z: 0, alpha: 1 }]
  const mascotBox = { l: 100, r: 160, t: 100, b: 116 }

  const withoutReserve = placeLabels(cand, 1000, 1000, EDGE_FADE_PX)
  check('no reserved: the satellite label shows', withoutReserve[0].opacity > 0.9)

  const withReserve = placeLabels(cand, 1000, 1000, EDGE_FADE_PX, [mascotBox])
  check('reserved box suppresses the overlapping satellite label', withReserve[0].opacity === 0)

  // A reserved box that does NOT overlap leaves the label alone.
  const farBox = { l: 500, r: 560, t: 500, b: 516 }
  const withFar = placeLabels(cand, 1000, 1000, EDGE_FADE_PX, [farBox])
  check('non-overlapping reserved box is harmless', withFar[0].opacity > 0.9)

  // Reserved wins regardless of z: even a satellite label that is NEARER the
  // viewer (more negative z) than the reserved box still yields.
  const nearCand = [{ index: 0, x: 100, y: 100, w: 60, h: 16, z: -999, alpha: 1 }]
  const nearYields = placeLabels(nearCand, 1000, 1000, EDGE_FADE_PX, [mascotBox])
  check('reserved wins even against a nearer satellite label', nearYields[0].opacity === 0)

  // Empty reserved array === omitting it.
  const a = placeLabels(cand, 1000, 1000, EDGE_FADE_PX)
  const b = placeLabels(cand, 1000, 1000, EDGE_FADE_PX, [])
  check('empty reserved matches omitting it', a[0].opacity === b[0].opacity)
}
```

- [ ] **Step 3: Run — expect PASS**

```bash
node --import tsx src/lib/satellites/labels.check.ts
```

Expected: `All label placement checks passed.` If "reserved wins even against a nearer satellite label" fails, `placeLabels` is sorting reserved boxes into the nearest-first pass instead of pre-seeding `taken` — check `labels.ts:52` reads `const taken: LabelBox[] = [...reserved]`.

- [ ] **Step 4: Standing gates + commit**

```bash
npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/satellites/labels.check.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(satellites): cover the reserved-label-box parameter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `resolveMascot` — CMS ↔ engine mapping

**Files:**
- Create: `src/lib/mascot/resolveMascot.ts`
- Create: `src/lib/mascot/resolveMascot.check.ts`
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: `DEFAULT_MASCOT`, `MascotConfig` from `./types`.
- Produces:
  - `type HeroEffectsMascotInput` — a hand-written partial/nullable shape of the `mascot*` fields on `hero-effects` (do NOT import from `payload-types`; it may be stale). Groups: `mascotOrbit`, `mascotLook`, `mascotSpin`, `mascotTrail`, `mascotLabel`, `mascotHold`, `mascotBehaviour`, plus scalars `mascotEnabled` and `mascotLabelText`.
  - `function resolveMascot(cms: HeroEffectsMascotInput | null | undefined): MascotConfig`
  - `function toMascotPayload(c: MascotConfig): HeroEffectsMascotInput`

- [ ] **Step 1: Write `src/lib/mascot/resolveMascot.check.ts` (failing)**

```ts
/**
 * Fallback / clamp / round-trip for the mascot resolver.
 * Run: npm run verify:config
 * Mirrors src/lib/satellites/resolveSatellites.check.ts.
 */
import { DEFAULT_MASCOT } from './types'
import { resolveMascot, toMascotPayload } from './resolveMascot'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// Nothing saved -> every field is the frozen default.
{
  const r = resolveMascot(null)
  const d = DEFAULT_MASCOT
  check('null cms -> defaults', JSON.stringify(r) === JSON.stringify(d))
  check('undefined cms -> defaults', JSON.stringify(resolveMascot(undefined)) === JSON.stringify(d))
  check('empty object -> defaults', JSON.stringify(resolveMascot({})) === JSON.stringify(d))
}

// A sibling group is respected while others fall back.
{
  const r = resolveMascot({ mascotSpin: { spinSpeed: 40 } })
  check('sibling applies', r.SPIN_SPEED === 40)
  check('untouched sibling falls back', r.RADIUS === DEFAULT_MASCOT.RADIUS)
}

// null inside a group falls back (Payload returns nulls for never-saved fields).
{
  const r = resolveMascot({ mascotOrbit: { radius: null, height: null } })
  check('null radius -> default', r.RADIUS === DEFAULT_MASCOT.RADIUS)
  check('null height -> default', r.HEIGHT === DEFAULT_MASCOT.HEIGHT)
}

// 0..1 fields are clamped.
{
  const r = resolveMascot({ mascotTrail: { opacity: 5, glow: -2 }, mascotLook: { opacity: 9 } })
  check('trail opacity clamped to 1', r.TRAIL_OPACITY === 1)
  check('trail glow clamped to 0', r.TRAIL_GLOW === 0)
  check('mascot opacity clamped to 1', r.OPACITY === 1)
}

// Invalid hex falls back rather than reaching the shader.
{
  const r = resolveMascot({ mascotTrail: { color: 'nope', coreColor: '#GGGGGG' } })
  check('bad dust colour -> default', r.TRAIL_COLOR === DEFAULT_MASCOT.TRAIL_COLOR)
  check('bad core colour -> default', r.TRAIL_CORE_COLOR === DEFAULT_MASCOT.TRAIL_CORE_COLOR)
}

// Empty / whitespace label text falls back to the default word, never renders blank.
{
  check('empty label text -> default', resolveMascot({ mascotLabelText: '' }).LABEL_TEXT === DEFAULT_MASCOT.LABEL_TEXT)
  check('blank label text -> default', resolveMascot({ mascotLabelText: '   ' }).LABEL_TEXT === DEFAULT_MASCOT.LABEL_TEXT)
  check('real label text passes through', resolveMascot({ mascotLabelText: 'KARMA' }).LABEL_TEXT === 'KARMA')
}

// Round trip: perturb EVERY mapped field to a non-default value, then
// resolve(toPayload(perturbed)) must equal perturbed. Round-tripping the
// defaults against themselves is a near-tautology — this catches a field the
// inverse forgot.
{
  const d = DEFAULT_MASCOT
  const perturbed: typeof d = {
    ...d,
    ENABLED: !d.ENABLED,
    RADIUS: d.RADIUS + 0.13,
    MOBILE_RADIUS: d.MOBILE_RADIUS + 0.11,
    HEIGHT: d.HEIGHT + 17,
    TILT_OFFSET: d.TILT_OFFSET + 7,
    PHASE: d.PHASE + 33,
    SPEED_SCALE: d.SPEED_SCALE + 0.21,
    SIZE: d.SIZE + 9,
    MOBILE_SIZE: d.MOBILE_SIZE + 6,
    DEPTH_SCALE: d.DEPTH_SCALE + 0.17,
    OPACITY: 0.7,
    ENV_INTENSITY: d.ENV_INTENSITY + 0.4,
    LIGHT_INTENSITY: d.LIGHT_INTENSITY + 0.6,
    SPIN_SPEED: d.SPIN_SPEED - 40,
    SPIN_TILT: d.SPIN_TILT + 8,
    BOB_PX: d.BOB_PX + 12,
    BOB_SECONDS: d.BOB_SECONDS + 2,
    TRAIL_ENABLED: !d.TRAIL_ENABLED,
    TRAIL_SECONDS: d.TRAIL_SECONDS + 0.3,
    TRAIL_DENSITY: d.TRAIL_DENSITY + 25,
    TRAIL_SIZE: d.TRAIL_SIZE + 3,
    TRAIL_SPREAD: d.TRAIL_SPREAD + 2,
    TRAIL_DRIFT: d.TRAIL_DRIFT + 7,
    TRAIL_GLOW: 0.4,
    TRAIL_CORE_COLOR: '#123456',
    TRAIL_COLOR: '#abcdef',
    TRAIL_OPACITY: 0.33,
    TRAIL_TWINKLE: 0.66,
    TRAIL_ADDITIVE: !d.TRAIL_ADDITIVE,
    LABEL_ENABLED: !d.LABEL_ENABLED,
    LABEL_TEXT: 'MOKSHA',
    LABEL_SIZE: d.LABEL_SIZE + 4,
    LABEL_COLOR: '#654321',
    LABEL_OFFSET: d.LABEL_OFFSET + 6,
    LABEL_HALO: 2,
    HOLD_FREEZE: !d.HOLD_FREEZE,
    HOLD_SHAKE_PX: d.HOLD_SHAKE_PX + 3,
    HOLD_SHAKE_SPEED: d.HOLD_SHAKE_SPEED + 0.5,
    ENTRANCE_MS: d.ENTRANCE_MS + 400,
    SCROLL_FADE_VH: d.SCROLL_FADE_VH + 0.4,
  }
  const round = resolveMascot(toMascotPayload(perturbed))
  for (const k of Object.keys(perturbed) as (keyof typeof perturbed)[]) {
    check(`round trip preserves ${k}`, JSON.stringify(round[k]) === JSON.stringify(perturbed[k]))
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll mascot resolver checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
node --import tsx src/lib/mascot/resolveMascot.check.ts
```

- [ ] **Step 3: Write `src/lib/mascot/resolveMascot.ts`**

Model it on `src/lib/satellites/resolveSatellites.ts` — same `num` / `bool` / `hex` / `clamp01` helpers, same "every field optional and nullable" input type. The field-name mapping (CMS camelCase → engine SCREAMING_CASE):

| CMS group.field | engine key | transform |
|---|---|---|
| `mascotEnabled` | `ENABLED` | `bool(_, d.ENABLED)` |
| `mascotOrbit.radius` | `RADIUS` | `num` |
| `mascotOrbit.mobileRadius` | `MOBILE_RADIUS` | `num` |
| `mascotOrbit.height` | `HEIGHT` | `num` |
| `mascotOrbit.tiltOffset` | `TILT_OFFSET` | `num` |
| `mascotOrbit.phase` | `PHASE` | `num` |
| `mascotOrbit.speedScale` | `SPEED_SCALE` | `num` |
| `mascotLook.size` | `SIZE` | `num` |
| `mascotLook.mobileSize` | `MOBILE_SIZE` | `num` |
| `mascotLook.depthScale` | `DEPTH_SCALE` | `num` |
| `mascotLook.opacity` | `OPACITY` | `clamp01(num(...))` |
| `mascotLook.envIntensity` | `ENV_INTENSITY` | `num` |
| `mascotLook.lightIntensity` | `LIGHT_INTENSITY` | `num` |
| `mascotSpin.spinSpeed` | `SPIN_SPEED` | `num` |
| `mascotSpin.spinTilt` | `SPIN_TILT` | `num` |
| `mascotSpin.bobPx` | `BOB_PX` | `num` |
| `mascotSpin.bobSeconds` | `BOB_SECONDS` | `num` |
| `mascotTrail.enabled` | `TRAIL_ENABLED` | `bool` |
| `mascotTrail.seconds` | `TRAIL_SECONDS` | `num` |
| `mascotTrail.density` | `TRAIL_DENSITY` | `num` |
| `mascotTrail.size` | `TRAIL_SIZE` | `num` |
| `mascotTrail.spread` | `TRAIL_SPREAD` | `num` |
| `mascotTrail.drift` | `TRAIL_DRIFT` | `num` |
| `mascotTrail.glow` | `TRAIL_GLOW` | `clamp01(num(...))` |
| `mascotTrail.twinkle` | `TRAIL_TWINKLE` | `clamp01(num(...))` |
| `mascotTrail.opacity` | `TRAIL_OPACITY` | `clamp01(num(...))` |
| `mascotTrail.additive` | `TRAIL_ADDITIVE` | `bool` |
| `mascotTrail.color` | `TRAIL_COLOR` | `hex` |
| `mascotTrail.coreColor` | `TRAIL_CORE_COLOR` | `hex` |
| `mascotLabel.enabled` | `LABEL_ENABLED` | `bool` |
| `mascotLabelText` | `LABEL_TEXT` | non-empty string else default (see below) |
| `mascotLabel.size` | `LABEL_SIZE` | `num` |
| `mascotLabel.color` | `LABEL_COLOR` | `hex` |
| `mascotLabel.offset` | `LABEL_OFFSET` | `num` |
| `mascotLabel.halo` | `LABEL_HALO` | `num` |
| `mascotHold.freeze` | `HOLD_FREEZE` | `bool` |
| `mascotHold.shakePx` | `HOLD_SHAKE_PX` | `num` |
| `mascotHold.shakeSpeed` | `HOLD_SHAKE_SPEED` | `num` |
| `mascotBehaviour.entranceMs` | `ENTRANCE_MS` | `num` |
| `mascotBehaviour.scrollFadeVh` | `SCROLL_FADE_VH` | `num` |

Label text helper:

```ts
const text = (v: string | null | undefined, fallback: string): string =>
  typeof v === 'string' && v.trim().length > 0 ? v : fallback
```

`toMascotPayload` is the mechanical inverse. It returns an object with the nested groups **and** the top-level `mascotEnabled: c.ENABLED` and `mascotLabelText: c.LABEL_TEXT` scalars — so `resolveMascot(toMascotPayload(x))` fully reconstructs `x` (the round-trip check depends on this). The `mascotLabel` group carries `enabled/size/color/offset/halo` only; the label's *text* is the top-level scalar, matching how it is defined in Task 5 (not localized, outside the group).

- [ ] **Step 4: Run — expect PASS**

```bash
node --import tsx src/lib/mascot/resolveMascot.check.ts
```

Expected: every `round trip preserves X` green. A missing key in `toMascotPayload` shows as exactly one failing `round trip preserves …` line naming it.

- [ ] **Step 5: Register in `package.json` `verify:config`**

Append ` && node --import tsx src/lib/mascot/resolveMascot.check.ts` before the closing quote.

- [ ] **Step 6: Standing gates + commit**

```bash
npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/mascot/resolveMascot.ts src/lib/mascot/resolveMascot.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(mascot): CMS <-> engine resolver

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Add the CMS fields

**Files:**
- Modify: `src/globals/HeroEffects.ts` (append after the `satelliteBehaviour` group, before the closing `],`)

**Interfaces:**
- Consumes: `colourField` (module-local helper in `HeroEffects.ts`).
- Produces: the `mascot*` fields that `resolveMascot`'s `HeroEffectsMascotInput` already assumes. **Field names and group nesting here MUST match the table in Task 4 exactly.**

- [ ] **Step 1: Add the kill switch + `mascotLabelText` scalar**

After the `satelliteBehaviour` group object, add:

```ts
{
  name: 'mascotEnabled',
  type: 'checkbox',
  defaultValue: true,
  admin: {
    description:
      'A single brass mascot orbiting the logo alongside the satellites, trailing gold dust and carrying its own word. Turning this off removes it entirely — nothing else in the hero changes.',
  },
},
{
  name: 'mascotLabelText',
  type: 'text',
  defaultValue: 'SAMSARA',
  admin: {
    description:
      'The mascot’s word. NOT one of the hero “floating words” — those are localized and their count drives the satellites; this is the mascot’s own fixed name, shown identically in both languages.',
  },
},
```

- [ ] **Step 2: Add the `mascotOrbit` group**

```ts
{
  name: 'mascotOrbit',
  type: 'group',
  label: 'Mascot — orbit',
  admin: {
    description:
      'The mascot shares the satellites’ orbital plane (tilt, roll, direction). These are its own place within it.',
  },
  fields: [
    {
      name: 'radius',
      type: 'number',
      defaultValue: 0.71,
      min: 0.3,
      max: 2.5,
      admin: { description: 'As a fraction of the satellites’ outer radius. The bead band is 0.5–0.8.' },
    },
    { name: 'mobileRadius', type: 'number', defaultValue: 0.55, min: 0.3, max: 2.5 },
    {
      name: 'height',
      type: 'number',
      defaultValue: 136,
      min: 20,
      max: 300,
      admin: {
        description:
          'How far the mascot rides above the belt plane, in px. Keep this well clear of 0 — it is what keeps the mascot reading as nearer than the beads it passes.',
      },
    },
    { name: 'tiltOffset', type: 'number', defaultValue: 0, min: -60, max: 60 },
    { name: 'phase', type: 'number', defaultValue: 88, min: 0, max: 360, admin: { description: 'Starting angle on the orbit, degrees' } },
    {
      name: 'speedScale',
      type: 'number',
      defaultValue: 0.52,
      min: 0,
      max: 3,
      admin: { description: 'Orbit speed as a multiple of the satellites’ orbit speed' },
    },
  ],
},
```

- [ ] **Step 3: Add `mascotLook`, `mascotSpin`, `mascotTrail`, `mascotLabel`, `mascotHold`, `mascotBehaviour`**

```ts
{
  name: 'mascotLook',
  type: 'group',
  label: 'Mascot — size & look',
  fields: [
    { name: 'size', type: 'number', defaultValue: 28, min: 20, max: 420, admin: { description: 'On-screen diameter in px at zero depth' } },
    { name: 'mobileSize', type: 'number', defaultValue: 18, min: 16, max: 300 },
    {
      name: 'depthScale',
      type: 'number',
      defaultValue: 0.3,
      min: 0,
      max: 3,
      admin: { description: 'Extra near/far size difference beyond the perspective divide. NOT the satellites’ 0.9 — that value is tuned for 4px beads.' },
    },
    { name: 'opacity', type: 'number', defaultValue: 1, min: 0.05, max: 1 },
    { name: 'envIntensity', type: 'number', defaultValue: 1, min: 0, max: 4, admin: { description: 'Reflection strength. Brass is fully metallic — at 0 it goes black.' } },
    { name: 'lightIntensity', type: 'number', defaultValue: 1.5, min: 0, max: 6 },
  ],
},
{
  name: 'mascotSpin',
  type: 'group',
  label: 'Mascot — spin',
  fields: [
    { name: 'spinSpeed', type: 'number', defaultValue: 113, min: -180, max: 180, admin: { description: 'Degrees per second, independent of the orbit' } },
    { name: 'spinTilt', type: 'number', defaultValue: 12, min: -90, max: 90 },
    { name: 'bobPx', type: 'number', defaultValue: 0, min: 0, max: 80, admin: { description: 'Slow vertical float on top of the orbit' } },
    { name: 'bobSeconds', type: 'number', defaultValue: 8.8, min: 0.5, max: 20 },
  ],
},
{
  name: 'mascotTrail',
  type: 'group',
  label: 'Mascot — gold dust trail',
  admin: { description: 'A shed particle field. Additive blending is a deliberate choice — the dust colour is picked bright to suit it.' },
  fields: [
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'seconds', type: 'number', defaultValue: 1.4, min: 0.05, max: 5, admin: { description: 'How long each mote lives' } },
    { name: 'density', type: 'number', defaultValue: 130, min: 0, max: 400, admin: { description: 'Motes per second' } },
    { name: 'size', type: 'number', defaultValue: 10, min: 1, max: 40, admin: { description: 'Mote diameter in px' } },
    { name: 'spread', type: 'number', defaultValue: 6.5, min: 0, max: 60, admin: { description: 'Random scatter at emission, px' } },
    { name: 'drift', type: 'number', defaultValue: 25, min: 0, max: 160, admin: { description: 'How fast motes drift off the path, px/sec' } },
    { name: 'glow', type: 'number', defaultValue: 0.95, min: 0, max: 1, admin: { description: 'Hot-core strength' } },
    { name: 'twinkle', type: 'number', defaultValue: 0.45, min: 0, max: 1 },
    { name: 'opacity', type: 'number', defaultValue: 0.75, min: 0, max: 1 },
    { name: 'additive', type: 'checkbox', defaultValue: true, admin: { description: 'Additive blending. Off is slightly more saturated on the paper.' } },
    colourField('color', '#FDB721', { description: 'The saturated body of each mote' }),
    colourField('coreColor', '#FFFCD6', { description: 'The bright centre of each mote' }),
  ],
},
{
  name: 'mascotLabel',
  type: 'group',
  label: 'Mascot — word',
  admin: { description: 'The word’s text is set above (“mascot label text”). These control how it looks.' },
  fields: [
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'size', type: 'number', defaultValue: 12, min: 8, max: 40 },
    colourField('color', '#2B2A27'),
    { name: 'offset', type: 'number', defaultValue: 14, min: 0, max: 80, admin: { description: 'Gap from the mascot’s edge, px' } },
    {
      name: 'halo',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 6,
      admin: { description: 'Paper-coloured halo behind the word, px. Fixes the word going illegible where it crosses the mark’s red stroke. 0 is off.' },
    },
  ],
},
{
  name: 'mascotHold',
  type: 'group',
  label: 'Mascot — press and hold',
  admin: { description: 'Shares the same gesture as the hold-to-separate effect. Freeze + tremble in place while the logo is held.' },
  fields: [
    { name: 'freeze', type: 'checkbox', defaultValue: true },
    { name: 'shakePx', type: 'number', defaultValue: 1.5, min: 0, max: 40 },
    { name: 'shakeSpeed', type: 'number', defaultValue: 1, min: 0.1, max: 4 },
  ],
},
{
  name: 'mascotBehaviour',
  type: 'group',
  label: 'Mascot — behaviour',
  fields: [
    { name: 'entranceMs', type: 'number', defaultValue: 1600, min: 0, max: 5000 },
    {
      name: 'scrollFadeVh',
      type: 'number',
      defaultValue: 0.6,
      min: 0,
      max: 3,
      admin: { description: 'Screens of scrolling over which the mascot dissolves. 0 never fades.' },
    },
  ],
},
```

- [ ] **Step 4: Update the global's header comment**

The `HeroEffects` doc comment (`src/globals/HeroEffects.ts:36-47`) lists what the global covers. Add a sentence: `The mascot fields are read by resolveMascot() and fall back to DEFAULT_MASCOT for any that are null on an install that has not been reseeded.`

- [ ] **Step 5: Push the schema — restart dev, watch for trouble**

```bash
# stop the running dev server first
rm -rf .next
npm run dev
```

Watch the startup log:
- It should say `Pulling schema from database…` then `✓` with no prompt.
- **If a `DATA LOSS` prompt appears:** a field is non-nullable. All mascot fields have `defaultValue` and are optional, so this should not happen — if it does, do not answer the prompt; kill dev, review the field that triggered it, fix, retry.
- After it is up: `sqlite3 tampa-taruno.db "SELECT name FROM sqlite_master WHERE name LIKE '__new_%'"` — expect **no rows**. Any `__new_hero_effects` row means an interrupted push; back up the DB, diff it column-for-column against `hero_effects`, drop only if identical.

- [ ] **Step 6: Confirm the fields exist and read as defaults**

```bash
curl -s "http://localhost:3000/api/globals/hero-effects?depth=0" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const g=JSON.parse(s);console.log('mascotEnabled:',g.mascotEnabled);console.log('mascotLabelText:',g.mascotLabelText);console.log('mascotOrbit:',JSON.stringify(g.mascotOrbit));console.log('mascotTrail.additive:',g.mascotTrail&&g.mascotTrail.additive)})"
```

Expected: `mascotEnabled: true`, `mascotLabelText: SAMSARA` (from `defaultValue`), `mascotOrbit` an object with `radius: 0.71` etc.

- [ ] **Step 7: `resolveMascot` against the live global equals `DEFAULT_MASCOT`**

```bash
node --import tsx -e "
import('./src/lib/mascot/resolveMascot.ts').then(async ({resolveMascot}) => {
  const {DEFAULT_MASCOT} = await import('./src/lib/mascot/types.ts')
  const g = await fetch('http://localhost:3000/api/globals/hero-effects?depth=0').then(r=>r.json())
  const r = resolveMascot(g)
  const same = JSON.stringify(r) === JSON.stringify(DEFAULT_MASCOT)
  console.log(same ? 'MATCH: live global resolves to DEFAULT_MASCOT' : 'MISMATCH')
  if (!same) for (const k of Object.keys(DEFAULT_MASCOT)) if (JSON.stringify(r[k])!==JSON.stringify(DEFAULT_MASCOT[k])) console.log('  ', k, r[k], '!=', DEFAULT_MASCOT[k])
})
"
```

Expected: `MATCH`. A mismatch means a CMS `defaultValue` or a Task 4 mapping is wrong — fix whichever is off.

- [ ] **Step 8: Standing gates + commit**

```bash
npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/globals/HeroEffects.ts src/payload-types.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): mascot fields on the hero-effects global

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(`payload-types.ts` regenerates on dev start; stage it if it changed. If it did not, run `npm run generate:types` and stage.)

---

### Task 6: Seed the approved values, and fix the stale satellite colours

**Files:**
- Modify: `src/seed/index.ts` (the `hero-effects` `updateGlobal` block, ~lines 63-198)

**Interfaces:**
- Consumes: nothing at runtime — this is data.
- Produces: a fresh-install DB whose `hero-effects` global matches `DEFAULT_MASCOT` and the shifted 12-entry `SAT_COLORS`.

- [ ] **Step 1: Fix the stale `satelliteColors` array**

In `src/seed/index.ts` the `satelliteColors` list still has 13 entries starting `'#000000'`. `samsara` was removed from `floatingWords` and `DEFAULT_SATELLITES.SAT_COLORS` was shifted to 12 (commit `504cc31`). Make the seed match — delete the `'#000000',` line so the array is:

```ts
      satelliteColors: [
        '#ffd500',
        '#f96d3e',
        '#23e126',
        '#0f8a75',
        '#04b1b4',
        '#13118d',
        '#2B2A27',
        '#b04803',
        '#145c0a',
        '#118d1f',
        '#b400cc',
        '#bd0000',
      ].map((color) => ({ color })),
```

Update the comment above it: the list is 12 to match the 12 hero words after `samsara` moved to the mascot.

- [ ] **Step 2: Add the mascot block**

After the `satelliteBehaviour` line in the same `data: {}` object:

```ts
      // Owner-tuned at /dev/mascot and signed off 2026-08-28. Mirrors
      // DEFAULT_MASCOT exactly; src/lib/mascot/types.check.ts pins the same
      // numbers. Like the satellites block above, this only runs on a FRESH
      // install — an existing DB reads Payload's field defaultValues, which
      // cover every mascot field (no arrays here), so resolveMascot returns
      // the right values even before anyone opens /admin.
      mascotEnabled: true,
      mascotLabelText: 'SAMSARA',
      mascotOrbit: { radius: 0.71, mobileRadius: 0.55, height: 136, tiltOffset: 0, phase: 88, speedScale: 0.52 },
      mascotLook: { size: 28, mobileSize: 18, depthScale: 0.3, opacity: 1, envIntensity: 1, lightIntensity: 1.5 },
      mascotSpin: { spinSpeed: 113, spinTilt: 12, bobPx: 0, bobSeconds: 8.8 },
      mascotTrail: {
        enabled: true,
        seconds: 1.4,
        density: 130,
        size: 10,
        spread: 6.5,
        drift: 25,
        glow: 0.95,
        twinkle: 0.45,
        opacity: 0.75,
        additive: true,
        color: '#FDB721',
        coreColor: '#FFFCD6',
      },
      mascotLabel: { enabled: true, size: 12, color: '#2B2A27', offset: 14, halo: 0 },
      mascotHold: { freeze: true, shakePx: 1.5, shakeSpeed: 1 },
      mascotBehaviour: { entranceMs: 1600, scrollFadeVh: 0.6 },
```

- [ ] **Step 3: Push the seeded values to the running dev DB**

The seed bails on an existing install, so write the mascot slice directly (the scalars already read as `DEFAULT_MASCOT` from field defaults, but do this to prove the round trip and to fix `satelliteColors` in the live DB):

```bash
TT_TOKEN=$(curl -s -X POST "http://localhost:3000/api/users/login" -H "Content-Type: application/json" -d '{"email":"admin@tampa-taruno.local","password":"tampataruno-2026"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")

node --import tsx -e "
import('./src/lib/mascot/resolveMascot.ts').then(async ({toMascotPayload}) => {
  const {DEFAULT_MASCOT} = await import('./src/lib/mascot/types.ts')
  const body = toMascotPayload(DEFAULT_MASCOT)
  const res = await fetch('http://localhost:3000/api/globals/hero-effects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'JWT ' + process.env.TT_TOKEN },
    body: JSON.stringify(body),
  })
  console.log('mascot POST', res.status, (await res.json()).message)
})
"
```

(The `satelliteColors` live-DB fix was already applied this session — verify with a GET that it is 12 entries starting `#ffd500`; if a fresh DB, it comes from the corrected seed.)

- [ ] **Step 4: Confirm the hero words are 12 with no `samsara`**

`samsara` was removed from the homepage hero's `floatingWords` (EN) earlier this session — it moved to the mascot. Verify the live DB state so nothing re-adds it:

```bash
for loc in en id; do
  curl -s "http://localhost:3000/api/pages?where%5Bslug%5D%5Bequals%5D=home&locale=$loc&depth=0&limit=1" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const h=JSON.parse(s).docs[0].layout.find(b=>b.blockType==='hero');const w=h.floatingWords.map(x=>x.word);console.log('$loc',w.length,w.includes('samsara')?'HAS SAMSARA — FIX':'ok',w.join(','))})"
done
```

Expected: both `en` and `id` report `12` and `ok`. If EN still has `samsara`, remove it with an authenticated `PATCH /api/pages/1?locale=en` sending the full `layout` with the `samsara` row filtered out of the hero block's `floatingWords`.

- [ ] **Step 5: `npm run seed:verify` if it covers hero-effects; otherwise skip**

```bash
grep -q "hero-effects\|mascot" src/seed/verify.ts && npm run seed:verify || echo "seed:verify does not check hero-effects — skipping"
```

- [ ] **Step 6: Standing gates + commit**

```bash
npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/seed/index.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "chore(seed): mascot defaults; satellite colours to 12 after samsara moved

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the CMS value through to the real hero

**Files:**
- Modify: `src/components/blocks/RenderBlocks.tsx` (the `hero` case)
- Modify: `src/components/blocks/HeroBlock.tsx` (props, `labelBoxRef`, mount `<MascotLayer>`)
- Verify (likely no change): `src/components/hero/MascotLayer.tsx`, `src/components/hero/SatelliteField.tsx`

**Interfaces:**
- Consumes: `resolveMascot` from `@/lib/mascot/resolveMascot`; `MascotConfig` from `@/lib/mascot/types`; `MascotLayer` from `@/components/hero/MascotLayer` — props `{ config: MascotConfig; belt: SatelliteConfig; active: boolean; enabled?: boolean; chargeRef?; labelBoxRef?; modelUrl?; onStatus? }`; `SatelliteField` prop `labelBoxRef?: React.MutableRefObject<(() => LabelBox | null) | null>`; `type LabelBox` from `@/lib/satellites/labels`.
- Produces: a hero that mounts the mascot from CMS config.

- [ ] **Step 1: `RenderBlocks` passes the resolved config**

In `src/components/blocks/RenderBlocks.tsx`, add the import next to the others:

```ts
import { resolveMascot } from '../../lib/mascot/resolveMascot'
```

In the `case 'hero':` block, add one prop to `<HeroBlock>`:

```tsx
                  mascot={resolveMascot(effects)}
```

- [ ] **Step 2: `HeroBlock` takes the prop**

In `src/components/blocks/HeroBlock.tsx`:

- Import: `import { MascotLayer } from '../hero/MascotLayer'` and `import type { MascotConfig } from '../../lib/mascot/types'` and `import type { LabelBox } from '../../lib/satellites/labels'`.
- Add to `type Props`:

```ts
  // Required, not optional: a dropped prop must fail loudly rather than
  // silently reverting the hero to frozen defaults.
  mascot: MascotConfig
```

- Near the existing `const chargeRef = useRef<(() => number) | null>(null)` (line ~86), add:

```ts
  // Carries the mascot's current label box to the satellites' collision pass,
  // so the mascot's word wins any overlap. Pull-based like chargeRef: it
  // changes every frame and mirroring it into React state would cost a
  // re-render per frame.
  const labelBoxRef = useRef<(() => LabelBox | null) | null>(null)
```

- [ ] **Step 3: Mount `<MascotLayer>` and thread `labelBoxRef`**

In `HeroBlock`'s JSX, the current order is `<SatelliteField … /> <LogoStage … />`. Change to:

```tsx
      <SatelliteField
        words={floatingWords}
        config={satellites}
        active={stageLive}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
        enabled={satellites.SAT_ENABLED}
      />
      <MascotLayer
        config={mascot}
        belt={satellites}
        active={stageLive}
        enabled={mascot.ENABLED}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
      />
      <LogoStage
        onLive={onStageLive}
        onIntroPlayStart={onIntroPlayStart}
        separation={separation}
        ignition={ignition}
        onChargeSource={onChargeSource}
      />
```

`MascotLayer` must be **before** `<LogoStage>` (its `z 0` state relies on painting first); after `<SatelliteField>` is fine. `active={stageLive}` matches what `<SatelliteField>` is already passed in this file — use the identical expression, not a new one.

- [ ] **Step 4: Confirm `MascotLayer` and `SatelliteField` need no change**

```bash
grep -n "labelBoxRef" src/components/hero/SatelliteField.tsx src/components/hero/MascotLayer.tsx
grep -n "setReservedLabels" src/lib/satellites/SatelliteEngine.ts
```

Expected: `SatelliteField` already accepts `labelBoxRef` and calls `engine.setReservedLabels(...)`; `MascotLayer` already accepts `labelBoxRef` and sets `labelBoxRef.current = () => engine.getLabelBox()`. If any is missing, add it now following the prototype's `chargeRef` pattern exactly.

- [ ] **Step 5: Browser check — the mascot is on the real homepage**

With `npm run dev` up:

```bash
node <scratchpad>/mascot-capture.mjs "http://localhost:3000/en" 8 900 hero-live
```

Expected: contact sheet shows the brass mascot orbiting the real hero with its gold trail and SAMSARA label, alongside the 12-bead belt; `console errors: 0`; `layer flips observed: >= 1`.

Also confirm the label reservation is live:

```bash
node <scratchpad>/mascot-label.mjs "http://localhost:3000/en"
```

Expected: `collides with a satellite word in <2%`.

- [ ] **Step 6: Standing gates + commit**

```bash
npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/components/blocks/RenderBlocks.tsx src/components/blocks/HeroBlock.tsx src/components/hero/SatelliteField.tsx src/components/hero/MascotLayer.tsx
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(hero): mount the mascot from CMS config

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Prove the kill switch actually kills

**Files:**
- Create: `docs/superpowers/verification/mascot-kill-switch.mjs`

**Interfaces:**
- Consumes: the authenticated `hero-effects` write flow (Global Constraints); `window.__ttMascot()` on the page.
- Produces: a pass/fail script.

- [ ] **Step 1: Write `docs/superpowers/verification/mascot-kill-switch.mjs`**

```js
/**
 * mascotEnabled OFF must remove the mascot ENTIRELY — no canvas in the DOM, no
 * WebGL context, and mascot.draco.glb never fetched. Not merely "blank". This
 * bug class (a switch that leaves the effect half-running) has shipped THREE
 * times on this project.
 *
 * Flips the REAL CMS value both ways via authenticated POST and checks the
 * live homepage each time.
 *
 * Run: node docs/superpowers/verification/mascot-kill-switch.mjs
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
}).then((r) => r.json()).then((j) => j.token)
if (!token) throw new Error('login failed')

const setEnabled = (v) =>
  fetch(`${BASE}/api/globals/hero-effects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
    body: JSON.stringify({ mascotEnabled: v }),
  }).then((r) => r.json())

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 800 },
})

async function probe(label) {
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
  await page.goto(`${BASE}/en`, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 6000))
  const r = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas[data-mascot]').length,
    labelNodes: document.querySelectorAll('[data-mascot-label]').length,
    handle: typeof window.__ttMascot,
    glb: performance.getEntriesByType('resource').filter((e) => e.name.includes('mascot.draco.glb')).length,
  }))
  await page.close()
  return r
}

try {
  await setEnabled(false)
  const off = await probe('OFF')
  check('OFF: no mascot canvas', off.canvases === 0, `found ${off.canvases}`)
  check('OFF: no mascot label node', off.labelNodes === 0, `found ${off.labelNodes}`)
  check('OFF: mascot model never fetched', off.glb === 0, `${off.glb} request(s)`)
  check('OFF: no dev handle (engine never constructed)', off.handle === 'undefined')

  await setEnabled(true)
  const on = await probe('ON')
  check('ON: mascot canvas present', on.canvases === 1, `found ${on.canvases}`)
  check('ON: model fetched once', on.glb === 1, `${on.glb} request(s)`)
} finally {
  await setEnabled(true) // leave it on
  await browser.close()
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nKill switch verified both ways.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it — expect PASS**

```bash
node docs/superpowers/verification/mascot-kill-switch.mjs
```

Expected: all `ok`, `Kill switch verified both ways.` If `OFF: no dev handle` fails, `MascotEngine`'s constructor is running when disabled — `MascotLayer` must `return null` before the `useEffect` that news up the engine, which the prototype already does; check `enabled={mascot.ENABLED}` is actually threaded (Task 7 Step 3).

- [ ] **Step 3: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/mascot-kill-switch.mjs
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(mascot): kill switch removes the layer entirely

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Bench saves to the CMS

**Files:**
- Modify: `src/app/(frontend)/[locale]/dev/mascot/MascotLab.tsx`

**Interfaces:**
- Consumes: `toMascotPayload` from `@/lib/mascot/resolveMascot`.
- Produces: a save button on the bench, matching the satellites bench's pattern.

- [ ] **Step 1: Read the satellites bench save button for the exact pattern**

```bash
sed -n '255,280p' "src/app/(frontend)/[locale]/dev/satellites/SatelliteLab.tsx"
```

- [ ] **Step 2: Add `save` / `dirty` state and the button to `MascotLab`**

At the top, add `import { toMascotPayload } from '@/lib/mascot/resolveMascot'`.

Add near the other `useState`s:

```ts
  const [dirty, setDirty] = useState(false)
```

In the `set` callback, add `setDirty(true)`. Add:

```ts
  const save = useCallback(async () => {
    setMascotStatus('saving…')
    try {
      const res = await fetch('/api/globals/hero-effects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(toMascotPayload(cfg)),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setDirty(false)
      setMascotStatus('saved to CMS — reload the homepage to see it live')
    } catch (err) {
      console.error('bench: save failed', err)
      setMascotStatus('save failed — are you logged in at /admin?')
    }
  }, [cfg])
```

In the button row, replace the standalone `copy json` button with two:

```tsx
        <button type="button" onClick={save} style={btn(dirty ? '#8E1114' : 'rgba(43,42,39,0.55)')}>
          {dirty ? 'save •' : 'save'}
        </button>
        <button type="button" onClick={copyJson} style={btn('rgba(43,42,39,0.55)')}>
          {copied ? 'copied' : 'copy json'}
        </button>
```

Update the "prototype — nothing saves to the CMS yet" line to `saves the mascot slice of the Hero Effects global`.

- [ ] **Step 3: Browser check — save then read back**

```bash
node <scratchpad>/mascot-bench-save.mjs
```

(New tiny script: load `/en/dev/mascot`, drag `SPIN_SPEED` via `?SPIN_SPEED=40`, click `save`, then `curl` the global and assert `mascotSpin.spinSpeed === 40`, then restore with an authenticated POST of `toMascotPayload(DEFAULT_MASCOT)`.)

Expected: read-back shows the changed value; hero picks it up after reload.

- [ ] **Step 4: Standing gates + commit**

```bash
npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add "src/app/(frontend)/[locale]/dev/mascot/MascotLab.tsx"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(mascot): bench saves to the hero-effects global

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Mascot in the admin live preview

**Files:**
- Modify: `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx`
- Modify: `src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx`

**Interfaces:**
- Consumes: `resolveMascot`, `type HeroEffectsMascotInput` from `@/lib/mascot/resolveMascot`; `MascotConfig` from `@/lib/mascot/types`.
- Produces: the live preview mounts the mascot from the same live-edited `hero-effects` data as the satellites.

- [ ] **Step 1: `page.tsx` passes `savedMascot`**

Add the import and, next to `savedSatellites={resolveSatellites(effects)}`:

```tsx
        savedMascot={resolveMascot(effects)}
```

- [ ] **Step 2: `HeroPreview.tsx` — add to `Props` and resolve live**

- `import { resolveMascot, type HeroEffectsMascotInput } from '@/lib/mascot/resolveMascot'` and `import type { MascotConfig } from '@/lib/mascot/types'`.
- `Props` gains `savedMascot: MascotConfig`.
- Where the component computes `let satellites = props.savedSatellites` and then `satellites = resolveSatellites(data as HeroEffectsSatellitesInput)` inside the global branch, do the same for the mascot:

```ts
  let mascot = props.savedMascot
  // …inside the `if (source is the hero-effects global)` branch, alongside the satellites line:
  mascot = resolveMascot(data as HeroEffectsMascotInput)
```

- Pass `mascot={mascot}` to `<HeroBlock>`.

- [ ] **Step 3: Browser check — edit a mascot field in /admin, preview updates**

Follow `docs/superpowers/verification/preview-live-update.mjs` if present; otherwise: open `/admin` hero-effects, the preview iframe at `/en/admin-preview/hero`, change `mascotSpin.spinSpeed`, assert `window.__ttMascot().` reflects a faster spin without a save. **Note:** the in-app pane cannot run this (rAF throttle + `RenderIfInViewport` starvation) — use headless Chrome.

- [ ] **Step 4: Standing gates + commit**

```bash
npx tsc --noEmit && npm run verify:config
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add "src/app/(frontend)/[locale]/admin-preview/hero/page.tsx" "src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(mascot): live preview in the hero admin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Promote the verification harness, add `build:mascot`, run a real build

**Files:**
- Create: `docs/superpowers/verification/mascot-{capture,occlusion,sorting,label,degradation}.mjs` (promoted from scratchpad; `mascot-kill-switch.mjs` already landed in Task 8)
- Modify: `docs/superpowers/verification/README.md`
- Modify: `package.json` (`build:mascot` script)

**Interfaces:**
- Consumes: `window.__ttMascot()` / `window.__ttSatellites()` dev handles; the scratchpad scripts written during prototyping.
- Produces: a repo-kept harness.

- [ ] **Step 1: Copy and clean the five scripts**

From the session scratchpad, copy → `docs/superpowers/verification/`, renaming per the spec §12 table:

| scratchpad | promoted | asserts |
|---|---|---|
| `capture-mascot.mjs` | `mascot-capture.mjs` | orbit direction (cross-product sign), layer-flip count, fps, console errors, contact sheet |
| `verify-occlusion.mjs` | `mascot-occlusion.mjs` | body on the mark contributes ≫ pixels in front vs behind, `prefers-reduced-motion` frozen first |
| `verify-sorting.mjs` | `mascot-sorting.mjs` | overlap-with-bead % and wrong-sort % across three viewports |
| `verify-label.mjs` | `mascot-label.mjs` | label vs satellite-word collision %, edge-clip count |
| `verify-guards.mjs` | `mascot-degradation.mjs` | reduced motion byte-stable + non-empty; scroll-fade; **failed-GLB** path (request-intercept a 404 of `mascot.draco.glb`) leaves the hero intact — `[data-satellites]` canvases present, logo still becomes interactive, no thrown errors; **slow-GLB** path (stall `mascot.draco.glb` 10 s) does not delay the logo handoff — assert `LogoStage` reports live before the mascot loads |

Clean each: hard-code no session-specific scratchpad path for *inputs*; write outputs to an `out/` next to the script or to `process.env.TMPDIR`. Each ends `process.exit(failures ? 1 : 0)`. Point all at `http://localhost:3000`.

- [ ] **Step 2: Run all five against a warm dev server**

```bash
for s in capture occlusion sorting label degradation; do
  echo "=== mascot-$s ==="
  node "docs/superpowers/verification/mascot-$s.mjs" || echo "  ^ FAILED"
done
```

Expected: all exit 0. `mascot-sorting` prints `worst-case wrong-sorting: 0.0%`. `mascot-label` prints `< 2%`.

- [ ] **Step 3: README section**

Append to `docs/superpowers/verification/README.md` a `## Mascot` section: the six script names and what each asserts, plus the two traps — (a) orbit direction must be checked by cross-product sign, not by eye through the tilted projection; (b) the occlusion and sorting checks must `emulateMediaFeatures` reduce FIRST or the satellites' motion between shots swamps the signal.

- [ ] **Step 4: `build:mascot` script**

In `package.json` `scripts`, add:

```json
    "build:mascot": "node --max-old-space-size=6144 scripts/build-mascot.mjs \"../_ASSETS/Mascot.glb\" public/models/mascot.draco.glb 20000 1024",
```

Adjust the source path to the real location of `Mascot.glb` under `_ASSETS/` (confirm with `ls "../_ASSETS"` — the spec says it lives there; if the actual file is at `D:/TAMPA TARUNO/LOGO/Mascot.glb`, move a copy into `_ASSETS/` first so the build is not tied to a path outside the repo tree, and note that in `scripts/build-mascot.mjs`'s header).

- [ ] **Step 5: Confirm reproducibility**

```bash
npm run build:mascot
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" status --short public/models/mascot.draco.glb
```

Expected: **no diff** — the committed asset is byte-identical to a fresh build.

- [ ] **Step 6: A real production build (dev server STOPPED)**

```bash
# stop npm run dev
rm -rf .next
npm run build
rm -rf .next
```

Expected: build succeeds. Watch specifically for `missing-suspense-with-csr-bailout` — the `/dev/mascot` bench reads `window.location.search` in a `useEffect` (not `useSearchParams`) precisely to avoid this, so it should not fire; if it does, something regressed to `useSearchParams`.

Then restart dev clean and re-run `npm run verify:config` on the built state.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/ package.json public/models/mascot.draco.glb
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(mascot): promote the verification harness; add build:mascot

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Emissive eyes — owner gate

The mascot's amber eyes are painted into the baseColor texture; there is no emissive map, so under scene lighting they read as flat paint. At orbit size the eyes are most of the character. The spec (§8.4) defaults to **no glow** and requires an explicit owner yes before adding one.

**Files (only if owner says yes):**
- Modify: `scripts/build-mascot.mjs` (emissive-mask derivation)
- Regenerate: `public/models/mascot.draco.glb`

**Interfaces:** none — this is an asset change gated on a decision.

- [ ] **Step 1: Build a side-by-side on the running hero**

Add a temporary `?EYES=glow` override to `MascotLab` that swaps the model's material to `emissive` = a threshold-masked copy of the baseColor amber (`emissiveIntensity` ~1.5). Capture two contact sheets — current vs glow — at 28 px and at 140 px (the fly-out's likely scale).

- [ ] **Step 2: Show the owner, ask yes/no**

Present both sheets. Question: *the eyes are painted amber and read as flat under lighting — do you want them to genuinely glow?* One sentence, then wait.

- [ ] **Step 3a: If NO** — remove the temporary `?EYES=` override, add one line to the spec's §8.4 recording the decision and date, commit:

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "docs(mascot): owner declined emissive eyes"
```

- [ ] **Step 3b: If YES** — in `scripts/build-mascot.mjs`, after `textureCompress`, add a transform that: reads the baseColor WebP via `sharp`, thresholds the amber region (`R > 0.6, G > 0.35, B < 0.3` in linear-ish space) into a mask, writes it as the material's `emissiveTexture` with `emissiveFactor: [1, 0.75, 0.2]`. Verify the `KHR_texture_transform` scale ≈ 16 is copied onto the new texture's `texCoord`. Re-render through the rasteriser and compare against the source to confirm nothing else moved. Regenerate, confirm `MascotEngine` picks up `material.emissiveMap` (it traverses `MeshStandardMaterial` already), retune `emissiveIntensity` on screen with the owner, freeze it, commit:

```bash
npm run build:mascot
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add scripts/build-mascot.mjs public/models/mascot.draco.glb
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(mascot): glowing eyes (owner-approved)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## After the plan

- **Do not merge to `main` or push** without the owner asking. The satellites and ignition sub-projects both merged `--no-ff` with a message summarising the branch; follow that when the owner gives the go-ahead, and re-run the standing gates on `main` after the merge (not just on the branch).
- **The `_HANDOFF/HANDOFF.md`** gets a new top section: what shipped, the mascot's approved config, the CMS group, the `samsara`→mascot word move + colour shift, the per-layer sorting limitation and why `HEIGHT` guards it, and the deferred fly-out + emissive-eyes decisions.
- **Deferred, tracked in the spec, not this plan:** the scroll fly-out into the (not-yet-designed) mouse-reactive storytelling section (spec §13); mascot sound (spec §14). Each gets its own spec when its prerequisite exists.
- **`Mascot.glb` source** stays in `_ASSETS/`, never shipped, exactly like `logo.glb`.
