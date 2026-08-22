import type { GlobalConfig } from 'payload'
import { globalRevalidateHook } from '../lib/revalidate'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: { read: () => true },
  hooks: { afterChange: [globalRevalidateHook('settings')] },
  fields: [
    { name: 'siteName', type: 'text', defaultValue: 'TAMPA TARUNO' },
    { name: 'email', type: 'email' },
    { name: 'locationLine', type: 'text', localized: true },
    {
      name: 'timezone',
      type: 'text',
      defaultValue: 'Asia/Jakarta',
      admin: { description: 'IANA timezone for the live clock in the contact section' },
    },
    {
      name: 'socials',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
    {
      name: 'navLabels',
      type: 'group',
      admin: { description: 'Labels for the numbered nav (001/002/003 numbering is automatic)' },
      fields: [
        { name: 'home', type: 'text', localized: true },
        { name: 'manifesto', type: 'text', localized: true },
        { name: 'archive', type: 'text', localized: true },
      ],
    },
    { name: 'archiveCountTemplate', type: 'text', localized: true },
    {
      // Moved off the hero block when planets took the hero over
      // (docs/CONCEPT-SEMESTA.md §3.8). The words are the studio's own
      // vocabulary; they now sit on the manifesto, where the studio is doing
      // the talking, instead of competing with other people's businesses.
      name: 'marginNotes',
      type: 'array',
      localized: true,
      maxRows: 18,
      labels: { singular: 'Word', plural: 'Words' },
      admin: {
        description:
          'Vocabulary band on the manifesto page — 8 to 12 short words reads best. Order is the setting: they are laid out in this order.',
        components: {
          // Default label is the row number alone, which is useless for a field
          // whose whole job is ordering. See the component for the reasoning.
          RowLabel: '@/admin/FloatingWordRowLabel#FloatingWordRowLabel',
        },
      },
      fields: [{ name: 'word', type: 'text', required: true, maxLength: 24 }],
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'description', type: 'textarea', localized: true },
      ],
    },
  ],
}
