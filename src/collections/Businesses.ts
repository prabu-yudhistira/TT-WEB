import type { CollectionConfig } from 'payload'
import { revalidateHooks } from '../lib/revalidate'

/**
 * A business that orbits the hero logo (concept: docs/CONCEPT-SEMESTA.md §4).
 *
 * A planet is NOT a client claim — it is a business that says it stands with the
 * manifesto. That distinction is what lets outsiders submit one at all.
 *
 * Phase 1 (now): the owner adds these by hand in /admin. Phase 3 adds a public
 * form, and the security line that makes the approval queue mean anything is
 * `access.create` below: public create over REST/GraphQL stays shut, and the
 * form's route handler goes through the Local API with `status` forced to
 * 'pending'. Without that, anyone could POST an approved planet straight onto
 * the front page.
 *
 * Every visitor-facing choice here is a select from a fixed list — no colour
 * picker, no uploads. One free colour would wreck the paper palette in a single
 * submission, and one upload would turn a 60-second approval into real work.
 */

export const BUSINESS_KINDS = [
  'clinic',
  'food',
  'craft',
  'retail',
  'service',
  'education',
  'other',
] as const

export const Businesses: CollectionConfig = {
  slug: 'businesses',
  labels: { singular: 'Business (planet)', plural: 'Businesses (planets)' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'kind', 'status'],
    group: 'Semesta',
    description:
      'Each approved row is one planet orbiting the hero logo. Filter by status = pending to work the approval queue.',
  },
  access: {
    // Anonymous readers see approved planets only. A logged-in editor sees the
    // pending queue too, which is what makes /admin usable as the queue view.
    read: ({ req }) => (req.user ? true : { status: { equals: 'approved' } }),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: revalidateHooks('businesses'),
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 60,
      admin: { description: 'Shown on hover. 60 characters is a name, not a sentence.' },
    },
    { name: 'city', type: 'relationship', relationTo: 'cities', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'other',
      options: [
        { label: 'Klinik / Kesehatan', value: 'clinic' },
        { label: 'Kuliner', value: 'food' },
        { label: 'Kriya / Kerajinan', value: 'craft' },
        { label: 'Ritel', value: 'retail' },
        { label: 'Jasa', value: 'service' },
        { label: 'Pendidikan', value: 'education' },
        { label: 'Lainnya', value: 'other' },
      ],
      admin: { description: 'Decides the planet’s base shape, so two planets never read alike.' },
    },
    {
      name: 'website',
      type: 'text',
      validate: (value: unknown) => {
        if (!value) return true
        if (typeof value !== 'string') return 'Must be a URL'
        try {
          const url = new URL(value)
          // Anything else (javascript:, data:, mailto:) has no business being a
          // planet link, and this field will eventually be filled by strangers.
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return 'Only http:// or https:// links are allowed'
          }
          return true
        } catch {
          return 'Must be a full URL, including https://'
        }
      },
      admin: {
        description:
          'Optional. Rendered rel="nofollow ugc" — this is the field spam submissions come for.',
      },
    },
    {
      name: 'foundedYear',
      type: 'number',
      min: 1900,
      max: 2100,
      admin: {
        description:
          'Sets how close the planet orbits: the older the business, the tighter its orbit.',
      },
    },
    {
      name: 'planet',
      type: 'group',
      admin: { description: 'How the planet is drawn. The submitter picks these.' },
      fields: [
        {
          name: 'size',
          type: 'select',
          defaultValue: 'medium',
          options: [
            { label: 'Kecil', value: 'small' },
            { label: 'Sedang', value: 'medium' },
            { label: 'Besar', value: 'large' },
          ],
        },
        {
          name: 'pattern',
          type: 'select',
          defaultValue: 'plain',
          options: [
            { label: 'Polos', value: 'plain' },
            { label: 'Arsir silang', value: 'crosshatch' },
            { label: 'Titik-titik', value: 'stipple' },
            { label: 'Bercincin', value: 'ringed' },
          ],
        },
        {
          name: 'ink',
          type: 'select',
          defaultValue: 'graphite',
          options: [
            { label: 'Grafit', value: 'graphite' },
            { label: 'Merah pensil', value: 'red' },
            { label: 'Sepia', value: 'sepia' },
            { label: 'Biru tinta', value: 'blue' },
          ],
        },
      ],
    },
    {
      name: 'trail',
      type: 'group',
      admin: { description: 'The mark the planet leaves behind it.' },
      fields: [
        {
          name: 'style',
          type: 'select',
          defaultValue: 'line',
          options: [
            { label: 'Garis tipis', value: 'line' },
            { label: 'Titik-titik', value: 'dots' },
            { label: 'Arsir melintang', value: 'ticks' },
            { label: 'Tanpa jejak', value: 'none' },
          ],
        },
        {
          name: 'length',
          type: 'select',
          defaultValue: 'medium',
          options: [
            { label: 'Pendek', value: 'short' },
            { label: 'Sedang', value: 'medium' },
            { label: 'Panjang', value: 'long' },
          ],
        },
      ],
    },
    {
      name: 'orbit',
      type: 'select',
      options: [
        { label: 'A — dekat, landai', value: 'a' },
        { label: 'B — tengah, miring', value: 'b' },
        { label: 'C — jauh, tegak', value: 'c' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Leave empty and the plane is derived from the name — stable, and spread evenly.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'contactEmail',
      type: 'email',
      access: {
        // Never leaves the admin. It exists so the owner can reply to a
        // submitter, not so the front page can list addresses for scrapers.
        read: ({ req }) => Boolean(req.user),
      },
      admin: { position: 'sidebar', description: 'Admin-only. Never exposed to the public API.' },
    },
  ],
}
