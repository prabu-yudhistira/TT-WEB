/**
 * Conversion between the hero word textarea (one word per line) and Payload's
 * array-row shape for `floatingWords`.
 *
 * Limits mirror the field's own contract in src/blocks/index.ts exactly:
 * maxRows 18, and 24 characters per word.
 *
 * Order used to matter for a mobile word cap when ConstellationField rendered
 * this field (its own MOBILE_MAX_WORDS truncated to the first 8 on small
 * screens, now removed along with that component). The satellites that
 * replaced it have no such cap — every word gets its own satellite on every
 * breakpoint — so order here is purely the editor's own priority, not a
 * truncation boundary.
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
