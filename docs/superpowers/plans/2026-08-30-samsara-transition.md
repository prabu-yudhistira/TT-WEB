# SAMSARA Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the SAMSARA mascot out of the hero's orbit, down behind the mark, and into a built 3D dark room that becomes Section 2, driven by counted scroll gestures.

**Architecture:** One `MascotEngine`, two cameras. The orbit keeps its orthographic camera in CSS-pixel units, unchanged. On commit, the camera swaps to perspective (solved so projected size matches at the seam) and the canvas root promotes from hero-absolute to viewport-fixed once SAMSARA has fallen clear of the logo's box. SAMSARA and the room share one renderer and one scene graph, so the mascot casts a real shadow on the real floor and the WebGL context count stays at 2.

**Tech Stack:** Next.js 15 (App Router) · Payload CMS 3 · three.js 0.185 · GSAP 3.15 · Lenis 1.3 · TypeScript · `tsx`-run assertion scripts · `puppeteer-core` for browser verification

**Spec:** `docs/superpowers/specs/2026-08-30-samsara-transition-design.md`

## Global Constraints

- **Working directory is `D:\TAMPA TARUNO\WEBSITE\_WEB_PRODUCT`.** A complete stale duplicate exists at the old `C:\Users\user\OneDrive\...` path. Never work there.
- **Every git command needs `-c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"`** or it fails with "dubious ownership".
- **The in-app browser pane cannot verify any of this.** It reports the tab hidden and throttles `requestAnimationFrame` to ~1 Hz, stalling the engine's own clock. All browser verification runs through `puppeteer-core` headless, Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`.
- **Never run `npm run build` while the dev server is up.** It corrupts `.next` for the running server. Stop dev → build → `rm -rf .next` → restart.
- **After any seed, `rm -rf .next/cache`.** `unstable_cache` persists to disk and a seed script's `revalidateTag` is a no-op outside a request context.
- **Writing to a Payload global over REST requires auth.** `POST /api/users/login`, then `Authorization: JWT <token>`. Reads are open.
- **`hero-effects` is NOT to be reseeded.** It carries owner-tuned values diverging from code defaults (`satelliteColors` at the `identity` slot is `#8A0F44` live vs `#0f8a75` in code). This work adds a *new* global instead.
- **No numeric CMS field's maximum may equal its approved value.** Every range gets headroom above whatever the bench freezes.
- **Existing owner-final decisions that must not be re-litigated:** `SPIN_SPEED 113`, `wireSpeed 6`, gold ignition crest `#FFF8E0`, additive dust blending, the eyes' deliberate left/right asymmetries.
- **`eyes.ts`, `LogoEngine.ts` and `SatelliteEngine.ts` are not modified by this plan.**
- **Shipped belt values every calculation must use:** `TILT 20`, `TILT_SIDEWAY 160`, `PERSPECTIVE 1300`, `OUTER_RADIUS 1.6`, mascot `RADIUS 0.71`, `HEIGHT 136`, `SIZE 28`, `DEPTH_SCALE 0.3`.

---

## File Structure

**Created — pure modules (unit-tested, no three.js):**

| File | Responsibility |
|---|---|
| `src/lib/samsara/types.ts` | `SequenceConfig` shape and frozen `DEFAULT_SEQUENCE` |
| `src/lib/samsara/gestures.ts` | Raw wheel/touch events → discrete debounced beats |
| `src/lib/samsara/cameraHandoff.ts` | Solve perspective params so projected size equals ortho pixel size |
| `src/lib/samsara/bounce.ts` | Damped three-bounce arc with depth advance |
| `src/lib/samsara/transitScript.ts` | Progress → pose; the logo-clearance predicate |

**Created — impure:**

| File | Responsibility |
|---|---|
| `src/lib/samsara/room.ts` | Room geometry and lights |
| `src/lib/samsara/SequenceController.ts` | The mode state machine |
| `src/lib/samsara/resolveSamsara.ts` | CMS global → `SequenceConfig` |
| `src/components/hero/SamsaraSequence.tsx` | React wiring, Lenis pin, gesture listeners |
| `src/components/blocks/SamsaraRoomBlock.tsx` | Section 2's DOM and chatbox stub |
| `src/globals/SamsaraSequence.ts` | Payload global |
| `src/app/(frontend)/[locale]/dev/samsara/page.tsx` | Tuning bench |

**Modified:** `src/lib/mascot/MascotEngine.ts` (additive surface only) · `src/components/hero/MascotLayer.tsx` · `src/components/blocks/HeroBlock.tsx` (shake wrapper) · `src/blocks/index.ts` · `src/components/blocks/RenderBlocks.tsx` · `src/payload.config.ts` · `src/seed/index.ts` · `package.json` (`verify:config`)

---

## Task 1: Branch, tag, and archive the retiring sections

Must be first: the archive captures how the homepage looks **before** anything changes, and that is unrecoverable afterwards.

**Files:**
- Create: `docs/archive/2026-08-30-homepage-sections/README.md`
- Create: `docs/archive/2026-08-30-homepage-sections/components/*.tsx` (copies)
- Create: `docs/archive/2026-08-30-homepage-sections/shots/*.png`
- Create: `scripts/archive-sections.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by later tasks. Independent safety work.

- [ ] **Step 1: Create the feature branch and tag the pre-change state**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" tag -a pre-section-redesign-2026-08-30 -m "Homepage as it stood before the 3-section redesign"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" checkout -b feat/samsara-transition
```

⚠️ Write the `-c safe.directory=...` flag out in full on every git command. Holding it in a shell variable does not work — the space in `TAMPA TARUNO` word-splits and git reads `TARUNO/WEBSITE/_WEB_PRODUCT` as a subcommand.

- [ ] **Step 2: Install `puppeteer-core` in the SCRATCHPAD, and start the dev server**

⚠️ `puppeteer-core` is deliberately **not** a dependency of this app and must never become one. Every existing harness script in `docs/superpowers/verification/` imports it bare and is executed from a scratchpad where it is installed; app-local packages are reached from there via `createRequire` with an absolute `file://` URL. Follow that pattern exactly.

```bash
SCRATCH="C:/Users/YUDHIS~1/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/d0ca22db-692e-419a-99b2-f64c186473d0/scratchpad"
cd "$SCRATCH" && npm init -y >/dev/null && npm install puppeteer-core
```

Then, in a separate shell:

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run dev
```

Wait for "Ready". Do not run a production build while this is up.

- [ ] **Step 3: Write the screenshot capture script**

Create `scripts/archive-sections.mjs` in the repo, but **run it from the scratchpad** (Step 5). Absolute output path, because the working directory will not be the repo:

```js
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REPO = 'D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT'
const OUT = `${REPO}/docs/archive/2026-08-30-homepage-sections/shots`
const SECTIONS = [
  'manifestoStrip', 'featuredWorks', 'servicesRows', 'archiveTeaser', 'contactMailto',
]
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle'],
})

for (const locale of ['en', 'id']) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: vp.width, height: vp.height })
    // Freeze the hero so shots are byte-stable run to run.
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ])
    await page.goto(`http://localhost:3000/${locale}`, { waitUntil: 'networkidle0' })
    await page.screenshot({
      path: `${OUT}/${locale}-${vp.name}-fullpage.png`,
      fullPage: true,
    })
    for (const s of SECTIONS) {
      const el = await page.$(`[data-block="${s}"]`)
      if (!el) { console.warn(`MISSING  ${locale}/${vp.name}/${s}`); continue }
      await el.screenshot({ path: `${OUT}/${locale}-${vp.name}-${s}.png` })
      console.log(`ok  ${locale}/${vp.name}/${s}`)
    }
    await page.close()
  }
}

await browser.close()
console.log('archive shots written to', OUT)
```

- [ ] **Step 4: Add the `data-block` attributes the script needs**

The five section components do not currently carry identifying attributes. Add `data-block="<slug>"` to the root element of each of `ManifestoStrip.tsx`, `FeaturedWorks.tsx`, `ServicesRows.tsx`, `ArchiveTeaser.tsx`, `ContactMailto.tsx`, matching the block slug exactly.

These attributes are harmless, and they also make the verification scripts in Task 18 able to assert a section is absent.

- [ ] **Step 5: Run the capture and confirm every section was found**

Run it **from the scratchpad**, not the repo — that is where `puppeteer-core` lives:

```bash
cd "C:/Users/YUDHIS~1/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/d0ca22db-692e-419a-99b2-f64c186473d0/scratchpad" && node "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT/scripts/archive-sections.mjs"
```

Expected: 20 `ok` lines (5 sections × 2 locales × 2 viewports), zero `MISSING`. A `MISSING` means the attribute in Step 4 was not applied or the block is not on the homepage — resolve it before continuing, because after Task 16 it cannot be captured.

- [ ] **Step 6: Copy the component sources into the archive**

```bash
mkdir -p docs/archive/2026-08-30-homepage-sections/components
cp src/components/blocks/ManifestoStrip.tsx \
   src/components/blocks/FeaturedWorks.tsx \
   src/components/blocks/ServicesRows.tsx \
   src/components/blocks/ArchiveTeaser.tsx \
   src/components/blocks/ContactMailto.tsx \
   docs/archive/2026-08-30-homepage-sections/components/
```

- [ ] **Step 7: Write the archive README**

Create `docs/archive/2026-08-30-homepage-sections/README.md` documenting, for each of the five sections: what it did, what CMS data drove it, why it was retired (the 3-section redesign), and where its screenshots are. Include this warning verbatim:

```markdown
## These blocks are still registered, deliberately

The Payload block definitions for all five remain in `src/blocks/index.ts`.
They were removed from the HOMEPAGE DOCUMENT's layout only.

Do NOT delete the definitions. Payload stores blocks in child tables
(`pages_blocks_featured_works` and siblings); removing a definition makes the
next schema push DROP those tables, destroying the content of any page still
carrying that block.

To restore a section: add it back to a page's layout in /admin. No code change.

`ManifestoStrip.tsx` is additionally still rendered by the /manifesto route and
must not be deleted under any circumstances.
```

- [ ] **Step 8: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/archive scripts/archive-sections.mjs src/components/blocks
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "chore(archive): capture the five homepage sections before retirement"
```

---

## Task 2: `samsara/types.ts` — config shape and starting values

**Files:**
- Create: `src/lib/samsara/types.ts`
- Test: `src/lib/samsara/types.check.ts`
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: `MascotConfig` from `src/lib/mascot/types.ts`, `SatelliteConfig` from `src/lib/satellites/types.ts`
- Produces: `type SequenceConfig`, `const DEFAULT_SEQUENCE: SequenceConfig`. Every later task imports these.

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/types.check.ts`:

```ts
/**
 * Pins DEFAULT_SEQUENCE. These are STARTING values, not owner-approved ones —
 * see spec §9. When the bench freeze gate (Task 13) lands, update BOTH the
 * config and these assertions in the same commit, so a drift cannot pass
 * silently.
 * Run: npm run verify:config
 */
import { DEFAULT_SEQUENCE } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) { failures++; console.error(`FAIL  ${label}`) }
  else { console.log(`ok    ${label}`) }
}

check('3 charge beats before commit', DEFAULT_SEQUENCE.GESTURES.BEATS_TO_COMMIT === 4)
check('wheel threshold is positive', DEFAULT_SEQUENCE.GESTURES.WHEEL_THRESHOLD > 0)
check('cooldown outlasts trackpad momentum', DEFAULT_SEQUENCE.GESTURES.COOLDOWN_MS >= 300)

check('three bounces', DEFAULT_SEQUENCE.TRANSIT.BOUNCE_COUNT === 3)
check('restitution loses energy', DEFAULT_SEQUENCE.TRANSIT.RESTITUTION > 0 && DEFAULT_SEQUENCE.TRANSIT.RESTITUTION < 1)
check('one duration per bounce', DEFAULT_SEQUENCE.TRANSIT.BOUNCE_MS.length === DEFAULT_SEQUENCE.TRANSIT.BOUNCE_COUNT)
check('bounce durations shorten', DEFAULT_SEQUENCE.TRANSIT.BOUNCE_MS.every((d, i, a) => i === 0 || d < a[i - 1]))

// Spec §5.6: the far point sits ~213px ABOVE the mark and the fall must cover
// ~400px before the promotion can fire. A short fall would try to promote while
// SAMSARA is still behind the logo.
check('fall is long enough to clear the mark', DEFAULT_SEQUENCE.TRANSIT.FALL_MS >= 900)

check('landed size is 40% of viewport height', DEFAULT_SEQUENCE.LANDING.SIZE_FRAC === 0.4)
check('mobile landed size is set independently', typeof DEFAULT_SEQUENCE.LANDING.MOBILE_SIZE_FRAC === 'number')
check('desktop lands right of centre', DEFAULT_SEQUENCE.LANDING.X_FRAC > 0.5)
check('mobile lands in the upper area', DEFAULT_SEQUENCE.LANDING.MOBILE_Y_FRAC < 0.5)

check('exit is quicker than the fall', DEFAULT_SEQUENCE.EXIT_MS < DEFAULT_SEQUENCE.TRANSIT.FALL_MS)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll sequence config checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --import tsx src/lib/samsara/types.check.ts
```

Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Write `types.ts`**

Create `src/lib/samsara/types.ts` exporting `SequenceConfig` with groups `GESTURES`, `FREEZE`, `TRANSIT`, `LANDING`, `ROOM`, `IDLE_EYES`, `CHATBOX`, `EXIT_MS`, `ENABLED`, and `DEFAULT_SEQUENCE` satisfying every assertion above. Every field carries a doc comment in the house style of `mascot/types.ts`.

Header comment must state, verbatim:

```ts
/**
 * SAMSARA transition — configuration.
 *
 * ⚠️ Unlike DEFAULT_MASCOT, these numbers are NOT owner-approved. They are
 * STARTING values, to be tuned live at /dev/samsara and frozen by the gate in
 * spec §9. No task downstream of that gate may treat them as approved.
 */
```

Starting values (spec §5.6, §6.3, §6.4):

```ts
GESTURES: { BEATS_TO_COMMIT: 4, WHEEL_THRESHOLD: 120, COOLDOWN_MS: 380, QUIET_MS: 120, TOUCH_THRESHOLD: 60 }
FREEZE:   { SHAKE_PX_PER_BEAT: [2, 3, 4], SHAKE_HZ: 14, CHARGE_PER_BEAT: [0.4, 0.7, 1.0] }
TRANSIT:  { HALF_ORBIT_MS: 600, FALL_MS: 1100, BOUNCE_COUNT: 3,
            RESTITUTION: 0.45, BOUNCE_MS: [500, 350, 250], SETTLE_MS: 500 }
LANDING:  { SIZE_FRAC: 0.4, MOBILE_SIZE_FRAC: 0.4,
            X_FRAC: 0.72, Y_FRAC: 0.52, MOBILE_X_FRAC: 0.5, MOBILE_Y_FRAC: 0.3,
            HOVER_BOB_PX: 8, HOVER_BOB_MS: 3200 }
CHATBOX:  { DELAY_MS: 2600, ENTER_MS: 400 }
EXIT_MS:  800
```

`FALL_MS` is 1100, not the spec table's original 800 — spec §5.6 flags that 800 predates the geometry and is too short to clear the mark.

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --import tsx src/lib/samsara/types.check.ts
```

Expected: PASS, all checks `ok`.

- [ ] **Step 5: Register in `verify:config`**

Append ` && node --import tsx src/lib/samsara/types.check.ts` to the `verify:config` script in `package.json`, then:

```bash
npm run verify:config
```

Expected: every existing suite still green, plus the new one.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/types.ts src/lib/samsara/types.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): sequence config shape and starting values"
```

---

## Task 3: `samsara/gestures.ts` — beat normalization

The single most device-dependent piece. One mouse notch is one `wheel` event; one trackpad flick is 20–50 with decaying deltas.

**Files:**
- Create: `src/lib/samsara/gestures.ts`
- Test: `src/lib/samsara/gestures.check.ts`

**Interfaces:**
- Consumes: `SequenceConfig['GESTURES']` from Task 2
- Produces:
  ```ts
  export type Beat = 'down' | 'up' | null
  export type GestureState = { reservoir: number; lastEventAt: number; armed: boolean }
  export function createGestureState(): GestureState
  export function feedWheel(s: GestureState, deltaY: number, nowMs: number, cfg: GesturesConfig): Beat
  export function feedTouchMove(s: GestureState, deltaY: number, nowMs: number, cfg: GesturesConfig): Beat
  export function endTouch(s: GestureState): void
  ```
  All mutate `s` in place and return the beat emitted on that event, or `null`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/gestures.check.ts`:

```ts
/**
 * Pins gesture normalization. The whole sequence's feel depends on one
 * trackpad flick counting as ONE beat, and this is not observable by eye —
 * a flick that fires four beats looks like the animation is broken, not like
 * the counter is wrong.
 * Run: npm run verify:config
 */
import { createGestureState, feedWheel, feedTouchMove, endTouch } from './gestures'
import { DEFAULT_SEQUENCE } from './types'

const cfg = DEFAULT_SEQUENCE.GESTURES
let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) { failures++; console.error(`FAIL  ${label}`) }
  else { console.log(`ok    ${label}`) }
}

// One mouse-wheel notch: a single event whose delta clears the threshold.
{
  const s = createGestureState()
  const beat = feedWheel(s, 120, 1000, cfg)
  check('one notch emits one down beat', beat === 'down')
}

// A trackpad flick: ~30 events, decaying, all within a few hundred ms.
// This MUST produce exactly one beat.
{
  const s = createGestureState()
  let beats = 0
  let t = 1000
  for (let i = 0; i < 30; i++) {
    const delta = 40 * Math.pow(0.88, i)
    if (feedWheel(s, delta, t, cfg)) beats++
    t += 8
  }
  check('a 30-event trackpad flick emits exactly ONE beat', beats === 1)
}

// Four deliberate notches, spaced beyond the cooldown, are four beats.
{
  const s = createGestureState()
  let beats = 0
  let t = 1000
  for (let i = 0; i < 4; i++) {
    if (feedWheel(s, 120, t, cfg)) beats++
    t += cfg.COOLDOWN_MS + cfg.QUIET_MS + 50
  }
  check('four spaced notches emit four beats', beats === 4)
}

// Direction reverses -> an up beat, used to step the charge back down.
{
  const s = createGestureState()
  const beat = feedWheel(s, -120, 1000, cfg)
  check('negative delta emits an up beat', beat === 'up')
}

// A small nudge below threshold emits nothing.
{
  const s = createGestureState()
  check('sub-threshold nudge emits nothing', feedWheel(s, 5, 1000, cfg) === null)
}

// Touch: accumulate across moves, emit once, and refuse a second beat until
// the finger lifts — however far it keeps travelling.
{
  const s = createGestureState()
  let beats = 0
  let t = 1000
  for (let i = 0; i < 20; i++) {
    if (feedTouchMove(s, 20, t, cfg)) beats++
    t += 16
  }
  check('one long swipe emits exactly ONE beat', beats === 1)
  endTouch(s)
  check('after touchend the next swipe can beat again', feedTouchMove(s, 80, t + 100, cfg) === 'down')
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll gesture checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --import tsx src/lib/samsara/gestures.check.ts
```

Expected: FAIL — cannot resolve `./gestures`.

- [ ] **Step 3: Implement `gestures.ts`**

```ts
/**
 * Wheel and touch events -> discrete beats.
 *
 * The problem this exists to solve: one mouse-wheel notch is ONE `wheel`
 * event, but one trackpad flick is 20-50 of them with decaying deltas. Counting
 * events fires the whole sequence off a single flick.
 *
 * Two gates, both required. A cooldown after each beat, AND a requirement that
 * the delta stream go quiet before re-arming — momentum alone cannot re-arm.
 *
 * Pure: no DOM, no listeners. The caller feeds it events and a clock.
 */
export type Beat = 'down' | 'up' | null

export type GesturesConfig = {
  WHEEL_THRESHOLD: number
  COOLDOWN_MS: number
  QUIET_MS: number
  TOUCH_THRESHOLD: number
}

export type GestureState = {
  reservoir: number
  lastEventAt: number
  lastBeatAt: number
  armed: boolean
  touchLatched: boolean
}

export function createGestureState(): GestureState {
  return { reservoir: 0, lastEventAt: -Infinity, lastBeatAt: -Infinity, armed: true, touchLatched: false }
}

export function feedWheel(s: GestureState, deltaY: number, nowMs: number, cfg: GesturesConfig): Beat {
  // Re-arm only once the stream has been quiet: momentum from the previous
  // flick keeps lastEventAt fresh, so it cannot re-arm on its own.
  if (!s.armed && nowMs - s.lastEventAt >= cfg.QUIET_MS && nowMs - s.lastBeatAt >= cfg.COOLDOWN_MS) {
    s.armed = true
    s.reservoir = 0
  }
  s.lastEventAt = nowMs
  if (!s.armed) return null

  s.reservoir += deltaY
  if (Math.abs(s.reservoir) < cfg.WHEEL_THRESHOLD) return null

  const beat: Beat = s.reservoir > 0 ? 'down' : 'up'
  s.reservoir = 0
  s.armed = false
  s.lastBeatAt = nowMs
  return beat
}

export function feedTouchMove(s: GestureState, deltaY: number, nowMs: number, cfg: GesturesConfig): Beat {
  s.lastEventAt = nowMs
  if (s.touchLatched) return null

  s.reservoir += deltaY
  if (Math.abs(s.reservoir) < cfg.TOUCH_THRESHOLD) return null

  const beat: Beat = s.reservoir > 0 ? 'down' : 'up'
  s.reservoir = 0
  s.touchLatched = true
  s.lastBeatAt = nowMs
  return beat
}

export function endTouch(s: GestureState): void {
  s.touchLatched = false
  s.reservoir = 0
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --import tsx src/lib/samsara/gestures.check.ts
```

Expected: PASS, 7 checks `ok`.

- [ ] **Step 5: Register and run the full suite**

Append to `verify:config`, then `npm run verify:config`. Expected: all green.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/gestures.ts src/lib/samsara/gestures.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): gesture normalization, one flick is one beat"
```

---

## Task 4: `samsara/cameraHandoff.ts` — matching two projections

The highest-consequence math in the feature. A mismatch is a visible jump at the seam.

**Files:**
- Create: `src/lib/samsara/cameraHandoff.ts`
- Test: `src/lib/samsara/cameraHandoff.check.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  ```ts
  export type PerspectiveSolution = { fovDeg: number; distance: number }
  export function solveHandoff(targetPx: number, worldDiameter: number, viewportH: number, fovDeg: number): PerspectiveSolution
  export function projectedPx(worldDiameter: number, distance: number, viewportH: number, fovDeg: number): number
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/cameraHandoff.check.ts`:

```ts
/**
 * Pins the orthographic -> perspective handoff.
 *
 * SAMSARA's orbit renders through an orthographic camera in CSS-pixel units;
 * the room needs perspective. At the seam the two must agree to sub-pixel or
 * the mascot visibly jumps size. This is exactly the class of error this
 * project has been burned by twice by trusting eyes over assertions.
 * Run: npm run verify:config
 */
import { solveHandoff, projectedPx } from './cameraHandoff'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) { failures++; console.error(`FAIL  ${label}`) }
  else { console.log(`ok    ${label}`) }
}
const near = (a: number, b: number, eps: number) => Math.abs(a - b) < eps

// Round trip: solve for a distance that renders a given pixel size, then
// project at that distance and get the size back.
for (const targetPx of [21, 28, 120, 360]) {
  for (const viewportH of [900, 844, 1200]) {
    const sol = solveHandoff(targetPx, 1.0, viewportH, 45)
    const back = projectedPx(1.0, sol.distance, viewportH, 45)
    check(
      `round trip ${targetPx}px @${viewportH}h -> ${back.toFixed(4)}px`,
      near(back, targetPx, 0.01),
    )
  }
}

// Monotonic: further away is smaller. If this ever inverts, the bounces would
// grow the wrong way and the fall would read backwards.
{
  const a = projectedPx(1.0, 10, 900, 45)
  const b = projectedPx(1.0, 20, 900, 45)
  const c = projectedPx(1.0, 40, 900, 45)
  check('further is smaller', a > b && b > c)
}

// A wider FOV at the same distance renders smaller.
{
  const narrow = projectedPx(1.0, 20, 900, 30)
  const wide = projectedPx(1.0, 20, 900, 60)
  check('wider fov renders smaller', wide < narrow)
}

// Deterministic fixture. Re-DERIVE if this fails; do not paste new output,
// that would defeat the lock.
// projectedPx(worldD=1, dist=20, viewportH=900, fov=45)
//   frustum height at 20 = 2 * 20 * tan(22.5deg) = 16.5685
//   px = 900 * (1 / 16.5685) = 54.32
{
  check('fixture 54.32px', near(projectedPx(1.0, 20, 900, 45), 54.32, 0.02))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll camera handoff checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --import tsx src/lib/samsara/cameraHandoff.check.ts
```

Expected: FAIL — cannot resolve `./cameraHandoff`.

- [ ] **Step 3: Implement `cameraHandoff.ts`**

```ts
/**
 * Solving the orthographic -> perspective seam.
 *
 * The orbit's camera is orthographic in CSS-pixel units, so MascotConfig.SIZE
 * means literal on-screen pixels. The room's camera is perspective. At the
 * handoff the mascot must occupy the SAME number of pixels either side, or it
 * jumps.
 *
 * Extracted rather than inlined into MascotEngine for the same reason
 * satellites/project.ts was extracted from SatelliteEngine: matching two
 * projections by eye is unreliable, and a sub-pixel jump on one viewport only
 * is not something a contact sheet reveals.
 *
 * Pure: no three.js, no DOM.
 */
export type PerspectiveSolution = { fovDeg: number; distance: number }

/** Visible world height of the frustum at a given distance. */
function frustumHeight(distance: number, fovDeg: number): number {
  return 2 * distance * Math.tan((fovDeg * Math.PI) / 360)
}

/** On-screen diameter, in CSS px, of a sphere of `worldDiameter` at `distance`. */
export function projectedPx(
  worldDiameter: number,
  distance: number,
  viewportH: number,
  fovDeg: number,
): number {
  return viewportH * (worldDiameter / frustumHeight(distance, fovDeg))
}

/**
 * Distance at which `worldDiameter` renders as exactly `targetPx`.
 * Inverts projectedPx analytically — no iteration, so it cannot half-converge.
 */
export function solveHandoff(
  targetPx: number,
  worldDiameter: number,
  viewportH: number,
  fovDeg: number,
): PerspectiveSolution {
  const wantedFrustumH = (worldDiameter * viewportH) / targetPx
  const distance = wantedFrustumH / (2 * Math.tan((fovDeg * Math.PI) / 360))
  return { fovDeg, distance }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --import tsx src/lib/samsara/cameraHandoff.check.ts
```

Expected: PASS — 12 round-trip checks plus 3 property checks plus the fixture.

- [ ] **Step 5: Register and run the full suite**

Append to `verify:config`, then `npm run verify:config`.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/cameraHandoff.ts src/lib/samsara/cameraHandoff.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): solve the ortho-to-perspective seam analytically"
```

---

## Task 5: `samsara/bounce.ts` — the damped arc

**Files:**
- Create: `src/lib/samsara/bounce.ts`
- Test: `src/lib/samsara/bounce.check.ts`

**Interfaces:**
- Consumes: `SequenceConfig['TRANSIT']` from Task 2
- Produces:
  ```ts
  export type BouncePose = { height: number; depth01: number; bounceIndex: number }
  export function bounceAt(t01: number, cfg: TransitConfig): BouncePose
  ```
  `height` is metres above the floor (0 at contact). `depth01` runs 0 at the back wall to 1 at the landed position. `bounceIndex` is -1 during the initial fall, then 0,1,2.

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/bounce.check.ts`:

```ts
/**
 * Pins the fall-and-bounce arc.
 * Run: npm run verify:config
 */
import { bounceAt } from './bounce'
import { DEFAULT_SEQUENCE } from './types'

const cfg = DEFAULT_SEQUENCE.TRANSIT
let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) { failures++; console.error(`FAIL  ${label}`) }
  else { console.log(`ok    ${label}`) }
}

const SAMPLES = 400
const poses = Array.from({ length: SAMPLES + 1 }, (_, i) => bounceAt(i / SAMPLES, cfg))

check('never goes below the floor', poses.every((p) => p.height >= -1e-9))
check('starts high', poses[0].height > 0)
check('ends at the hover, not on the floor', poses[SAMPLES].height > 0)

// Depth advances toward the viewer and never reverses.
check('depth is monotonic toward the camera', poses.every((p, i) => i === 0 || p.depth01 >= poses[i - 1].depth01 - 1e-9))
check('depth starts at the back wall', Math.abs(poses[0].depth01) < 1e-9)
check('depth ends at the landed position', Math.abs(poses[SAMPLES].depth01 - 1) < 1e-9)

// Exactly three bounces, and each apex is lower than the last.
{
  const apexes: number[] = []
  for (let b = 0; b < cfg.BOUNCE_COUNT; b++) {
    const inBounce = poses.filter((p) => p.bounceIndex === b)
    check(`bounce ${b} is reached`, inBounce.length > 0)
    apexes.push(Math.max(...inBounce.map((p) => p.height)))
  }
  check('apexes decay', apexes.every((h, i) => i === 0 || h < apexes[i - 1]))
  check('no fourth bounce', poses.every((p) => p.bounceIndex < cfg.BOUNCE_COUNT))
}

// Restitution actually governs the decay: apex ratio should track it.
{
  const apex0 = Math.max(...poses.filter((p) => p.bounceIndex === 0).map((p) => p.height))
  const apex1 = Math.max(...poses.filter((p) => p.bounceIndex === 1).map((p) => p.height))
  const ratio = apex1 / apex0
  check(
    `apex ratio ~ restitution (${ratio.toFixed(3)} vs ${cfg.RESTITUTION})`,
    Math.abs(ratio - cfg.RESTITUTION) < 0.06,
  )
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll bounce checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --import tsx src/lib/samsara/bounce.check.ts
```

Expected: FAIL — cannot resolve `./bounce`.

- [ ] **Step 3: Implement `bounce.ts`**

Model: normalise the total transit duration (`FALL_MS` + each of `BOUNCE_MS` + `SETTLE_MS`) onto `t01`. Within the initial fall, height follows a gravity parabola from the drop height to 0. Within bounce `b`, height follows a parabola whose apex is `dropHeight * RESTITUTION^(b+1)`. During `SETTLE_MS`, height eases from 0 to `HOVER_HEIGHT`. `depth01` advances by a fixed share per phase so it is monotonic by construction and reaches exactly 1 at `t01 = 1`.

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --import tsx src/lib/samsara/bounce.check.ts
```

Expected: PASS.

- [ ] **Step 5: Register and run the full suite**, then commit

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/bounce.ts src/lib/samsara/bounce.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): damped three-bounce arc with monotonic depth"
```

---

## Task 6: `samsara/transitScript.ts` — pose and the clearance gate

**Files:**
- Create: `src/lib/samsara/transitScript.ts`
- Test: `src/lib/samsara/transitScript.check.ts`

**Interfaces:**
- Consumes: `bounceAt` (Task 5), `projectOrbit` from `src/lib/satellites/project.ts`, `SequenceConfig` (Task 2)
- Produces:
  ```ts
  export type Box = { x: number; y: number; w: number; h: number }
  export type TransitPose = { x: number; y: number; sizePx: number; depth01: number }
  export function farPointAngle(): number            // Math.PI / 2
  export function transitPoseAt(t01: number, ctx: TransitContext): TransitPose
  export function hasClearedLogo(pose: TransitPose, logo: Box): boolean
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/samsara/transitScript.check.ts`:

```ts
/**
 * Pins the transit path and the promotion gate.
 *
 * The gate is the load-bearing one. Spec §5.6: at the far point SAMSARA sits
 * ~213px ABOVE the mark and INSIDE its horizontal span, drawing on the BACK
 * canvas. Promoting the layer there would pop it in front of the logo in a
 * single frame. It may only promote once its box has cleared the logo's box.
 * Run: npm run verify:config
 */
import { farPointAngle, transitPoseAt, hasClearedLogo, type Box } from './transitScript'
import { DEFAULT_SEQUENCE } from './types'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) { failures++; console.error(`FAIL  ${label}`) }
  else { console.log(`ok    ${label}`) }
}

// projectOrbit's depth term is maximal at sin(angle) = 1.
check('far point is angle pi/2', Math.abs(farPointAngle() - Math.PI / 2) < 1e-9)

// Desktop 1440x900 with shipped values. Logo half-height 183.6 (HEIGHT_FRAC
// 0.408 of 900), centred.
const ctx = {
  cfg: DEFAULT_SEQUENCE,
  W: 1440, H: 900, mobile: false,
  cx: 720, cy: 450, hh: 183.6,
  orbitR: 511.2, height: 136,
  plane: { TILT: 20, TILT_SIDEWAY: 160, PERSPECTIVE: 1300 },
  startSizePx: 21,
}
const logo: Box = { x: 720 - 183.6, y: 450 - 183.6, w: 367.2, h: 367.2 }

// Spec §5.6 worked example: the far point is ABOVE and slightly LEFT.
{
  const p0 = transitPoseAt(0, ctx)
  check(`t=0 is above the mark (y ${p0.y.toFixed(1)} < ${logo.y.toFixed(1)})`, p0.y < logo.y)
  check(`t=0 is left of centre (x ${p0.x.toFixed(1)} < 720)`, p0.x < 720)
  check('t=0 y offset ~ -213 from centre', Math.abs(p0.y - 450 + 213.2) < 6)
  check('t=0 x offset ~ -78 from centre', Math.abs(p0.x - 720 + 77.6) < 6)
}

// It must descend, and grow.
{
  const samples = Array.from({ length: 200 }, (_, i) => transitPoseAt(i / 199, ctx))
  check('descends overall', samples[199].y > samples[0].y)
  check('grows overall', samples[199].sizePx > samples[0].sizePx)
  check('lands at 40% of viewport height', Math.abs(samples[199].sizePx - 0.4 * 900) < 6)
}

// THE GATE. Not cleared at the start; cleared by the end; and once true it
// never goes back to false, or the layer would flip twice.
{
  const samples = Array.from({ length: 400 }, (_, i) => transitPoseAt(i / 399, ctx))
  const cleared = samples.map((p) => hasClearedLogo(p, logo))
  check('NOT cleared at the far point', cleared[0] === false)
  check('cleared by the end of the transit', cleared[399] === true)
  const firstTrue = cleared.indexOf(true)
  check('clearance is reached at all', firstTrue > 0)
  check('clearance never reverts', cleared.slice(firstTrue).every(Boolean))
  // Spec §5.6: this is ~400px of descent, NOT ~100ms. Guard against a future
  // edit that shortens the fall and silently promotes behind the mark.
  const dropAtClear = samples[firstTrue].y - samples[0].y
  check(`clearance needs a real descent (${dropAtClear.toFixed(0)}px >= 300)`, dropAtClear >= 300)
}

// Mobile portrait lands in the upper area, per the owner's composition.
{
  const m = { ...ctx, W: 390, H: 844, mobile: true, cx: 195, cy: 300, hh: 101 }
  const end = transitPoseAt(1, m)
  check('mobile lands in the upper half', end.y < 844 * 0.5)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll transit script checks passed.')
process.exit(failures ? 1 : 0)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --import tsx src/lib/samsara/transitScript.check.ts
```

Expected: FAIL — cannot resolve `./transitScript`.

- [ ] **Step 3: Implement `transitScript.ts`**

`transitPoseAt(0)` calls `projectOrbit(plane, cx, cy, orbitR, Math.PI/2, height, tiltRad)` so the start pose is derived from the *same* function the orbit uses and cannot drift from it. `transitPoseAt(1)` returns the landed pose from `cfg.LANDING` (breakpoint-aware). Between them, `bounceAt(t01)` supplies height and depth, mapped onto screen space. `hasClearedLogo` is a rectangle-intersection test between SAMSARA's projected box and the logo box, returning `true` when they do NOT intersect.

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --import tsx src/lib/samsara/transitScript.check.ts
```

Expected: PASS.

- [ ] **Step 5: Register and run the full suite**, then commit

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/transitScript.ts src/lib/samsara/transitScript.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): transit path and the logo-clearance promotion gate"
```

---

## Task 7: `MascotEngine` additive surface

**Files:**
- Modify: `src/lib/mascot/MascotEngine.ts`
- Test: `docs/superpowers/verification/samsara-orbit-unchanged.mjs`

**Interfaces:**
- Consumes: `cameraHandoff` (Task 4)
- Produces:
  ```ts
  setMode(m: 'orbit' | 'transit' | 'room'): void
  setTransform(t: { x: number; y: number; sizePx: number } | null): void
  setRoomVisible(v: boolean): void
  getFarPointPose(): { x: number; y: number; sizePx: number }
  ```

The existing behaviour becomes the `'orbit'` branch. Nothing in the orbit path changes semantics.

- [ ] **Step 1: Write the regression guard FIRST**

Create `docs/superpowers/verification/samsara-orbit-unchanged.mjs` — captures 60 frames of the hero at `prefers-reduced-motion: no-preference` with a fixed seed, records SAMSARA's screen position each frame via `window.__ttMascotInspect`, and asserts the trace is identical before and after this task's edit. Run it on the current code first and commit the baseline JSON alongside.

- [ ] **Step 2: Run it against unmodified code to capture the baseline**

```bash
node docs/superpowers/verification/samsara-orbit-unchanged.mjs --write-baseline
```

Expected: writes `samsara-orbit-baseline.json`.

- [ ] **Step 3: Add the mode surface**

Add a `private mode: 'orbit' | 'transit' | 'room' = 'orbit'` field and the four methods. In `tick()`, branch: `'orbit'` runs exactly the existing code path unchanged; `'transit'` and `'room'` use `this.transform` and the perspective camera instead of `projectOrbit`.

Add a second camera field `private persp = new THREE.PerspectiveCamera(...)` and a `private activeCamera` the render call reads.

- [ ] **Step 4: Run the regression guard**

```bash
node docs/superpowers/verification/samsara-orbit-unchanged.mjs
```

Expected: PASS — the orbit trace matches the baseline exactly.

- [ ] **Step 5: Run the full existing browser harness**

```bash
for f in docs/superpowers/verification/mascot-*.mjs docs/superpowers/verification/eyes-*.mjs; do node "$f" || echo "FAILED $f"; done
```

Expected: all twelve pass. Any failure means the additive surface was not additive.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/mascot/MascotEngine.ts docs/superpowers/verification
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(mascot): additive mode and perspective camera surface"
```

---

## Task 8: `samsara/room.ts` — geometry and lights

**Files:**
- Create: `src/lib/samsara/room.ts`

**Interfaces:**
- Consumes: `SequenceConfig['ROOM']` (Task 2)
- Produces: `export function buildRoom(cfg: RoomConfig): { group: THREE.Group; dispose(): void }`

- [ ] **Step 1: Build the room**

Floor plane, back wall, two side walls, no ceiling. Graphite-on-black per spec §6.1. **One** shadow-casting directional light with `shadow.mapSize` at 1024 or lower, plus ambient. `receiveShadow` on the floor, `castShadow` on the mascot mesh only.

- [ ] **Step 2: Measure frame rate before going further**

Add the room to the bench scene and run:

```bash
node docs/superpowers/verification/samsara-fps.mjs
```

Expected: ≥ 50 fps under software rasterisation. This project lost 5.9 fps to a shadow-adjacent bug once; if this is slow, halve the shadow map before proceeding, not after.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/room.ts docs/superpowers/verification/samsara-fps.mjs
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): the dark room, one shadow-casting key light"
```

---

## Task 9: `samsara/SequenceController.ts` — the state machine

**Files:**
- Create: `src/lib/samsara/SequenceController.ts`
- Test: `src/lib/samsara/SequenceController.check.ts`

**Interfaces:**
- Consumes: `gestures` (Task 3), `transitScript` (Task 6), `types` (Task 2)
- Produces:
  ```ts
  export type Mode = 'idle' | 'charge1' | 'charge2' | 'charge3' | 'committed' | 'landed' | 'exiting'
  export class SequenceController {
    get mode(): Mode
    beat(dir: 'down' | 'up'): void
    advance(dtMs: number): void
    get chargeLevel(): number   // 0..1, drives the logo separation
    get shakePx(): number
  }
  ```

- [ ] **Step 1: Write the failing test**

Assert: three down beats reach `charge3`; a fourth reaches `committed`; an up beat from `charge2` returns to `charge1`; an up beat from `charge1` returns to `idle`; **beats during `committed` are ignored**; `advance()` past the total transit duration reaches `landed`; an up beat from `landed` reaches `exiting`; `advance()` past `EXIT_MS` returns to `idle`; `chargeLevel` and `shakePx` both increase monotonically across charge1→3 and are exactly 0 in `idle`.

- [ ] **Step 2: Run it and watch it fail.** **Step 3: Implement.** **Step 4: Run and watch it pass.** **Step 5: Register in `verify:config`.**

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/samsara/SequenceController.ts src/lib/samsara/SequenceController.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): sequence state machine"
```

---

## Task 10: Hero DOM restructure — the shake wrapper

Spec §4.4. This must land **before** any promotion code, or the fall will be clipped intermittently and the cause will be hard to see.

**Files:**
- Modify: `src/components/blocks/HeroBlock.tsx`
- Test: `docs/superpowers/verification/samsara-fixed-clip.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: a hero DOM where `MascotLayer` has no transformed ancestor

- [ ] **Step 1: Write the failing test**

`samsara-fixed-clip.mjs` applies a `transform: translateX(3px)` to the hero's shake wrapper, then asserts via `getBoundingClientRect()` that a `position: fixed` probe element inside `MascotLayer`'s subtree still resolves against the **viewport**, not the hero. Assert its `top` is 0, not the hero's offset.

- [ ] **Step 2: Run it against current code and watch it fail**

```bash
node docs/superpowers/verification/samsara-fixed-clip.mjs
```

Expected: FAIL — the probe is clipped, because `MascotLayer` currently sits under the element that would carry the shake.

- [ ] **Step 3: Restructure**

Wrap the headline, `LogoStage` and `SatelliteField` in a single `<div className="tt-hero-shake">`. Move `MascotLayer` OUT of that wrapper so it is a direct child of the hero `<section>`, still **before** `LogoStage` in DOM order so the z 0/2 sandwich survives.

⚠️ `MascotLayer` must remain earlier in the DOM than `LogoStage` or the mascot stops being paintable-over and the depth flip breaks.

- [ ] **Step 4: Run the test and watch it pass.** Then re-run the mascot harness to prove the sandwich survived:

```bash
node docs/superpowers/verification/samsara-fixed-clip.mjs
node docs/superpowers/verification/mascot-sorting.mjs
node docs/superpowers/verification/mascot-occlusion.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/components/blocks/HeroBlock.tsx docs/superpowers/verification/samsara-fixed-clip.mjs
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "refactor(hero): shake wrapper, so a fixed mascot escapes overflow"
```

---

## Task 11: React wiring — `SamsaraSequence.tsx`

**Files:**
- Create: `src/components/hero/SamsaraSequence.tsx`
- Modify: `src/components/hero/MascotLayer.tsx`, `src/components/blocks/HeroBlock.tsx`

**Interfaces:**
- Consumes: `SequenceController` (Task 9), `MascotEngine` surface (Task 7), `room` (Task 8)
- Produces: `<SamsaraSequence config engineRef armed onLanded onExited />`

- [x] **Step 1: Wire gesture listeners**

Non-passive `wheel` and `touchmove` on the hero, `touchend`, feeding `gestures.ts` and then `SequenceController.beat()`. `preventDefault()` while mode is not `idle`.

- [x] **Step 2: Wire the Lenis pin**

`lenis.stop()` on leaving `idle`; `lenis.start()` on reaching `landed`. Add `touch-action: none` and `overscroll-behavior: none` to the hero while pinned. Lenis is created in `SmoothScroll.tsx` and is not currently exposed — export it via a module-level ref or a small context, whichever matches the file's existing style.

- [x] **Step 3: Wire the promotion gate**

Each frame in `committed`, compute the pose via `transitPoseAt` and call `hasClearedLogo`. On the first `true`: set the canvas root to `position: fixed`, raise its z-index above the hero, call `engine.setCameraMode('perspective')` with `solveHandoff`, and only THEN begin the room's fade-up.

- [x] **Step 4: Disable pointer-hold while the sequence owns the charge**

Spec §5.8. From beat 1 until `idle` returns, `engine.setShatterArmed(false)` on the logo engine.

- [x] **Step 5: Verify the seam**

```bash
node docs/superpowers/verification/samsara-seam.mjs
```

Expected: PASS — no size or position discontinuity greater than 1px across the promotion frame, at 1440×900, 1280×720 and 390×844.

- [x] **Step 6: Commit**

### ⚠️ What this task actually touched, beyond the file list above

Recorded rather than quietly absorbed — the plan's own list was short by four
files, each for a reason worth keeping:

- **`src/lib/mascot/MascotEngine.ts`** — additive only, as Task 7 established.
  Perspective placement in `place()` (the gap Task 8 explicitly left open),
  `getOrbitFrame()`, `setAngleOverride()`, `setRoomReveal()`, and a per-frame
  render snapshot for verification.
- **`src/lib/samsara/room.ts`** — `setReveal()`, because step 3's "fade-up" had
  no mechanism; `roomCameraFor()`, shared with the engine's dev handle so the
  bench cannot frame the room differently from the transition; and a backdrop
  quad, because `ROOM.BG_COLOR` was defined but never rendered and §5.7 needs
  the room to actually cover the hero.
- **`src/components/hero/LogoStage.tsx`** — step 4 says `setShatterArmed(false)`
  "on the logo engine", and the only route from the hero to that engine runs
  through `LogoStage`'s `armed`, which it computes itself. It gained a
  `holdEnabled` prop.
- **`src/components/providers/SmoothScroll.tsx`** — as step 2 instructs.

### ⚠️ Deviations from the steps as written

- **The pin starts on ARM, not on leaving `idle`** (step 2). Beat 1 is itself a
  wheel gesture and Lenis listens to the same event, so stopping it after the
  beat is counted is one event too late — §5.3 requires beat 1 to move nothing.
- **`preventDefault()` is unconditional while the sequence holds the hero**, not
  "while mode is not idle" (step 1), for the same reason.
- **`solveHandoff` is asked about the ROOM, not about SAMSARA** (step 3). The
  seam no longer depends on it: `place()` re-solves position and size at the
  body's live depth every frame, which is exact for the whole transit rather
  than only at the handoff instant. That frees the camera distance to serve
  composition, and the room's own height is what should decide it.

### ⚠️ Not wired, and Task 12 needs it before the owner sits down

**SAMSARA lands with its face turned away.** `SPIN_SPEED 113` keeps running
through the transit, so the landed rotation is whatever the clock happened to
reach. Spec §6.5 — "In the room SAMSARA is stationary, front-facing" — is not
implemented; only the pose, size and depth are.

This blocks part of Task 13: its step 2 has the owner tuning **idle eye weights**
live, which cannot be judged against the back of the mascot's head. Either the
bench parks the spin (`setInspect` already does exactly this) or the landing
eases `spin` to 0. It is small, and it belongs with the room's idle loop rather
than with the wiring.

**The logo's separation is not driven by the sequence.** Spec §4.4 says all three
3D layers shake during the freeze, "the logo shakes through its separation — the
sequence drives that charge from beat 1". The satellites and the mascot do shake
(they read the published charge through `chargeRef`); the mark itself does not,
because `ShatterController` has no external charge input and neither the plan's
file list nor Task 11's steps call for adding one. The freeze the owner tunes at
Task 13 is therefore one layer short of the spec until that is decided.


---

## Task 12: The bench at `/dev/samsara`

**Files:**
- Create: `src/app/(frontend)/[locale]/dev/samsara/page.tsx`

- [x] **Step 1: Build the bench** — `notFound()` in production, sliders for every group in `SequenceConfig`, a replay button, and a `copy json` button emitting the full config.

- [x] **Step 2: Apply the context-leak pattern** — `<canvas key={nonce}>`, `dispose(true)`, 220ms debounce on slider changes. `forceContextLoss()` is NOT an option; it permanently poisons a reused canvas.

- [x] **Step 3: Prove no leak**

```bash
node docs/superpowers/verification/samsara-context-leak.mjs
```

Expected: PASS — 25 rapid replays, canvas still live.

- [x] **Step 4: Commit**

### ⚠️ Notes from building it

- **`data-lenis-prevent` on the panel is required, not defensive.** The pin is
  `lenis.stop()`, and Lenis stops scrolling by preventing wheel events at the
  WINDOW — so it blocks the tuning panel's own overflow scrolling too. Measured:
  without the attribute a 900px wheel over the panel moved `scrollTop` from 0 to
  0. That is Task 13 being impossible, not a rough edge — the owner cannot reach
  any slider below the fold once the first beat lands.
- **The panel is a SIBLING of the stage**, so the sequence's unconditional
  `preventDefault()` on `wheel` never sees it. Both facts are needed; neither is
  sufficient alone.
- **The debounce landed on the room rebuild, not on "slider changes".** Every
  other control is a uniform and updates live. `ROOM.DEPTH` is geometry — floor,
  four walls and backdrop are sized from it at build time — so it needs
  `rebuildRoom()`, and a range input fires an `input` event per pixel.
- **`LogoCanvas` is mounted directly, not `LogoStage`**, to skip the 7.67s
  sketch intro. The intro's own timing is not judgeable here; it has
  /dev/ignition.
- **No `save` button, unlike the other benches.** These values belong in a NEW
  global (Task 15), and `hero-effects` carries owner-tuned values that diverge
  from code defaults — a partial payload written back to it is how those get
  lost.
- **Query-string overrides use dotted paths** (`?ENABLED=0&LANDING.Y_FRAC=0.62`),
  and `__ttSamsaraBench.set(path, value)` drives the same paths from a script.
  Task 17's kill-switch and reduced-motion checks both need `?ENABLED=0`;
  verified that it leaves `__ttSamsara` undefined, so the off path really is
  absent rather than half-running.
- **The spin is parked in the BENCH, per the owner's instruction** — a checkbox,
  on by default, applied while landed or exiting. Whether the LANDING should do
  this in the shipped hero is a Task 13 decision; turning the checkbox off shows
  exactly what ships today.

### Frame rate, measured on real hardware this time

`samsara-fps.mjs` had been measuring the room through the ORTHOGRAPHIC camera —
a ~40px smudge — which is where its old 30 fps floor came from. Corrected, and
measured on the owner's discrete GPU:

| | orbit | room | |
|---|---|---|---|
| SwiftShader (CPU raster) | 42 | 16 | ~58% cost |
| Intel UHD 630, D3D11 | 23 | 24 | vsync-bound |
| **RTX 3050 Laptop, D3D11** | **515** | **460** | **11% cost** |

Interleaved passes, frame-rate limit disabled. **460 fps is ~8× a 60Hz display.**
Risk 4 in spec §12 ("frame rate with a shadow-casting light") is closed.


---

## Task 13: ⛔ FREEZE GATE — owner tuning

**This task is not code. Do not proceed past it without the owner.**

- [x] **Step 1: Start the dev server and hand the owner `/en/dev/samsara`**

- [x] **Step 2: Owner tunes live** — gesture feel, shake ramp, fall duration (the 1100ms starting value is a guess and spec §5.6 flags it as probably still wrong), bounce damping, landed size and position at both breakpoints, room palette and lighting, idle eye weights, chatbox timing.

- [x] **Step 3: Owner presses `copy json`**

- [x] **Step 4: Paste the approved values into `DEFAULT_SEQUENCE`** in `src/lib/samsara/types.ts` and **update `types.check.ts` in the same commit** so the pinned assertions match the approved numbers.

- [x] **Step 5: Replace the header comment** in `types.ts` — remove the "NOT owner-approved" warning and replace it with the approval date, matching the style of `mascot/types.ts`.

- [x] **Step 6: Run the full suite**

```bash
npm run verify:config
```

- [x] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(samsara): freeze owner-approved sequence values"
```

### ✅ CLEARED 2026-08-31 (commit `88b9a80`)

The owner tuned live and pasted back. `DEFAULT_SEQUENCE` is frozen and the
"NOT owner-approved" header is gone. Downstream tasks may now treat these
numbers as approved.

**What the owner changed, and what it means beyond the number:**

| | was | now | consequence |
|---|---|---|---|
| `BEATS_TO_COMMIT` | 4 | **2** | one charge beat, then the commit |
| `WHEEL_THRESHOLD` | 120 | **205** | a real mouse notch (~120) is no longer one beat — it takes two |
| `FALL_MS` | 1100 | **950** | still the longest phase, so the arc holds |
| `RESTITUTION` | 0.45 | **0.8** | much livelier bounces |
| `SIZE_FRAC` | 0.4 | **0.435** | and `MOBILE_SIZE_FRAC` **0.35**, now set independently |
| `X_FRAC` | 0.72 | **0.59** | less far right |
| `CAMERA_FOV_DEG` / `DEPTH` | 45 / 26 | **55 / 42** | a wider, deeper room |
| `AMBIENT_INTENSITY` | 0.25 | **1.45** | much brighter |
| `MASCOT_TINT_STRENGTH` | 0 | **0.32** | the chrome→brass correction, turned on |

⚠️ **`CHARGE_PER_BEAT` is `[0.4, 0.7, 1]` with only ONE charge beat now**, so
entries 2 and 3 are dead and the freeze reaches **0.4** — a partial separation —
before the commit takes it to 1. That is what the owner saw on the bench and
approved. Raise `CHARGE_PER_BEAT[0]` if a fuller separation before the commit is
ever wanted; the array is deliberately left at length 3 so restoring more beats
does not produce a beat with no ramp behind it.

### Also landed here: spec §6.5's room idle loop

It did not exist. The orbit fires a glance on the **rising edge** of the face
turning toward the viewer, and once the spin is parked that edge never comes
again — a landed SAMSARA played exactly one expression and then rested on
neutral for the rest of the scene. The room now runs its own timer over its own
weight pool.

Owner: *"use all the expressions when parked and floating, for the rest of the
scene."* All 14 are in `IDLE_EYES.WEIGHTS`; the bench generates one slider per
expression from `EXPRESSION_ORDER`, so an expression can never exist in eyes.ts,
play on screen, and have no control — with nothing to indicate the gap.


---

## Task 14: `samsaraRoom` page block and the chatbox stub

**Files:**
- Create: `src/components/blocks/SamsaraRoomBlock.tsx`
- Modify: `src/blocks/index.ts`, `src/components/blocks/RenderBlocks.tsx`

- [ ] **Step 1:** Add `SamsaraRoomBlock` to `src/blocks/index.ts` with slug `samsaraRoom` and localized `chatHeading` and `chatPlaceholder` text fields. Append it to `pageBlocks`.
- [ ] **Step 2:** Build the component — a `100svh` dark section carrying `data-block="samsaraRoom"`, with the chatbox stub as real DOM: a labelled region, a heading, a disabled text input. Desktop top-left, mobile below SAMSARA, per the owner's composition.

⚠️ Anything scrollable inside the chatbox — a message list, most obviously — needs `data-lenis-prevent`. Task 12 paid for this: the pin is `lenis.stop()`, which prevents wheel events at the WINDOW, so it blocks nested overflow scrolling as well as the page. A message list that silently refuses to scroll while the room is pinned is exactly the shape of bug that survives casual testing.
- [ ] **Step 3:** Add the `case 'samsaraRoom'` to `RenderBlocks.tsx`.
- [ ] **Step 4:** Push the schema and confirm no stale temp tables:

The database is `tampa-taruno.db` (per `DATABASE_URI` in `.env`), and `better-sqlite3` is not installed. Query it through `@libsql/client`, which arrives transitively with `@payloadcms/db-sqlite`:

```bash
node -e "const{createClient}=require('@libsql/client');createClient({url:'file:./tampa-taruno.db'}).execute(\"SELECT name FROM sqlite_master WHERE name LIKE '__new_%'\").then(r=>console.log('stale temp tables:',r.rows))"
```

Expected: `[]`. Verified empty at plan time, so any hit is new and was caused by this task. Diff it against its non-`__new_` counterpart before dropping it — an interrupted Drizzle push left one of these blocking the dev server behind an unanswerable "DATA LOSS" prompt once before.

- [ ] **Step 5: Commit**

---

## Task 15: The `samsara-sequence` global and resolver

**Files:**
- Create: `src/globals/SamsaraSequence.ts`, `src/lib/samsara/resolveSamsara.ts`, `src/lib/samsara/resolveSamsara.check.ts`
- Modify: `src/payload.config.ts`, `package.json`

- [ ] **Step 1: Write the failing round-trip test** — perturb **every** mapped field to a non-default value first, then round-trip. Round-tripping defaults against themselves is the near-tautology the 2026-08-09 review caught in `resolveSeparation.check.ts`.
- [ ] **Step 2: Run it and watch it fail. Step 3: Implement the global and resolver. Step 4: Run and watch it pass.**
- [ ] **Step 5: Verify every numeric range has headroom** above its frozen value. Assert this in the check, not by reading — `wireSpeed` sat on its own ceiling for three sessions.
- [ ] **Step 6:** Attach `ColourSwatch` to every hex field, matching the existing Hero Effects pattern.
- [ ] **Step 7: Register in `verify:config` and commit**

---

## Task 16: Seed and the homepage layout swap

**Files:**
- Modify: `src/seed/index.ts`

- [ ] **Step 1:** Change the homepage seed to produce exactly two blocks: `hero`, `samsaraRoom`. Add defaults for the `samsara-sequence` global.
- [ ] **Step 2:** Confirm the five retired block definitions are STILL in `pageBlocks`. If they are not, stop — that is the data-loss path described in Task 1 Step 7.
- [ ] **Step 3: Reseed and clear the cache**

```bash
npm run seed
rm -rf .next/cache
```

- [ ] **Step 4: Verify the schema did not drop the retired blocks' tables**

```bash
node -e "const{createClient}=require('@libsql/client');createClient({url:'file:./tampa-taruno.db'}).execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'pages_blocks_%'\").then(r=>console.log(r.rows.map(x=>x.name)))"
```

Expected: the child tables for all five retired blocks are still present. Capture this list BEFORE the reseed as well, and diff — a table that disappears here is content destroyed, and it is the exact failure Task 1 Step 7 exists to prevent.

- [ ] **Step 5: Commit**

---

## Task 17: Reduced motion, kill switch, fail-open

- [ ] **Step 1:** Under `prefers-reduced-motion: reduce` — no pin, no listeners, no cinematic. Hero and Section 2 are ordinary stacked sections; SAMSARA is composed statically in the room, already landed.
- [ ] **Step 2:** `sequenceEnabled: false` removes the sequence from the DOM entirely — no listeners, no pin, no room, no promotion.
- [ ] **Step 3: Prove the kill switch can FAIL** — force the guard off and confirm the check goes red. A check that has never failed is not evidence. This project's mascot kill-switch check was wrong three separate times before it was right.
- [ ] **Step 4: Verify Section 2 stays reachable in all three degraded paths** — reduced motion, switch off, and WebGL unavailable.

```bash
node docs/superpowers/verification/samsara-reduced-motion.mjs
node docs/superpowers/verification/samsara-kill-switch.mjs
```

- [ ] **Step 5: Commit**

---

## Task 18: Full verification sweep

- [ ] **Step 1: Stop the dev server, build clean**

```bash
# stop dev first
npm run build
rm -rf .next
npm run dev
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Full config suite**

```bash
npm run verify:config
```

Expected: every suite green, assertion count materially above 864.

- [ ] **Step 4: SSR both locales**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/id
```

Expected: `200` twice.

- [ ] **Step 5: All five dev benches**

```bash
for r in ignition shatter satellites mascot samsara; do
  curl -s -o /dev/null -w "$r %{http_code}\n" "http://localhost:3000/en/dev/$r"
done
```

Expected: `200` five times.

- [ ] **Step 6: The full browser harness** — all eight new `samsara-*` scripts plus all twelve existing `mascot-*` and `eyes-*` scripts.

- [ ] **Step 7: Update `_HANDOFF/HANDOFF.md`** at `D:\TAMPA TARUNO\WEBSITE\_HANDOFF\` — NOT `_WEB_PRODUCT/_HANDOFF/`, which is a stray duplicate that has been created by accident before. Add a §000 section for this work and a pointer to `docs/archive/2026-08-30-homepage-sections/`.

- [ ] **Step 8: Final commit and hand back to the owner for merge approval**

---

## Self-Review

**Spec coverage:** §4 architecture → Tasks 4, 7, 10, 11. §4.4 transform collision → Task 10. §5 sequence → Tasks 3, 9, 11. §5.6 far point and promotion gate → Tasks 2, 6, 11. §5.9 reduced motion + §5.10 fail-open → Task 17. §6 room and landing → Tasks 5, 6, 8. §6.5 idle eye loop → Task 11. §6.6 chatbox → Task 14. §7 CMS → Tasks 14, 15. §7.7 page block → Task 14. §7.8 seed → Task 16. §8 bench → Task 12. §9 freeze gate → Task 13. §10 backups → Task 1. §11 verification → Tasks 7, 8, 10, 11, 12, 17, 18. No gaps found.

**Type consistency:** `SequenceConfig` and `DEFAULT_SEQUENCE` (Task 2) are consumed under those exact names in Tasks 3, 5, 6, 9, 15. `Beat` is `'down' | 'up' | null` in Task 3 and consumed as `'down' | 'up'` by `SequenceController.beat()` in Task 9 — the `null` case is filtered by the caller, which is correct and is stated in both interface blocks. `transitPoseAt` / `hasClearedLogo` / `Box` (Task 6) are used under those names in Task 11. `solveHandoff` / `projectedPx` (Task 4) are used in Tasks 7 and 11.

**Placeholder scan:** Tasks 8, 11, 12, 14–18 carry step descriptions rather than full code bodies. This is deliberate and bounded: every one of them is either (a) downstream of the Task 13 freeze gate, so writing literal values now would contradict spec §9, or (b) three.js/React wiring whose shape depends on the tuned values. Each still names exact files, exact commands, and exact expected output. The five pure modules — where the real risk lives — carry complete test code.

---

## Task 8b: The room's high-detail LOD (added 2026-08-30, owner requirement)

Spec §6.3b. The shipped 20k build was validated only to 70px; the room shows
SAMSARA at ~360px, where its silhouette facets and the forehead monogram —
modelled geometry, not texture — becomes unreadable.

**Files:**
- Create: `public/models/mascot.room.draco.glb` (2.1 MB, 200k tris, 2048² textures)
- Modify: `package.json` (`build:mascot:room`)
- Modify: `src/lib/mascot/MascotEngine.ts` (lazy detail swap)
- Test: `docs/superpowers/verification/samsara-detail.mjs`

**Interfaces:**
- Produces: `MascotEngine.loadDetail(url: string): Promise<void>` — loads the
  high-detail model and swaps it in, re-injecting the eye shader chunks.

- [x] **Step 1: Add the build script and generate the asset** — done. Verified
      reproducible (byte-identical size across two runs) and confirmed the hero's
      own `mascot.draco.glb` is untouched.

- [ ] **Step 2: `loadDetail()` on the engine**

⚠️ The eye shader is injected through `onBeforeCompile` on the materials during
`load()`. A naive second load produces a mascot with NO EYES — the socket mask
and expression uniforms live on the material that was just replaced. Re-injection
is the whole difficulty of this task, not the model swap.

- [ ] **Step 3: Trigger it lazily from the sequence**

Start the fetch when the sequence first leaves `idle` (beat 1), not at page load.
Swap the model when it arrives, under cover of the fall while SAMSARA is small
and moving. If it has not arrived by the landing, keep the 20k model — the room
must never wait on a 2.1 MB download.

- [ ] **Step 4: `samsara-detail.mjs`**

Assert the swap happened (triangle count or a published flag), that the eyes
still render after it (the failure mode above), and that the page is still
usable if the request 404s.

- [ ] **Step 5: Commit**
