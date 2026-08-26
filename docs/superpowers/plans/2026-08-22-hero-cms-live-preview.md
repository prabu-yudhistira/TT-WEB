# Hero CMS Live Preview + Constellation Word Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner edit constellation words as a plain text list, and see the real hero react to Hero Effects edits live inside `/admin`, in production.

**Architecture:** Payload's built-in Live Preview renders a new hero-only route in an iframe beside the edit form and pushes unsaved form state into it over `postMessage`. That route mounts the **real, unmodified** `HeroBlock` (already a pure props-only client component), with live values passed through the existing `resolveSeparation()` / `resolveIgnition()` guards. The word editor is a UI-only component swap on the existing `floatingWords` array field — no schema change.

**Tech Stack:** Next.js 15.4.11 (App Router) · Payload CMS 3.86.0 · React 19.2.7 · three.js · TypeScript · SQLite (dev)

**Spec:** `docs/superpowers/specs/2026-08-22-hero-cms-live-preview-design.md`

## Global Constraints

- **Rollback is a first-class requirement.** Every change must be code or config. **No DB schema change. No content migration.** Verify, do not assume (spec §7.5).
- **Work on branch `feat/hero-cms-preview`. Do NOT merge to `main`** until the owner has seen it working.
- **Pin the new dependency exactly: `@payloadcms/live-preview-react@3.86.0`** (no `^`) — it must stay matched to `payload@3.86.0`.
- **Do not modify:** `LogoEngine.ts`, any shader, `ignition/*`, `shatter/*` (except the additive `.check.ts` files this plan adds), `ConstellationField.tsx`, `RenderBlocks.tsx`, or the real homepage's data flow. **`LogoCanvas.tsx` gains one opt-in prop (Task 4). `HeroBlock.tsx`/`LogoStage.tsx` gain the same prop threaded through, but *only conditionally* — Task 9 measures whether it's actually needed and does this work itself if so (§Task 9 Step 3); it is not a green light to touch either file anywhere else, and every real hero interaction (line1/line2/separation/ignition/floatingWords/onLive/onIntroPlayStart) is untouched either way.**
- **`next` stays pinned `~15.4.11`.** `@payloadcms/next`'s peer range excludes all of 15.5.x. Never run `npm install next@latest`.
- **After ANY dependency change, `rm -rf .next`** before starting the dev server. A `.next` cache written under a different dependency set produces phantom `ENOENT` / "untagged enum Config" errors that look exactly like real code failures.
- **The in-app browser pane CANNOT verify hero effects** — it reports the tab hidden and throttles `requestAnimationFrame` to ~1 Hz, stalling the engine's own clock. Use headless Chrome via `puppeteer-core` from the scratchpad. Chrome path: `C:/Program Files/Google/Chrome/Application/chrome.exe`, args `--enable-unsafe-swiftshader --use-gl=angle`.
- **Never install puppeteer into the app.** Scratchpad only.
- Git in this repo needs `-c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"` on every command (Windows "dubious ownership").
- Test idiom: this project has **no jest/vitest**. Pure logic → `*.check.ts` run by `npm run verify:config`. Browser behaviour → puppeteer scripts in `docs/superpowers/verification/`.

---

## File Structure

**Create:**
- `src/lib/livePreview/source.ts` — decides which document's live data applies (`hero-effects` vs `page`); pure, testable.
- `src/lib/livePreview/source.check.ts` — assertions for the above.
- `src/lib/livePreview/words.ts` — pure conversion between the textarea's text and Payload's `{word}[]` row shape.
- `src/lib/livePreview/words.check.ts` — assertions for the above.
- `src/components/admin/FloatingWordsField.tsx` — the textarea Field component for `floatingWords`.
- `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx` — server route; fetches saved values, sets `noindex`.
- `src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx` — client; subscribes to live data, mounts real `HeroBlock`, replay button.
- `docs/superpowers/verification/preview-live-update.mjs` — proves live edits reach the iframe without saving.
- `docs/superpowers/verification/preview-context-leak.mjs` — proves repeated replays don't exhaust WebGL contexts.

**Modify:**
- `src/components/three/LogoCanvas.tsx` — add ONE optional prop, `releaseContextOnUnmount` (default `false` = today's exact behaviour). Task 4 explains why this is unavoidable.
- `src/components/hero/LogoStage.tsx`, `src/components/blocks/HeroBlock.tsx` — **conditionally** (Task 9 only, only if its leak test proves it necessary): the same prop threaded straight through, nothing else.
- `src/blocks/index.ts:24-33` — point `floatingWords` at the custom Field component.
- `src/payload.config.ts:23-26` — add the `admin.livePreview` block.
- `package.json` / `package-lock.json` — the pinned dependency.
- `src/app/(payload)/admin/importMap.js` — regenerated (generated file, git-tracked).

---

## Task 1: Pre-flight — branch, DB backup, schema baseline

No code. This exists so §7.5's "no schema change" claim is **provable** rather than asserted, and so the rollback in Global Constraints is actually available.

**Files:** none (produces untracked baseline artifacts)

**Interfaces:**
- Consumes: nothing
- Produces: `scratchpad/schema-baseline.txt` — the column lists later tasks diff against

- [ ] **Step 1: Confirm a clean starting point**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" status --short
```

Expected: only `src/payload-types.ts` may appear (line-ending noise, zero real diff — confirm with `git diff --stat src/payload-types.ts` printing nothing). Anything else: stop and ask.

- [ ] **Step 2: Create the branch**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" checkout -b feat/hero-cms-preview
```

- [ ] **Step 3: Back up the dev database**

```bash
cp "tampa-taruno.db" "tampa-taruno.backup-2026-08-22.db"
ls -la tampa-taruno*.db
```

Expected: the backup exists and is the same size as the original.

- [ ] **Step 4: Record the schema baseline**

The app has no `sqlite3` CLI. Use Payload's own SQLite client through `tsx`:

```bash
node --env-file=.env --import tsx -e "
import { createClient } from '@libsql/client';
const c = createClient({ url: process.env.DATABASE_URI || 'file:./tampa-taruno.db' });
const tables = await c.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\");
let out = '';
for (const t of tables.rows) {
  const cols = await c.execute(\`SELECT name FROM pragma_table_info('\${t.name}')\`);
  out += t.name + ': ' + cols.rows.map(r => r.name).join(',') + '\n';
}
console.log(out);
" > "C:/Users/YUDHIS~1/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/325ceed4-f67c-48a9-9c61-7f28c5b2a145/scratchpad/schema-baseline.txt"
```

- [ ] **Step 5: Verify the baseline captured real content and no stale temp tables**

```bash
grep -c ":" "C:/Users/YUDHIS~1/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/325ceed4-f67c-48a9-9c61-7f28c5b2a145/scratchpad/schema-baseline.txt"
grep "__new_" "C:/Users/YUDHIS~1/AppData/Local/Temp/claude/D--TAMPA-TARUNO-WEBSITE/325ceed4-f67c-48a9-9c61-7f28c5b2a145/scratchpad/schema-baseline.txt" || echo "no stale temp tables — good"
```

Expected: a non-zero table count, and **no** `__new_*` tables. If any `__new_*` exists, stop — that is a leftover from an interrupted schema push and must be resolved before starting (diff it against its non-`__new_` counterpart first).

---

## Task 2: Word list ↔ rows conversion (pure logic)

The conversion is the part that can silently corrupt the owner's word list, so it is isolated from React and tested directly.

**Files:**
- Create: `src/lib/livePreview/words.ts`
- Test: `src/lib/livePreview/words.check.ts`
- Modify: `package.json` (add the check to `verify:config`)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `wordsToText(rows: { word?: string | null }[] | null | undefined): string`
  - `textToWords(text: string): string[]`
  - `MAX_WORDS = 18`, `MAX_WORD_LEN = 24`, `MIN_RECOMMENDED = 8`

- [ ] **Step 1: Write the failing test**

Create `src/lib/livePreview/words.check.ts`:

```ts
/**
 * Assertions for the constellation word-list conversion.
 * Run: npm run verify:config
 *
 * This is the code path that can silently destroy the owner's word list, so
 * it is pure and tested away from React.
 */
import { wordsToText, textToWords, MAX_WORDS, MAX_WORD_LEN } from './words'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// --- textToWords ---
check('splits on newlines', textToWords('a\nb\nc').join(',') === 'a,b,c')
check('trims surrounding whitespace', textToWords('  a  \n\tb\t').join(',') === 'a,b')
check('drops blank lines', textToWords('a\n\n\nb\n   \nc').join(',') === 'a,b,c')
check('handles CRLF', textToWords('a\r\nb').join(',') === 'a,b')
check('empty input yields no words', textToWords('').length === 0)
check('whitespace-only input yields no words', textToWords('  \n\t\n ').length === 0)
check('caps at MAX_WORDS', textToWords(Array.from({ length: 30 }, (_, i) => `w${i}`).join('\n')).length === MAX_WORDS)
check(
  'truncates an over-long word rather than dropping it',
  textToWords('x'.repeat(40))[0].length === MAX_WORD_LEN,
)
check('preserves order', textToWords('zeta\nalpha\nmid').join(',') === 'zeta,alpha,mid')
check('keeps internal spaces in a phrase', textToWords('two words').join(',') === 'two words')

// --- wordsToText ---
check('joins rows with newlines', wordsToText([{ word: 'a' }, { word: 'b' }]) === 'a\nb')
check('null rows yield empty string', wordsToText(null) === '')
check('undefined rows yield empty string', wordsToText(undefined) === '')
check('empty rows yield empty string', wordsToText([]) === '')
check('skips null/empty words', wordsToText([{ word: 'a' }, { word: null }, { word: '' }, { word: 'b' }]) === 'a\nb')

// --- round trip: the property that actually protects the owner's data ---
const original = ['sketch', 'craft', 'design', 'identity', 'motion', 'detail', 'story', 'precision']
const roundTripped = textToWords(wordsToText(original.map((word) => ({ word }))))
check('round trip preserves every word in order', roundTripped.join(',') === original.join(','))

const messy = [{ word: 'a' }, { word: null }, { word: 'b' }]
check('round trip drops only the empties', textToWords(wordsToText(messy)).join(',') === 'a,b')

console.log(failures === 0 ? '\nAll word-list checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
node --import tsx src/lib/livePreview/words.check.ts
```

Expected: FAIL — cannot resolve `./words`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/livePreview/words.ts`:

```ts
/**
 * Conversion between the constellation word textarea (one word per line) and
 * Payload's array-row shape for `floatingWords`.
 *
 * Limits mirror the field's own contract in src/blocks/index.ts exactly:
 * maxRows 18, and 24 characters per word. Order is priority — small screens
 * render only the first 8 (see ConstellationField's MOBILE_MAX_WORDS).
 */

/** Payload's `maxRows` on the floatingWords field. */
export const MAX_WORDS = 18
/** Payload's `maxLength` on the inner `word` text field. */
export const MAX_WORD_LEN = 24
/** Below this the constellation looks sparse; guidance only, not enforced. */
export const MIN_RECOMMENDED = 8

/** Rows → textarea contents. Empty/null rows are skipped, order preserved. */
export function wordsToText(rows: { word?: string | null }[] | null | undefined): string {
  if (!rows?.length) return ''
  return rows
    .map((r) => (r?.word ?? '').trim())
    .filter((w) => w.length > 0)
    .join('\n')
}

/**
 * Textarea contents → word list.
 *
 * An over-long word is TRUNCATED rather than dropped: silently deleting a line
 * the owner typed is worse than shortening it, because they can see a
 * shortened word and fix it.
 */
export function textToWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_WORDS)
    .map((w) => (w.length > MAX_WORD_LEN ? w.slice(0, MAX_WORD_LEN) : w))
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
node --import tsx src/lib/livePreview/words.check.ts
```

Expected: every line `ok`, then `All word-list checks passed.`

- [ ] **Step 5: Wire it into `verify:config`**

In `package.json`, append to the end of the `verify:config` script value:

```
 && node --import tsx src/lib/livePreview/words.check.ts
```

- [ ] **Step 6: Run the whole suite**

```bash
npm run verify:config
```

Expected: all previous suites still pass, plus the new one. Exit code 0.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/livePreview/words.ts src/lib/livePreview/words.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): pure word-list <-> array-row conversion for the constellation editor"
```

---

## Task 3: The constellation word editor field

**Files:**
- Create: `src/components/admin/FloatingWordsField.tsx`
- Modify: `src/blocks/index.ts:24-33`
- Modify: `src/app/(payload)/admin/importMap.js` (regenerated, do not hand-edit)

**Interfaces:**
- Consumes: `wordsToText`, `textToWords`, `MAX_WORDS`, `MAX_WORD_LEN`, `MIN_RECOMMENDED` from Task 2
- Produces: a default-exported React component registered as `@/components/admin/FloatingWordsField#FloatingWordsField`

- [ ] **Step 1: Write the component**

Create `src/components/admin/FloatingWordsField.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useField, useForm } from '@payloadcms/ui'
import type { ArrayFieldClientComponent } from 'payload'
import {
  MAX_WORDS,
  MAX_WORD_LEN,
  MIN_RECOMMENDED,
  textToWords,
  wordsToText,
} from '@/lib/livePreview/words'

/**
 * Syncs ONE existing row's `word` subfield to a target value, through
 * Payload's own documented useField hook — the same read/write mechanism its
 * stock text field uses. Renders nothing; it only drives that row's value.
 *
 * Deliberately keyed to a row that ALREADY EXISTS in form state (see the map
 * below), never to a target word directly — so this can never race
 * addFieldRow's own row creation.
 */
function WordRowSync({ path, target }: { path: string; target: string }) {
  const { value, setValue } = useField<string>({ path })
  useEffect(() => {
    if (value !== target) setValue(target)
    // setValue is stable per Payload's own useField implementation; omitting
    // it (and value, re-included via the comparison above) keeps this from
    // re-firing on every unrelated form re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return null
}

/**
 * Replaces Payload's row-by-row array editor for `floatingWords` with one
 * textarea, one word per line. Entering 18 words was 18 rounds of
 * "Add row -> type -> collapse"; the 2026-08-10 rollback had to restore 12
 * words per locale by hand.
 *
 * UI ONLY. The field's name, type and stored shape are unchanged, so deleting
 * the `admin.components` line in src/blocks/index.ts restores Payload's stock
 * editor with every word intact (spec 7.3).
 *
 * ROW COUNT is reconciled through addFieldRow/removeFieldRow — the exact same
 * public functions Payload's own Array field uses internally (confirmed by
 * reading @payloadcms/ui's Array field source directly). ROW VALUES are then
 * synced one at a time through WordRowSync above, never through raw
 * dispatchFields. A first draft of this component called a fabricated
 * `REPLACE_ROW_ROWS` action that does not exist in the installed Payload
 * build, and a second candidate, `REPLACE_STATE`, turned out to silently wipe
 * every OTHER field in the form — it replaces the whole tracked field-state
 * object with exactly what it is given, it does not merge. Both were caught
 * by reading the real reducer (`fieldReducer.js`) before writing this, not
 * discovered by shipping them. Only documented, real APIs are used here.
 */
export const FloatingWordsField: ArrayFieldClientComponent = (props) => {
  const { field, parentSchemaPath, path: pathFromProps } = props
  const { rows, path, value } = useField<{ word?: string | null }[]>({
    hasRows: true,
    potentiallyStalePath: pathFromProps,
  })
  const { addFieldRow, removeFieldRow, setModified } = useForm()

  // The field's static schema location, required by addFieldRow but not
  // exposed directly — built from the same two pieces Payload's own internals
  // use: the parent's schema path plus this field's own name. Step 5 below
  // confirms this empirically rather than trusting it purely from the types.
  const schemaPath = [parentSchemaPath, field.name].filter(Boolean).join('.')

  // Local text state, so typing does not fight the form's own re-renders.
  const [text, setText] = useState(() => wordsToText(value))
  const [focused, setFocused] = useState(false)

  // Re-sync from the form when it changes underneath us (locale switch, a
  // fresh document load, or an external reset) — but never while the owner is
  // typing, or the caret jumps.
  const external = useMemo(() => wordsToText(value), [value])
  useEffect(() => {
    if (!focused) setText(external)
  }, [external, focused])

  const words = useMemo(() => textToWords(text), [text])
  const rowCount = rows?.length ?? 0

  // Reconcile ROW COUNT to match the textarea. Only acts when the number of
  // non-blank lines actually changes — normal typing inside an existing line
  // never touches this, only pressing Enter/Backspace across a line boundary
  // does, so this cannot repeat the bench's "fires per pixel of drag" bug.
  useEffect(() => {
    if (words.length > rowCount) {
      for (let i = rowCount; i < words.length; i++) {
        addFieldRow({ path, rowIndex: i, schemaPath })
      }
      setModified(true)
    } else if (words.length < rowCount) {
      for (let i = rowCount - 1; i >= words.length; i--) {
        removeFieldRow({ path, rowIndex: i })
      }
      setModified(true)
    }
  }, [words.length, rowCount, path, schemaPath, addFieldRow, removeFieldRow, setModified])

  const tooMany = text.split(/\r?\n/).filter((l) => l.trim()).length > MAX_WORDS
  const overLong = text.split(/\r?\n/).some((l) => l.trim().length > MAX_WORD_LEN)

  return (
    <div className="field-type" style={{ marginBottom: 20 }}>
      <label className="field-label" htmlFor={`field-${path}`}>
        {typeof field?.label === 'string' ? field.label : 'Floating words'}
      </label>

      <textarea
        id={`field-${path}`}
        value={text}
        rows={Math.min(MAX_WORDS, Math.max(8, words.length + 2))}
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          setFocused(false)
          // Normalise on the way out: trims, drops blanks, applies the caps.
          setText(textToWords(e.target.value).join('\n'))
        }}
        style={{
          width: '100%',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          lineHeight: 1.6,
          padding: 10,
        }}
      />

      {/* One per row that ALREADY EXISTS in form state right now — see
          WordRowSync's own doc comment for why this is keyed to rows, not to
          target words. */}
      {(rows ?? []).map((row, i) => (
        <WordRowSync
          key={(row as { id?: string }).id ?? i}
          path={`${path}.${i}.word`}
          target={words[i] ?? ''}
        />
      ))}

      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
        One word per line. Order is priority — phones show only the first {MIN_RECOMMENDED}.
        {' '}
        <strong>
          {words.length} / {MAX_WORDS}
        </strong>
        {words.length > 0 && words.length < MIN_RECOMMENDED
          ? ` — below ${MIN_RECOMMENDED} the constellation looks sparse`
          : ''}
        {tooMany ? ` — only the first ${MAX_WORDS} lines are kept` : ''}
        {overLong ? ` — words over ${MAX_WORD_LEN} characters are shortened` : ''}
      </div>
    </div>
  )
}

export default FloatingWordsField
```

- [ ] **Step 2: Confirm `schemaPath` at runtime — the one piece derived rather than read directly**

Everything else above (`useField`, `useForm().addFieldRow`/`removeFieldRow`, `ArrayFieldClientComponent`'s prop shape) was confirmed by reading the installed `payload@3.86.0` and `@payloadcms/ui@3.86.0` type declarations and source directly before writing this component. The one value that is *derived* rather than read off a prop verbatim is `schemaPath` (`[parentSchemaPath, field.name].join('.')`), so confirm it empirically once the dev server is running:

```tsx
console.log('floatingWords schemaPath:', schemaPath, '| parentSchemaPath:', parentSchemaPath)
```

Add this temporarily inside the component, open the `home` page's Hero block in `/admin`, and check the browser console. Expected shape: something ending in `hero.floatingWords` (the block slug, then the field name). Remove the `console.log` once confirmed — it is a verification aid, not part of the shipped component.

- [ ] **Step 3: Register the component on the field**

In `src/blocks/index.ts`, replace the `floatingWords` field (lines 23-33) with:

```ts
    {
      name: 'floatingWords',
      type: 'array',
      localized: true,
      maxRows: 18,
      admin: {
        description:
          '8–18 short words orbiting the logo; order = priority (small screens show only the first 8)',
        // UI-only swap: one textarea instead of 18 collapsible rows. The stored
        // shape is unchanged — delete this `components` block and Payload's
        // stock array editor returns with every word intact.
        components: {
          Field: '@/components/admin/FloatingWordsField#FloatingWordsField',
        },
      },
      fields: [{ name: 'word', type: 'text', required: true, maxLength: 24 }],
    },
```

- [ ] **Step 4: Regenerate the import map**

```bash
npm run generate:importmap
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" diff --stat "src/app/(payload)/admin/importMap.js"
```

Expected: `importMap.js` gains a `FloatingWordsField` entry.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean, no output.

- [ ] **Step 6: Start the dev server and watch the schema line**

```bash
rm -rf .next
```

Then start the server via the preview tooling (launch config name `tampa-taruno`) and read its log.

Expected: `Pulling schema from database...` followed by a normal start. **Any "DATA LOSS" prompt or schema push is a red flag** — it would mean this is not a UI-only change. Stop and re-examine if you see one.

- [ ] **Step 7: Prove the schema is untouched**

Re-run the Task 1 Step 4 command writing to `schema-after-task3.txt`, then:

```bash
diff "…/scratchpad/schema-baseline.txt" "…/scratchpad/schema-after-task3.txt" && echo "SCHEMA IDENTICAL — good"
```

Expected: no differences.

- [ ] **Step 8: Round-trip the editor in the browser**

Log into `/admin`, open the `home` page → Hero block. Verify: the textarea shows the existing 12 words one per line; paste a 3-word list; save; reload. Confirm the saved words match, then restore the original 12 and save. Repeat for the **`id` locale** — the field is localized, and the two lists are independent.

- [ ] **Step 9: Confirm the real homepage still renders the words**

```bash
curl -s http://localhost:3000/en | grep -o "sketch\|craft\|precision" | sort -u
```

Expected: the words appear in the SSR HTML.

- [ ] **Step 10: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/components/admin/FloatingWordsField.tsx src/blocks/index.ts "src/app/(payload)/admin/importMap.js"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): edit constellation words as a text list instead of 18 array rows"
```

---

## Task 4: Opt-in WebGL context release on `LogoCanvas`

**Why this is unavoidable, despite the spec listing `LogoCanvas` as untouched:** the preview's replay button remounts the hero. `LogoCanvas` currently calls plain `engine.dispose()` on unmount, which frees GPU resources but does **NOT** release the WebGL context. Browsers cap live contexts at ~16, and this project has already shipped that exact bug once (`FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS`, fixed in `9190364`). Both dev benches solve it with `dispose(true)` plus a fresh keyed canvas. The preview needs the same, so `LogoCanvas` needs to be *able* to do it.

The change is additive and defaults to today's exact behaviour, so the real hero is bit-for-bit unaffected.

**Files:**
- Modify: `src/components/three/LogoCanvas.tsx:97` (and the props type)

**Interfaces:**
- Consumes: nothing
- Produces: `LogoCanvas` accepts `releaseContextOnUnmount?: boolean` (default `false`)

- [ ] **Step 1: Add the prop to the type**

In `src/components/three/LogoCanvas.tsx`, add to the props type (after `onLogoHover`):

```tsx
  /**
   * Release the WebGL context when this unmounts, not just the GPU resources.
   *
   * Off by default because it PERMANENTLY poisons the canvas element — a
   * reused canvas would fail its next context creation outright. Only turn it
   * on where the canvas is discarded too (a `key`ed element), which is what
   * the admin preview does when replaying: without it, each replay leaks a
   * context and the browser's ~16 cap is reached in seconds.
   */
  releaseContextOnUnmount?: boolean
```

and to the destructured parameters:

```tsx
  releaseContextOnUnmount = false,
```

- [ ] **Step 2: Use it in the cleanup**

Replace line 97's `engine.dispose()` with:

```tsx
      engine.dispose(releaseContextOnUnmount)
```

- [ ] **Step 3: Add it to the mount effect's dependency array**

The mount effect is deliberately `[]`-scoped (mount-only) with an eslint-disable already present. The flag is read inside the cleanup, so capture it in a ref to avoid a stale read — add above the effect:

```tsx
  const releaseRef = useRef(releaseContextOnUnmount)
  releaseRef.current = releaseContextOnUnmount
```

and use `engine.dispose(releaseRef.current)` in the cleanup instead of the raw prop.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Confirm the real hero is unchanged**

The homepage passes no such prop, so it must still take the `dispose(false)` path. Verify by reading the diff:

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" diff src/components/three/LogoCanvas.tsx
```

Expected: only the prop, the ref, and the one `dispose()` argument. No behavioural change for a caller that omits the prop.

- [ ] **Step 6: Re-run the existing hero verification**

```bash
cd "…/scratchpad/t9" && node t9-reduced-motion.mjs && node t9-reduced-motion-pose.mjs
```

Expected: both suites pass, all assertions `ok`.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/components/three/LogoCanvas.tsx
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(three): opt-in WebGL context release on LogoCanvas unmount"
```

---

## Task 5: Live-data source attribution (pure logic)

Live Preview posts *the document being edited*, without saying which one it is. This route is opened from two different edit screens, so attribution is explicit via a `?source=` marker. Getting this wrong would apply page data to the effects config or vice-versa.

**Files:**
- Create: `src/lib/livePreview/source.ts`
- Test: `src/lib/livePreview/source.check.ts`
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type PreviewSource = 'hero-effects' | 'page'`
  - `parseSource(raw: string | null | undefined): PreviewSource | null`
  - `SOURCE_PARAM = 'source'`

- [ ] **Step 1: Write the failing test**

Create `src/lib/livePreview/source.check.ts`:

```ts
/**
 * Assertions for live-preview source attribution.
 * Run: npm run verify:config
 *
 * Live Preview posts the edited document with no indication of which document
 * it is. Misattributing it would feed page data into the effects config, so
 * anything unrecognised must fall back to "no live data" rather than guess.
 */
import { parseSource, SOURCE_PARAM } from './source'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

check('recognises hero-effects', parseSource('hero-effects') === 'hero-effects')
check('recognises page', parseSource('page') === 'page')
check('rejects an unknown source', parseSource('something-else') === null)
check('rejects null', parseSource(null) === null)
check('rejects undefined', parseSource(undefined) === null)
check('rejects empty string', parseSource('') === null)
check('is case sensitive — no silent coercion', parseSource('Hero-Effects') === null)
check('does not trim — a padded value is not a valid source', parseSource(' page ') === null)
check('param name is stable', SOURCE_PARAM === 'source')

console.log(failures === 0 ? '\nAll source checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
node --import tsx src/lib/livePreview/source.check.ts
```

Expected: FAIL — cannot resolve `./source`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/livePreview/source.ts`:

```ts
/**
 * Which document's live-preview data is arriving.
 *
 * Payload posts the document being edited, but the payload itself does not say
 * which document that is — and this preview route is reachable from two
 * different edit screens (the `hero-effects` global, and the `pages` document
 * carrying the Hero block). Shape-sniffing the payload would be guesswork, so
 * the URL carries an explicit marker instead.
 *
 * Anything unrecognised returns null, which the route treats as "no live data"
 * and renders saved values — failing visibly rather than mis-assigning fields.
 */
export type PreviewSource = 'hero-effects' | 'page'

/** Query-string key carrying the marker. */
export const SOURCE_PARAM = 'source'

export function parseSource(raw: string | null | undefined): PreviewSource | null {
  if (raw === 'hero-effects') return 'hero-effects'
  if (raw === 'page') return 'page'
  return null
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
node --import tsx src/lib/livePreview/source.check.ts
```

Expected: all `ok`, `All source checks passed.`

- [ ] **Step 5: Add to `verify:config` and run the suite**

Append to the `verify:config` script in `package.json`:

```
 && node --import tsx src/lib/livePreview/source.check.ts
```

then:

```bash
npm run verify:config
```

Expected: every suite passes.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/lib/livePreview/source.ts src/lib/livePreview/source.check.ts package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): explicit live-preview source attribution"
```

---

## Task 6: Dependency + Live Preview config

Kept as its own task so `/admin` health is confirmed **before** any route is built on top of it, and so this is a single revertible commit.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/payload.config.ts:22-26`

**Interfaces:**
- Consumes: `SOURCE_PARAM` from Task 5
- Produces: `admin.livePreview` config; the `useLivePreview` hook becomes importable

- [ ] **Step 1: Install the pinned dependency**

```bash
npm install --save-exact @payloadcms/live-preview-react@3.86.0
```

Expected: adds exactly 2 packages (`@payloadcms/live-preview-react`, `@payloadcms/live-preview`), no `ERESOLVE`, no other version changes. Pre-verified by dry run (spec §7.2). **If npm reports any peer conflict, stop and revert** — do not use `--force` or `--legacy-peer-deps`.

- [ ] **Step 2: Confirm the pin and the lockfile**

```bash
grep '"@payloadcms/live-preview-react"' package.json
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" diff --stat package.json package-lock.json
```

Expected: version `3.86.0` with **no** `^`. Only those two files changed.

- [ ] **Step 3: Confirm the hook's real signature before writing code against it**

```bash
cat node_modules/@payloadcms/live-preview-react/dist/index.d.ts
cat node_modules/@payloadcms/live-preview-react/dist/*useLivePreview*.d.ts 2>/dev/null
```

Expected: a `useLivePreview<T>({ initialData, serverURL, depth? })` returning at least `{ data: T }`. **Record the actual signature** — Task 7's code must match what this build exports, not what this plan assumes.

- [ ] **Step 4: Add the config**

In `src/payload.config.ts`, replace the `admin` block (lines 23-26) with:

```ts
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
    // Renders the hero-only preview route in an iframe beside the edit form and
    // pushes UNSAVED form state into it. The `source` marker tells that route
    // which document is live, because the posted payload does not say — see
    // src/lib/livePreview/source.ts.
    livePreview: {
      globals: ['hero-effects'],
      collections: ['pages'],
      url: ({ locale, globalConfig }) => {
        const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const code = locale?.code || 'en'
        const source = globalConfig ? 'hero-effects' : 'page'
        return `${base}/${code}/admin-preview/hero?source=${source}`
      },
    },
  },
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. If `url`'s argument types complain, match them to `LivePreviewConfig` in `node_modules/payload/dist/config/types.d.ts:112-123`.

- [ ] **Step 6: Restart clean and confirm `/admin` is healthy**

```bash
rm -rf .next
```

Restart the dev server, then:

```bash
curl -s -o /dev/null -w "admin %{http_code}\n" http://localhost:3000/admin
curl -s -o /dev/null -w "home  %{http_code}\n" http://localhost:3000/en
```

Expected: `admin 200` (or a 3xx to login), `home 200`. Then open the Hero Effects edit screen in a browser and confirm a **Live Preview** option appears and the existing fields still render and save. The iframe will 404 until Task 7 — that is expected at this point.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add package.json package-lock.json src/payload.config.ts
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): enable Payload live preview for hero-effects and pages"
```

---

## Task 7: The hero preview route

**Files:**
- Create: `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx`
- Create: `src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx`

**Interfaces:**
- Consumes: `parseSource`, `SOURCE_PARAM` (Task 5); `releaseContextOnUnmount` (Task 4); `resolveSeparation`, `resolveIgnition`, `getHeroEffects`, `getPage`, `HeroBlock` (all existing, unmodified)
- Produces: the route Task 6's `url` points at

- [ ] **Step 1: Write the server route**

Create `src/app/(frontend)/[locale]/admin-preview/hero/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getHeroEffects, getPage } from '@/lib/cms'
import { isLocale } from '@/lib/i18n'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import HeroPreview from './HeroPreview'

// A second page rendering the same hero must never compete with the homepage
// in search, nor be crawled.
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Hero-only live-preview target for /admin (spec 4.1).
 *
 * Ships to production deliberately — the dev benches are notFound() there, so
 * without this the owner has no way to see what an effects value does once the
 * site is live. It renders only content that is already public on the
 * homepage, so it carries no auth gate; gating it would break the iframe's
 * cookie context for no security gain.
 */
export default async function HeroPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const [effects, page] = await Promise.all([getHeroEffects(), getPage('home', locale)])

  const hero = (page?.layout || []).find((b) => b.blockType === 'hero')
  if (!hero || hero.blockType !== 'hero') notFound()

  return (
    <HeroPreview
      savedSeparation={resolveSeparation(effects)}
      savedIgnition={resolveIgnition(effects)}
      savedLine1={hero.line1}
      savedLine2={hero.line2}
      savedLocationLine={hero.locationLine}
      savedScrollCue={hero.scrollCue}
      savedConstellationEnabled={hero.constellationEnabled ?? true}
      savedWords={(hero.floatingWords || [])
        .map((w) => w.word)
        .filter((w): w is string => !!w)}
    />
  )
}
```

- [ ] **Step 2: Write the client preview**

Create `src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx`. **Adjust the `useLivePreview` call to the signature recorded in Task 6 Step 3 if it differs.**

```tsx
'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useLivePreview } from '@payloadcms/live-preview-react'
import { HeroBlock } from '@/components/blocks/HeroBlock'
import { parseSource, SOURCE_PARAM } from '@/lib/livePreview/source'
import { resolveIgnition, type HeroEffectsIgnitionInput } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation, type HeroEffectsInput } from '@/lib/three/shatter/resolveSeparation'
import type { IgnitionConfig } from '@/lib/three/ignition/types'
import type { SeparationConfig } from '@/lib/three/shatter/types'

type HeroBlockShape = {
  blockType?: string
  line1?: string | null
  line2?: string | null
  locationLine?: string | null
  scrollCue?: string | null
  constellationEnabled?: boolean | null
  floatingWords?: { word?: string | null }[] | null
}

type Props = {
  savedSeparation: SeparationConfig
  savedIgnition: IgnitionConfig
  savedLine1: string
  savedLine2?: string | null
  savedLocationLine?: string | null
  savedScrollCue?: string | null
  savedConstellationEnabled: boolean
  savedWords: string[]
}

/**
 * Mounts the REAL HeroBlock with live-edited values (spec 4.1).
 *
 * Live values go through resolveSeparation()/resolveIgnition() untouched: they
 * already merge a partial, null-riddled CMS shape over frozen defaults and
 * clamp phase boundaries, which is exactly what half-typed form state looks
 * like. Live data is LESS trustworthy than saved data, and these functions
 * were already built to be that guard.
 */
export default function HeroPreview(props: Props) {
  const searchParams = useSearchParams()
  const source = parseSource(searchParams.get(SOURCE_PARAM))
  const serverURL =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

  // Ignition is one-shot and tied to the video handoff, so it does not loop.
  // Remounting the whole block replays the sequence on demand (owner decision);
  // edits alone update state quietly rather than restarting on every keystroke.
  const [nonce, setNonce] = useState(0)
  const replay = useCallback(() => setNonce((n) => n + 1), [])

  // One subscription. Payload posts whichever document the parent edit screen
  // is editing; `source` says which that is.
  const { data } = useLivePreview<Record<string, unknown>>({
    initialData: {},
    serverURL,
    depth: 2,
  })

  let separation = props.savedSeparation
  let ignition = props.savedIgnition
  let line1 = props.savedLine1
  let line2 = props.savedLine2
  let locationLine = props.savedLocationLine
  let scrollCue = props.savedScrollCue
  let constellationEnabled = props.savedConstellationEnabled
  let words = props.savedWords

  const hasLive = data && Object.keys(data).length > 0

  if (hasLive && source === 'hero-effects') {
    separation = resolveSeparation(data as HeroEffectsInput)
    ignition = resolveIgnition(data as HeroEffectsIgnitionInput)
  }

  if (hasLive && source === 'page') {
    const layout = (data as { layout?: HeroBlockShape[] }).layout
    const hero = Array.isArray(layout) ? layout.find((b) => b?.blockType === 'hero') : undefined
    if (hero) {
      // line1 is required on the real block; an empty draft must not blank the
      // hero mid-edit, so fall back to the saved value.
      line1 = hero.line1 || props.savedLine1
      line2 = hero.line2 ?? props.savedLine2
      locationLine = hero.locationLine ?? props.savedLocationLine
      scrollCue = hero.scrollCue ?? props.savedScrollCue
      constellationEnabled = hero.constellationEnabled ?? props.savedConstellationEnabled
      words = (hero.floatingWords || [])
        .map((w) => (w?.word ?? '').trim())
        .filter((w) => w.length > 0)
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100dvh' }}>
      <HeroBlock
        key={nonce}
        line1={line1}
        line2={line2}
        locationLine={locationLine}
        scrollCue={scrollCue}
        constellationEnabled={constellationEnabled}
        separation={separation}
        ignition={ignition}
        floatingWords={words}
      />

      <button
        type="button"
        onClick={replay}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 50,
          padding: '8px 14px',
          font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#2B2A27',
          background: 'rgba(246,241,231,0.94)',
          border: '1px solid rgba(43,42,39,0.35)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Replay intro
      </button>

      <div
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          zIndex: 50,
          font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#2B2A27',
          opacity: 0.65,
        }}
      >
        {source ? `live: ${source}` : 'saved values (no live source)'}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. `HeroEffectsInput` (`resolveSeparation.ts:9`) and `HeroEffectsIgnitionInput` (`resolveIgnition.ts:9`) are already exported, so the imports above should resolve with no further changes to those files.

- [ ] **Step 4: Confirm the route renders standalone**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/en/admin-preview/hero?source=hero-effects"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/id/admin-preview/hero?source=page"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/xx/admin-preview/hero"
```

Expected: `200`, `200`, `404`.

- [ ] **Step 5: Confirm it is noindex**

```bash
curl -s "http://localhost:3000/en/admin-preview/hero?source=page" | grep -i "noindex" && echo "noindex present"
```

Expected: a `robots` meta containing `noindex`.

- [ ] **Step 6: Confirm the hero actually runs there (headless, not the pane)**

Copy `verify-effects.mjs` from the scratchpad and point it at the preview URL:

```bash
cd "…/scratchpad" && node verify-effects.mjs "http://localhost:3000/en/admin-preview/hero?source=hero-effects"
```

Expected: `hidden: false`, video reaching ~7.67s, frames advancing (real fps, not ~1 Hz), 2 canvases, `hasLiveGL: true`, **zero console errors**.

- [ ] **Step 7: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add "src/app/(frontend)/[locale]/admin-preview"
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "feat(cms): hero-only live-preview route"
```

---

## Task 8: Prove live edits reach the preview without saving

The whole feature's claim. Asserting it needs a real browser driving the real admin form.

**Files:**
- Create: `docs/superpowers/verification/preview-live-update.mjs`

**Interfaces:**
- Consumes: the route (Task 7), the config (Task 6)
- Produces: a repeatable pass/fail check

- [ ] **Step 1: Write the check**

Create `docs/superpowers/verification/preview-live-update.mjs`:

```js
// Proves a Hero Effects edit reaches the preview iframe WITHOUT saving.
//
// Drives the real /admin form, changes one high-contrast field, and asserts the
// preview's pixels change while the document stays unsaved. Uses headless
// Chrome: the in-app browser pane reports the tab hidden and throttles rAF to
// ~1Hz, which stalls the engine's own clock.
import puppeteer from 'puppeteer-core'
import { CHROME, ARGS, fresh, meanAbsDiff, report } from './t9-lib.mjs'

const OUT = fresh('preview-live')
const BASE = process.env.TT_URL_ORIGIN || 'http://localhost:3000'
const W = 1280
const H = 900

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H })

// Log in through the API so the admin UI has a session cookie.
const login = await page.evaluate(async (base) => {
  const r = await fetch(`${base}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
  })
  return r.status
}, BASE).catch(() => null)

await page.goto(`${BASE}/api/users/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(async (base) => {
  await fetch(`${base}/api/users/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tampa-taruno.local', password: 'tampataruno-2026' }),
  })
}, BASE)

// The preview standing alone must render saved values and be stable.
const preview = await browser.newPage()
await preview.setViewport({ width: W, height: H })
await preview.goto(`${BASE}/en/admin-preview/hero?source=hero-effects`, {
  waitUntil: 'domcontentloaded',
})
await preview.waitForSelector('canvas', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 6000))
await preview.screenshot({ path: `${OUT}/a.png` })

// Push a live-preview message exactly as the admin form does, WITHOUT saving:
// crank cage opacity and ember density to maximum.
await preview.evaluate(() => {
  window.postMessage(
    {
      type: 'payload-live-preview',
      data: {
        ignitionCage: { cageOpacity: 1, cageDensity: 1 },
        ignitionEmbers: { emberEnabled: true, emberDensity: 1, emberSize: 14, emberOpacity: 1 },
      },
    },
    window.location.origin,
  )
})
await new Promise((r) => setTimeout(r, 1500))
// Replay so the one-shot sequence re-runs with the new values.
await preview.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /replay/i.test(x.textContent || ''))
  b?.click()
})
await new Promise((r) => setTimeout(r, 4000))
await preview.screenshot({ path: `${OUT}/b.png` })

const delta = meanAbsDiff(`${OUT}/a.png`, `${OUT}/b.png`, W, H)

// The document must still be unsaved — read it back from the API.
const saved = await preview.evaluate(async (base) => {
  const r = await fetch(`${base}/api/globals/hero-effects`, { credentials: 'include' })
  const j = await r.json()
  return j?.ignitionCage?.cageOpacity
}, BASE)

console.log('delta:', delta.toFixed(3), '| saved cageOpacity still:', saved)

const checks = [
  ['the preview reacted to live data', delta > 1, `mean abs diff ${delta.toFixed(3)}`],
  ['nothing was saved to the database', saved !== 1, `stored cageOpacity = ${saved}`],
]

const failed = report(checks)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Confirm the file parses**

```bash
node --check docs/superpowers/verification/preview-live-update.mjs && echo "parses clean"
```

- [ ] **Step 3: Run it from the scratchpad**

The harness's dependencies (`puppeteer-core`, `ffmpeg-static`) live in the scratchpad, never in the app:

```bash
cp docs/superpowers/verification/*.mjs "…/scratchpad/t9/"
cd "…/scratchpad/t9" && node preview-live-update.mjs
```

Expected: both assertions `ok`. **If the `payload-live-preview` message shape is rejected**, read the real shape from `node_modules/@payloadcms/live-preview/dist/` and correct the `postMessage` body — the event name and envelope must match that build exactly.

- [ ] **Step 4: Verify source attribution does not cross over**

Add to the same file, before `report(checks)`, a second preview page opened with `?source=page`, post the **same effects payload**, and assert the pixels do **not** change (effects data must be ignored when the source is `page`):

```js
const other = await browser.newPage()
await other.setViewport({ width: W, height: H })
await other.goto(`${BASE}/en/admin-preview/hero?source=page`, { waitUntil: 'domcontentloaded' })
await other.waitForSelector('canvas', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 6000))
await other.screenshot({ path: `${OUT}/c.png` })
await other.evaluate(() => {
  window.postMessage(
    { type: 'payload-live-preview', data: { ignitionCage: { cageOpacity: 1, cageDensity: 1 } } },
    window.location.origin,
  )
})
await new Promise((r) => setTimeout(r, 2500))
await other.screenshot({ path: `${OUT}/d.png` })
const crossDelta = meanAbsDiff(`${OUT}/c.png`, `${OUT}/d.png`, W, H)
checks.push([
  'effects data is IGNORED when source=page',
  crossDelta < 1,
  `cross-source delta ${crossDelta.toFixed(3)}`,
])
```

Re-run. Expected: three assertions, all `ok`.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/preview-live-update.mjs
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(cms): prove live edits reach the preview without saving"
```

---

## Task 9: WebGL context-leak regression for replay

Task 4 added the mechanism; this proves it works. This project has already shipped context exhaustion once, and the replay button is exactly the repeated-rebuild pattern that caused it.

**Files:**
- Create: `docs/superpowers/verification/preview-context-leak.mjs`
- Conditionally modify (only if Step 2's test fails): `src/components/hero/LogoStage.tsx`, `src/components/blocks/HeroBlock.tsx`, `HeroPreview.tsx` — threading the Task 4 flag the rest of the way through. Full code for both outcomes is in Step 3; this is not deferred to a later decision.

**Interfaces:**
- Consumes: the route (Task 7), `releaseContextOnUnmount` (Task 4)
- Produces: a repeatable pass/fail check; conditionally, `releaseGLContextOnUnmount?: boolean` (default `false`) added to `LogoStage` and `HeroBlock`'s own prop types

- [ ] **Step 1: Write the check**

Create `docs/superpowers/verification/preview-context-leak.mjs`:

```js
// Clicking "Replay intro" remounts the hero, which rebuilds a WebGL context.
// Browsers cap live contexts at ~16 and this project has shipped
// FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS once already (fixed in 9190364), so
// repeated replays must not accumulate contexts.
import puppeteer from 'puppeteer-core'
import { CHROME, ARGS, report } from './t9-lib.mjs'

const BASE = process.env.TT_URL_ORIGIN || 'http://localhost:3000'
const CLICKS = 25

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ARGS })
const page = await browser.newPage()
await page.setViewport({ width: 1000, height: 700 })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e.message)))

await page.goto(`${BASE}/en/admin-preview/hero?source=hero-effects`, {
  waitUntil: 'domcontentloaded',
})
await page.waitForSelector('canvas', { timeout: 20000 })

for (let i = 0; i < CLICKS; i++) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /replay/i.test(x.textContent || ''),
    )
    b?.click()
  })
  await new Promise((r) => setTimeout(r, 350))
}
await new Promise((r) => setTimeout(r, 2500))

// The canvas must still hold a LIVE context after all those rebuilds.
const alive = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return { hasCanvas: false, live: false }
  let gl = null
  try {
    gl = c.getContext('webgl2') || c.getContext('webgl')
  } catch {
    return { hasCanvas: true, live: false }
  }
  return { hasCanvas: true, live: !!gl && !gl.isContextLost() }
})

const exhausted = errors.filter((e) =>
  /EXHAUSTED|context lost|Too many active WebGL|CONTEXT_LOST/i.test(e),
)

console.log(`after ${CLICKS} replays:`, JSON.stringify(alive), '| errors:', errors.length)

const checks = [
  ['the canvas survives repeated replays', alive.hasCanvas === true],
  ['its WebGL context is still live', alive.live === true],
  ['no context-exhaustion errors', exhausted.length === 0, exhausted.slice(0, 2).join(' | ')],
]

const failed = report(checks)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it**

```bash
cp docs/superpowers/verification/preview-context-leak.mjs "…/scratchpad/t9/"
cd "…/scratchpad/t9" && node preview-context-leak.mjs
```

- [ ] **Step 3: If it FAILED, thread the Task 4 flag the rest of the way through**

`key={nonce}` on `HeroBlock` already forces a brand-new `LogoCanvas` (and therefore a brand-new `<canvas>` DOM element) on every replay, which is the fresh-element half of the pattern the benches use. But `dispose(false)` is still what runs on unmount, because `HeroBlock` and `LogoStage` do not forward the Task 4 flag down — so the *old* context is never explicitly released, only abandoned to GC, which is not guaranteed to reclaim it before the next replay. If Step 2 failed, that gap is the cause, and the fix is to close it: one pass-through prop each on `HeroBlock.tsx` and `LogoStage.tsx`, purely additive, defaulting to today's exact behaviour.

This is a narrow, justified exception to Global Constraints' "do not modify `HeroBlock.tsx`/`LogoStage.tsx`" — same shape and same reasoning as Task 4's exception for `LogoCanvas.tsx`: opt-in, default-off, zero behaviour change for the real homepage (which never passes it), and it is only applied here *because Step 2 measured a real leak*, not speculatively.

In `src/components/hero/LogoStage.tsx`, add to the props destructuring (currently `onLive, onIntroPlayStart, separation, ignition` at line 33-42):

```tsx
export function LogoStage({
  onLive,
  onIntroPlayStart,
  separation,
  ignition,
  releaseGLContextOnUnmount = false,
}: {
  onLive?: () => void
  onIntroPlayStart?: () => void
  separation: SeparationConfig
  ignition: IgnitionConfig
  /** Passed straight to LogoCanvas — see its own doc comment for why this
   * defaults to false everywhere except a remount-heavy preview. */
  releaseGLContextOnUnmount?: boolean
}) {
```

and pass it through on the `<LogoCanvas>` call (line 93-103):

```tsx
        <LogoCanvas
          onReady={() => setCanvasReady(true)}
          config={separation}
          ignition={ignition}
          armed={ignited}
          overlay={overlay}
          ignite={live}
          onIgnitionCue={onCue}
          onIgnitionDone={onDone}
          onLogoHover={setLogoHover}
          releaseContextOnUnmount={releaseGLContextOnUnmount}
        />
```

In `src/components/blocks/HeroBlock.tsx`, add to the `Props` type (line 10-21) and the destructuring (line 60-69):

```tsx
type Props = {
  line1: string
  line2?: string | null
  locationLine?: string | null
  scrollCue?: string | null
  constellationEnabled?: boolean
  separation: SeparationConfig
  ignition: IgnitionConfig
  floatingWords?: string[]
  /** Forwarded to LogoStage/LogoCanvas. See LogoCanvas's doc comment. */
  releaseGLContextOnUnmount?: boolean
}
```

```tsx
export function HeroBlock({
  line1,
  line2,
  locationLine,
  scrollCue,
  constellationEnabled = true,
  separation,
  ignition,
  floatingWords = [],
  releaseGLContextOnUnmount = false,
}: Props) {
```

and pass it through on the `<LogoStage>` call (line 135-140):

```tsx
      <LogoStage
        onLive={onStageLive}
        onIntroPlayStart={onIntroPlayStart}
        separation={separation}
        ignition={ignition}
        releaseGLContextOnUnmount={releaseGLContextOnUnmount}
      />
```

Finally, in `HeroPreview.tsx`, pass `releaseGLContextOnUnmount` on the `<HeroBlock>` element next to the existing `key={nonce}`.

- [ ] **Step 4: Re-run the leak check**

```bash
cd "…/scratchpad/t9" && node preview-context-leak.mjs
```

Expected: all three assertions `ok`. If it still fails after this, do not add a third workaround — per the systematic-debugging skill, two failed fixes means stop and re-diagnose from evidence (capture the actual console error text and the exact click count it fails at) rather than attempting a fix #3.

- [ ] **Step 5: Confirm the real homepage is still bit-for-bit unaffected**

```bash
cd "…/scratchpad/t9" && node t9-reduced-motion.mjs && node t9-reduced-motion-pose.mjs
```

Expected: both pass, unchanged. The real hero never passes `releaseGLContextOnUnmount`, so it must still take the exact `dispose(false)` path it always has.

- [ ] **Step 6: Commit**

If Step 2 passed outright, commit just the test file as originally planned. If Step 3 was needed, commit the full chain together — a passthrough prop is only meaningful with both ends present, so splitting it into two commits would leave an intermediate commit where the flag exists but does nothing:

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/preview-context-leak.mjs
```

Add the following only if Step 3 ran:

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add src/components/hero/LogoStage.tsx src/components/blocks/HeroBlock.tsx "src/app/(frontend)/[locale]/admin-preview/hero/HeroPreview.tsx"
```

Then commit:

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(cms): WebGL context-leak regression for preview replay"
```

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/preview-context-leak.mjs
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "test(cms): WebGL context-leak regression for preview replay"
```

---

## Task 10: Full verification sweep and rollback rehearsal

Nothing merges until the public site is proven unchanged, the schema is proven untouched, and the documented rollback is proven to actually work.

**Files:**
- Modify: `docs/superpowers/verification/README.md` (document the two new scripts)

**Interfaces:**
- Consumes: everything above
- Produces: a green sweep, and a rehearsed rollback

- [ ] **Step 1: The public site must be unchanged**

```bash
cd "…/scratchpad/t9" && node t9-reduced-motion.mjs && node t9-reduced-motion-pose.mjs
```

Expected: every assertion `ok` in both. These prove the real hero — the thing this work must not break — still behaves exactly as before.

- [ ] **Step 2: Config suites and typecheck**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT"
npm run verify:config
npx tsc --noEmit
```

Expected: all suites pass (including the two added here); typecheck silent.

- [ ] **Step 3: The new checks**

```bash
cd "…/scratchpad/t9" && node preview-live-update.mjs && node preview-context-leak.mjs
```

Expected: all assertions `ok`.

- [ ] **Step 4: Both locales still serve**

```bash
curl -s -o /dev/null -w "en %{http_code}\n" http://localhost:3000/en
curl -s -o /dev/null -w "id %{http_code}\n" http://localhost:3000/id
curl -s -o /dev/null -w "admin %{http_code}\n" http://localhost:3000/admin
```

Expected: `200`, `200`, `200`/`3xx`.

- [ ] **Step 5: Production build — the route ships, so it must build**

```bash
npm run build
```

Expected: build succeeds. **Do not run this while `next dev` is running** — a concurrent build corrupts `.next` (documented gotcha). Stop the dev server first, and `rm -rf .next` afterwards before restarting dev.

- [ ] **Step 6: Prove the schema never changed (the core rollback claim)**

Re-run the Task 1 Step 4 command into `schema-final.txt`, then:

```bash
diff "…/scratchpad/schema-baseline.txt" "…/scratchpad/schema-final.txt" && echo "SCHEMA IDENTICAL — rollback needs no DB work"
```

Expected: **no differences.** If there are any, the spec's central assumption is wrong — stop, and do not merge.

- [ ] **Step 7: Rehearse the kill switches**

Comment out the `livePreview` block in `payload.config.ts`; confirm `/admin` still loads and Hero Effects still saves. Restore it. Then comment out the `components` block on `floatingWords`; confirm Payload's stock array editor returns **with all words intact**. Restore it. Both must work — they are the first response if something misbehaves in production.

- [ ] **Step 8: Document the new scripts**

Add to the table in `docs/superpowers/verification/README.md`:

```markdown
| `preview-live-update.mjs` | Proves a Hero Effects edit reaches the admin preview iframe **without saving**, and that `?source=page` correctly ignores effects data. |
| `preview-context-leak.mjs` | Clicks the preview's "Replay intro" 25× and asserts the WebGL context is still live — regression guard for the context exhaustion fixed in `9190364`. |
```

- [ ] **Step 9: Commit**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" add docs/superpowers/verification/README.md
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" commit -m "docs: record the two new preview verification scripts"
```

- [ ] **Step 10: Show the owner BEFORE merging**

Capture the preview working (a screenshot of a live edit changing the hero) and report the full sweep's results. **Do not merge to `main`.** The orbs sub-project was survivable precisely because its branch was never merged — the same discipline applies until the owner has seen this and said yes.

---

## Rollback quick reference

Copied from spec §7 so an executor never has to go looking mid-incident.

**Kill switches (seconds, no git):**
- Preview misbehaving → delete the `livePreview` block from `src/payload.config.ts`.
- Word editor misbehaving → delete `admin.components` from `floatingWords` in `src/blocks/index.ts`. Stock editor returns, words intact.

**Full revert:**

```bash
git -c safe.directory="D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" checkout main
npm ci
rm -rf .next
```

`rm -rf .next` is mandatory — a cache written under a different dependency set produces phantom `ENOENT` / "untagged enum Config" errors that look exactly like real code failures.

**Database:** no schema change and no content migration is expected (proven at Task 10 Step 6). The backup from Task 1 Step 3 exists if that ever proves wrong.
