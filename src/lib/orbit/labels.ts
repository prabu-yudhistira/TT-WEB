import type { BusinessKind } from './types'

/**
 * Reader-facing names for the business kinds.
 *
 * Kept out of the CMS on purpose: `kind` is an enum the code maps to a planet
 * shape, so a label edited in /admin could drift from the shape it names. The
 * admin select's own labels (collections/Businesses.ts) are the editor's view
 * of the same list — change one, change the other.
 */
export const KIND_LABEL: Record<BusinessKind, { en: string; id: string }> = {
  clinic: { en: 'Clinic & health', id: 'Klinik & kesehatan' },
  food: { en: 'Food & drink', id: 'Kuliner' },
  craft: { en: 'Craft', id: 'Kriya' },
  retail: { en: 'Retail', id: 'Ritel' },
  service: { en: 'Services', id: 'Jasa' },
  education: { en: 'Education', id: 'Pendidikan' },
  other: { en: 'Other', id: 'Lainnya' },
}
