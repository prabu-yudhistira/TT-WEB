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
