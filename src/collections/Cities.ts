import type { CollectionConfig } from 'payload'
import { revalidateHooks } from '../lib/revalidate'

/**
 * Real-world anchor for a business (concept: docs/CONCEPT-SEMESTA.md §4).
 *
 * Cities are a collection rather than a free-text field on `businesses` for one
 * reason: the manifesto map (phase 2) plots pins from lat/lng, and a typed city
 * name cannot be plotted. Making the visitor pick from a list also removes one
 * free-text field from the public form later.
 *
 * Not localized — these are proper nouns, identical in both locales.
 */
export const Cities: CollectionConfig = {
  slug: 'cities',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'region', 'lat', 'lng'], group: 'Semesta' },
  access: { read: () => true },
  hooks: revalidateHooks('businesses'),
  fields: [
    { name: 'name', type: 'text', required: true, unique: true },
    {
      name: 'region',
      type: 'text',
      admin: { description: 'Province or country — shown after the city on a planet label' },
    },
    {
      name: 'lat',
      type: 'number',
      required: true,
      min: -90,
      max: 90,
      admin: { description: 'Decimal degrees, north positive (Surakarta = -7.5665)' },
    },
    {
      name: 'lng',
      type: 'number',
      required: true,
      min: -180,
      max: 180,
      admin: { description: 'Decimal degrees, east positive (Surakarta = 110.8167)' },
    },
  ],
}
