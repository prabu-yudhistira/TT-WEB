# Hero CMS editing — live preview + constellation word editor — design

**Date:** 2026-08-22
**Status:** approved design, not yet implemented
**Owner request:** "Add constellation text editor in CMS" + "Add Hero Effects preview in CMS",
with the explicit constraint: **all changes must be rollback-able if there are errors.**

---

## 1. The problem

Two separate editing pains, both in `/admin`:

1. **Hero Effects is edited blind.** The `hero-effects` global exposes ~50 numeric/colour
   fields across nine groups (separation + ignition). Today the only way to see what a value
   does is the dev benches at `/[locale]/dev/shatter` and `/[locale]/dev/ignition` — which are
   `notFound()` in production. So once the site ships, the owner can change `cageOpacity` or
   `emberDensity` and has no way to see the result short of editing, saving, and reloading the
   homepage. The CMS exists so the owner is self-sufficient; on this global they are not.

2. **Constellation words are edited one row at a time.** `floatingWords` is a standard Payload
   array (up to 18 rows, one `word` text field each, localized). Entering or reordering a full
   word list means 18 rounds of "Add row → type → collapse". The 2026-08-10 rollback had to
   restore 12 words per locale by hand through the REST API — that job would have been one
   paste with this editor.

---

## 2. Goals / non-goals

**Goals**
- See the real hero react to Hero Effects edits **before saving**, from inside `/admin`.
- Works in **production**, not just dev — this is the "self-editing backend" promise.
- Edit the constellation word list as text (paste a list, reorder by moving lines).
- **Every change reversible** — see §7, which is a first-class requirement here, not a footnote.

**Non-goals**
- Not touching the effects themselves. No change to `LogoEngine`, the shaders, or any tuned value.
- Not replacing the dev benches. They keep their sliders and their "save to CMS" button; they
  remain the tuning tool. This is a *preview*, not a second tuning surface.
- Not adding new tunable parameters.
- Not previewing anything except the hero.

---

## 3. Approach — why Payload Live Preview, not a bespoke preview panel

The first approved design was a bespoke preview: a small `HeroEffectPreview` component mounting
`LogoEngine` directly, embedded beside the fields, fed by `useAllFormFields`. Grounding in the
code killed it, for a reason worth recording:

**`ConstellationField` cannot be shrunk into an admin card.** It positions words against
`window.innerWidth`/`innerHeight` directly, and derives its logo keep-out box from
`CALIB.HEIGHT_FRAC` + `videoCoverScale()` against the viewport. A compact embedded canvas would
either require modifying that already-tuned component (it has been the subject of at least two
prior bug fixes — the mobile keep-out box, and the cover-scale keep-out fix in `d027c3d`), or
the preview would show physics that are not the real physics. A preview that lies is worse than
no preview.

Payload ships **Live Preview** (verified present in the installed `payload@3.86.0`:
`RootLivePreviewConfig` in `node_modules/payload/dist/config/types.d.ts:125` accepts
`globals?: string[]` as well as `collections?: string[]`). It renders a **real URL in an iframe**
beside the edit form and pushes unsaved form state into it over `postMessage`. That means the
preview *is* the shipping component tree at a real viewport size — `ConstellationField` untouched,
`LogoEngine` untouched, `HeroBlock` untouched.

**The decisive structural fact:** `HeroBlock` is already a pure props-only client component.
`RenderBlocks.tsx:28-45` does every CMS fetch server-side and hands it plain
`SeparationConfig` / `IgnitionConfig` / `string[]`. So a preview route can mount the *real*
`HeroBlock` with live-edited props and zero modifications to it.

---

## 4. Architecture

### 4.1 The preview route

New: `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx` (+ a small client component).

Renders the real `HeroBlock`, with props assembled from three sources merged in priority order:

```
saved values (server fetch, same as the homepage)
  └─ overridden by ─> live unsaved values for whichever document is being edited
       └─ mapped through ─> resolveSeparation() / resolveIgnition()  [unchanged]
```

`resolveSeparation` and `resolveIgnition` are reused **exactly as-is**. They already merge a
partial, null-riddled CMS shape over frozen defaults and clamp phase boundaries — which is
precisely what half-typed live form state looks like. This is the single most important reuse in
the design: live preview data is *less* trustworthy than saved data, and these functions were
already built to be the guard for that.

Hero-only, at a real viewport — so the effects read at the size they actually ship at.

### 4.2 Which document is live — explicit, not sniffed

Live Preview posts *the document currently being edited*. This route can be opened from two
different edit screens (`hero-effects` global, or the `pages` collection for the Hero block's
words), and the posted payload does not announce which one it is.

**Do not shape-sniff.** The `livePreview.url` config is a function receiving
`collectionConfig` / `globalConfig` (types.d.ts:112-123), so it appends an explicit marker:

- from the global → `/{locale}/admin-preview/hero?source=hero-effects`
- from the page   → `/{locale}/admin-preview/hero?source=page`

The route reads `source` and applies the live payload only to that half, leaving the other half
on its saved values. Deterministic, and it fails loudly (unknown `source` → ignore live data,
render saved) rather than silently mis-assigning fields.

### 4.3 Ignition replay

Ignition is one-shot and tied to the sketch-video handoff; it does not loop. Per owner decision,
edits update state quietly and a **"Replay" button** in the preview re-runs the sequence on
demand — the remount-the-engine pattern `IgnitionLab` already uses. Rejected: auto-replay on
every settled keystroke, which across ~50 fields would be visually noisy.

Separation needs no button — press-and-hold on the logo is the real interaction.

### 4.4 The constellation word editor

Replace **only the UI** of `floatingWords` via `admin.components.Field`, with a textarea:
one word per line, order = priority (matching the field's existing documented semantics —
"order = priority (small screens show only the first 8)").

Writes back through `useForm()`'s `addFieldRow` / `removeFieldRow` / `dispatchFields` — the same
API Payload's own Array field uses internally (verified in
`@payloadcms/ui/dist/fields/Array/index.js:152-180`), so rows stay in Payload's normal form
state, participate in validation, and save through the ordinary path.

Shows live count against the 8–18 guidance and enforces the existing 24-char-per-word limit
inline. Because this is a component swap on an unchanged field, **the stored shape is identical**
— which is what makes §7's rollback for this piece trivial.

### 4.5 Config

`payload.config.ts` gains:

```ts
admin: {
  livePreview: {
    globals: ['hero-effects'],
    collections: ['pages'],
    url: ({ locale, globalConfig }) => `${BASE}/${locale?.code ?? 'en'}/admin-preview/hero`
                                       + `?source=${globalConfig ? 'hero-effects' : 'page'}`,
  },
}
```

`BASE` from `NEXT_PUBLIC_SITE_URL` (the var HANDOFF §6 already designates for deploy), falling
back to `http://localhost:3000`.

---

## 5. What this deliberately does NOT change

Listed because the blast radius *is* the risk assessment:

| Untouched | Why it matters |
|---|---|
| `LogoEngine.ts`, all shaders, `ignition/`, `shatter/` | No effect behaviour can regress |
| `ConstellationField.tsx` | The component that motivated abandoning the bespoke design |
| `HeroBlock.tsx`, `LogoStage.tsx` | Already props-only; reused verbatim |
| `resolveSeparation` / `resolveIgnition` | Reused as the live-data guard |
| `RenderBlocks.tsx` and the real homepage | The public page's data flow is not modified |
| **Every field's `name` / `type` / structure** | **⇒ no DB schema change — see §7.2** |
| The dev benches | Still the tuning surface |

---

## 6. Failure modes

| Failure | Result | Handling |
|---|---|---|
| Preview opened outside an iframe (direct URL hit) | No postMessage ever arrives | Renders saved values — a normal hero. Harmless. |
| Malformed / partial live payload | Half-typed numbers, nulls | `resolve*()` already falls back per-field to frozen defaults |
| Unknown or missing `?source` | Cannot attribute live data | Ignore live data, render saved values |
| `postMessage` from an unexpected origin | Untrusted data | `useLivePreview`'s `serverURL` origin check |
| Word textarea has a bug | Owner cannot edit words | Delete one `admin.components` line → Payload's default array editor returns, data intact (§7.3) |
| Live Preview config itself errors | Could affect edit screens | Delete the `livePreview` block → §7.3 |

**Route is `noindex`** — it is a second page rendering the same hero, and must not compete with
the homepage in search or get crawled. No auth gate: it renders only content that is already
public on the homepage, and gating it would break the iframe's cookie context for no security
gain.

---

## 7. Rollback plan  *(explicit owner requirement)*

### 7.1 The lesson being designed against

Sub-project 3 (orbiting orbs) was rolled back on 2026-08-10. `git checkout main` reverted all the
code in one step — but **the database did not follow git**. 18 orb-only columns remained on
`hero_effects` and had to be dropped by hand with `ALTER TABLE ... DROP COLUMN`, and 12
`floatingWords` per locale had to be restored through the REST API. *Code rollback was free; data
rollback was manual and error-prone.*

So the rollback design goal here is: **make the data side empty.**

### 7.2 Change classification by rollback cost

| # | Change | Rollback cost |
|---|---|---|
| 1 | New preview route (new files) | **Free** — delete / `git revert`; nothing else references them |
| 2 | `admin.livePreview` config block | **Free** — one config block, additive |
| 3 | `admin.components.Field` on `floatingWords` | **Free** — one line; the default editor returns |
| 4 | `@payloadcms/live-preview-react` dependency | **Cheap** — revert 2 files, `npm ci` (§7.4) |

| 5 | `importMap.js` regeneration | **Free** — git-tracked generated file |
| 6 | **Database schema** | **NONE EXPECTED — must be verified, §7.5** |
| 7 | **Content/data** | **NONE** — nothing migrates or rewrites existing content |

Rows 6 and 7 being empty is the point of the whole design. Every change is code or config;
nothing writes to the database. That is what makes this safe to abandon at any point.

**On row 4, the dependency — pre-verified, because this session opened with a dependency
disaster.** `npm install` was broken on 2026-08-22 by an uncommitted bump to `next@^15.5.23`,
which `@payloadcms/next`'s peer range excludes outright. So this addition was checked *before*
being written into the spec:

- `@payloadcms/live-preview-react@3.86.0` exists and **exactly matches** the installed
  `payload` / `@payloadcms/next` version (3.86.0). Version-matched, not floating.
- Its peer deps are **only** `react` / `react-dom` — no `next`, no `payload` peer. It is
  structurally incapable of the peer conflict that broke this session.
- Installed `react` is 19.2.7, which satisfies the range (note the range is `^19.0.1`, *not*
  `^19.0.0` — a 19.0.0 install would NOT have satisfied it).
- `npm install --dry-run` adds exactly 2 packages (it plus `@payloadcms/live-preview@3.86.0`),
  with no `ERESOLVE`, no removals, and no version churn in existing packages.

Pin it exactly (`3.86.0`, no `^`) so it cannot drift away from the Payload version it must match.

### 7.3 Kill switches (no revert needed)

Both features can be disabled independently, in seconds, without touching git history:

- **Disable the preview:** delete the `livePreview` block from `payload.config.ts`. The edit
  screens return to normal; the orphan route is unreachable from `/admin` and harmless.
- **Disable the word editor:** delete `admin.components` from the `floatingWords` field.
  Payload's stock array editor comes straight back, **with all existing words intact** — because
  the stored shape never changed.

These are the first thing to try if something misbehaves mid-session.

### 7.4 Full revert

Work happens on branch `feat/hero-cms-preview`, **not merged until the owner has seen it working**
— the same discipline that made the orbs rollback survivable (that branch was never merged, so
`git checkout main` was sufficient).

```bash
git checkout main                 # code gone, main untouched throughout
npm ci                            # restores node_modules to the lockfile exactly
rm -rf .next                      # MANDATORY — see below
```

`rm -rf .next` is not optional: this session already proved that a `.next` cache written under one
dependency set produces phantom `ENOENT` / "untagged enum Config" errors under another, which
look exactly like real code failures and cost real diagnosis time.

### 7.5 Verifying the "no schema change" claim (do not assume it)

`admin.components` is UI-only and does not alter Payload's schema derivation — but that is the
kind of assumption that produced the 18 stray columns last time. Verify empirically:

1. **Before starting:** back up the DB (`cp tampa-taruno.db tampa-taruno.backup-YYYYMMDD.db`) and
   record the baseline column set:
   `SELECT name FROM pragma_table_info('hero_effects');` and the `pages`/`floatingWords` tables.
2. **On first dev-server start after the change:** Payload prints `Pulling schema from database…`.
   **Any "DATA LOSS" prompt or schema-push activity is a red flag** — it means this design's core
   assumption is wrong; stop and re-examine rather than accepting the prompt.
3. **After implementing:** diff the column set against the baseline. It must be identical.
4. Also check for stale temp tables, which have bitten this project before:
   `SELECT name FROM sqlite_master WHERE name LIKE '__new_%';`

---

## 8. Verification

Following this project's established discipline — the in-app browser pane **cannot** verify hero
effects (it reports the tab hidden and throttles rAF to ~1 Hz), so real verification uses headless
Chrome via `puppeteer-core` from the scratchpad.

1. **No regression on the real homepage** — the existing harness
   (`docs/superpowers/verification/`) must still pass unchanged, in particular
   `t9-reduced-motion.mjs` and `t9-reduced-motion-pose.mjs`. The public page is not supposed to
   change at all; these prove it.
2. `npm run verify:config` — all 5 suites (the resolve/controller checks) still green.
3. `tsc --noEmit` clean.
4. **Live preview actually updates**: drive the `hero-effects` edit screen, change a
   high-contrast field (`cageOpacity`, `emberDensity`), assert the iframe's rendered pixels change
   *without saving*.
5. **Source attribution**: confirm editing the page's words does not clobber effects values, and
   vice-versa (the §4.2 failure mode).
6. **Word editor round-trip**: paste 12 words → save → confirm the stored array matches exactly,
   in both `en` and `id` (it is a localized field), and that the live homepage renders them.
7. **Schema untouched**: §7.5 step 3.
8. Both locales; production build (`next build`) succeeds, since the route ships to production.

---

## 9. Sequencing

Ordered so the cheapest, most independent piece lands first and each step is separately
revertible:

1. **Word editor** — no dependency on live preview; delivers value alone.
2. **Dependency + `livePreview` config** — verify `/admin` still healthy before building on it.
3. **Preview route** — the real work.
4. **Full verification sweep** (§8), then show the owner *before* merging.

---

## 10. Open questions

- **Locale in the preview URL.** Live Preview passes the editing locale; the hero is localized
  (words) while effects are not. Plan: follow the admin's active locale.
- **`openByDefault`.** Payload can auto-open the preview pane on first visit
  (`LivePreviewConfig.openByDefault`, default `false`). Leaving it `false` initially — it can be
  flipped later once the owner has decided they want it every time.
- **Breakpoints.** Live Preview supports named device breakpoints in its toolbar. Worth adding a
  `640px` entry later, since that is this project's real mobile boundary
  (`MOBILE_HEIGHT_FRAC`, `CAGE_DENSITY_MOBILE`), but not required for v1.
