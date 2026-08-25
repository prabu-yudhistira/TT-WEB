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
 * addFieldRow's own row creation. The parent never mounts this until
 * hydration has completed (see HYDRATION below) — mounting it earlier, with
 * every target defaulting to '', would overwrite every row's real word with
 * an empty string the instant the field appears.
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
 * HYDRATION — the trap this component actually shipped with once, caught by
 * testing against a document with REAL saved words rather than an empty one.
 * The array field's own `useField().value` is NOT reliably the populated
 * {word}[] array — Payload keeps each row's data in its own nested field
 * entry (`floatingWords.0.word`, `.1.word`, ...), not inline on the array
 * field's own value. Seeding `text` from `.value` therefore rendered an
 * EMPTY textarea against a document that actually had 12 saved words. That
 * alone would just be a cosmetic bug — but two things downstream turn it
 * destructive:
 *   1. The row-count reconciliation effect reads an empty textarea as
 *      "reduce to zero words" and calls removeFieldRow on every real row.
 *   2. WordRowSync's own write effect fires on mount with target='' for
 *      every existing row, independent of (1) — it would blank every row's
 *      `word` value even if row COUNT were left alone.
 * Fix: read the real current data via `getDataByPath` (confirmed against
 * @payloadcms/ui's own source — it is what `useForm()`'s internal
 * `moveFieldRow` uses to read an array field's current rows) instead of
 * `.value`, and gate BOTH the reconciliation effect and WordRowSync's own
 * mounting on `text !== undefined` — i.e. "we have read real data at least
 * once" — so neither can act against a still-empty placeholder.
 *
 * ROW COUNT is reconciled through addFieldRow/removeFieldRow — the exact same
 * public functions Payload's own Array field uses internally (confirmed by
 * reading @payloadcms/ui's Array field source directly). ROW VALUES are then
 * synced one at a time through WordRowSync above, never through raw
 * dispatchFields. An earlier draft called a fabricated `REPLACE_ROW_ROWS`
 * action that does not exist in the installed Payload build, and a second
 * candidate, `REPLACE_STATE`, turned out to silently wipe every OTHER field
 * in the form — it replaces the whole tracked field-state object with
 * exactly what it is given, it does not merge. Both were caught by reading
 * the real reducer (`fieldReducer.js`) before writing this, not discovered
 * by shipping them. Only documented, real APIs are used here.
 */
export const FloatingWordsField: ArrayFieldClientComponent = (props) => {
  const { field, parentSchemaPath, path: pathFromProps } = props
  const { rows, path } = useField<unknown>({
    hasRows: true,
    potentiallyStalePath: pathFromProps,
  })
  const { addFieldRow, removeFieldRow, getDataByPath, setModified } = useForm()

  // The field's static schema location, required by addFieldRow but not
  // exposed directly — built from the same two pieces Payload's own internals
  // use: the parent's schema path plus this field's own name.
  const schemaPath = [parentSchemaPath, field.name].filter(Boolean).join('.')

  // undefined = "have not read real data yet". Distinct from '' (a genuinely
  // empty, zero-word list that HAS been confirmed) — see the doc comment
  // above for why that distinction is load-bearing, not pedantic.
  const [text, setText] = useState<string | undefined>(undefined)
  const [focused, setFocused] = useState(false)
  const rowCount = rows?.length ?? 0

  // Seed / re-sync from the form's REAL current data (locale switch, a fresh
  // document load, or after our own addFieldRow/removeFieldRow settles) —
  // but never while the owner is actively typing, or the caret jumps.
  useEffect(() => {
    if (focused) return
    const raw = getDataByPath<{ word?: string | null }[]>(path)
    setText(wordsToText(raw))
  }, [focused, rowCount, path, getDataByPath])

  const words = useMemo(() => (text === undefined ? [] : textToWords(text)), [text])

  // Reconcile ROW COUNT to match the textarea. Gated on hydration (see doc
  // comment) — a not-yet-hydrated `words.length === 0` must never be read as
  // "delete every row". Once hydrated, this only acts when the number of
  // non-blank lines actually changes — normal typing inside an existing line
  // never touches this, only pressing Enter/Backspace across a line boundary
  // does, so this cannot repeat the bench's "fires per pixel of drag" bug.
  useEffect(() => {
    if (text === undefined) return
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
  }, [text, words.length, rowCount, path, schemaPath, addFieldRow, removeFieldRow, setModified])

  const displayText = text ?? ''
  const tooMany = displayText.split(/\r?\n/).filter((l) => l.trim()).length > MAX_WORDS
  const overLong = displayText.split(/\r?\n/).some((l) => l.trim().length > MAX_WORD_LEN)

  return (
    <div className="field-type" style={{ marginBottom: 20 }}>
      <label className="field-label" htmlFor={`field-${path}`}>
        {typeof field?.label === 'string' ? field.label : 'Floating words'}
      </label>

      <textarea
        id={`field-${path}`}
        value={displayText}
        rows={Math.min(MAX_WORDS, Math.max(8, words.length + 2))}
        spellCheck={false}
        disabled={text === undefined}
        placeholder={text === undefined ? 'Loading…' : undefined}
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

      {/* Withheld until hydration — see the component doc comment. Then one
          per row that ALREADY EXISTS in form state, never per target word
          (WordRowSync's own doc comment explains why). */}
      {text !== undefined &&
        (rows ?? []).map((row, i) => (
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
