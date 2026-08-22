'use client'

import { useRowLabel } from '@payloadcms/ui'

/**
 * Row label for Site Settings → `marginNotes`.
 *
 * Payload's default label is the row number alone, which for this field is
 * close to useless: order IS the setting, so the owner's job here is
 * reordering, and a dozen collapsed rows reading "Margin Notes 01…12" have to
 * be opened one at a time to find out what is being reordered.
 *
 * (It lived on the hero's `floatingWords` until planets took the hero over —
 * docs/CONCEPT-SEMESTA.md §3.8. The phone cutoff marker went with it: the
 * manifesto band wraps instead of truncating, so every word survives.)
 */
export function FloatingWordRowLabel() {
  const { data, rowNumber } = useRowLabel<{ word?: string }>()

  const index = typeof rowNumber === 'number' ? rowNumber : 0
  const word = data?.word?.trim()
  const number = String(index + 1).padStart(2, '0')

  return <span>{number} · {word || '(empty)'}</span>
}
