import type { Block } from 'payload'

// Homepage layout blocks (spec §6 / Synapser §1.2). The owner reorders these
// in /admin; RenderBlocks maps slugs to section components.

export const HeroBlock: Block = {
  slug: 'hero',
  labels: { singular: 'Hero', plural: 'Heroes' },
  fields: [
    { name: 'line1', type: 'text', localized: true, required: true },
    { name: 'line2', type: 'text', localized: true },
    { name: 'locationLine', type: 'text', localized: true },
    { name: 'scrollCue', type: 'text', localized: true },
    {
      name: 'constellationEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Floating "margin note" words tethered to the logo by pencil strings (decorative; hero looks complete without them)',
      },
    },
    {
      name: 'floatingWords',
      type: 'array',
      localized: true,
      maxRows: 18,
      admin: {
        description:
          '8–18 short words orbiting the logo, one satellite each — on every screen size. Colours are set per orbit slot under Hero Effects → Satellites.',
        // UI-only swap: one textarea instead of 18 collapsible rows. The stored
        // shape is unchanged — delete this `components` block and Payload's
        // stock array editor returns with every word intact.
        components: {
          Field: '@/components/admin/FloatingWordsField#FloatingWordsField',
        },
      },
      fields: [{ name: 'word', type: 'text', required: true, maxLength: 24 }],
    },
  ],
}

export const ManifestoStripBlock: Block = {
  slug: 'manifestoStrip',
  labels: { singular: 'Manifesto strip', plural: 'Manifesto strips' },
  fields: [{ name: 'heading', type: 'text', localized: true }],
}

export const FeaturedWorksBlock: Block = {
  slug: 'featuredWorks',
  labels: { singular: 'Featured works', plural: 'Featured works' },
  fields: [{ name: 'heading', type: 'text', localized: true }],
}

export const ServicesRowsBlock: Block = {
  slug: 'servicesRows',
  labels: { singular: 'Services rows', plural: 'Services rows' },
  fields: [{ name: 'heading', type: 'text', localized: true }],
}

export const ArchiveTeaserBlock: Block = {
  slug: 'archiveTeaser',
  labels: { singular: 'Archive teaser', plural: 'Archive teasers' },
  fields: [
    // "{{count}} projects in the archive" — {{count}} replaced at render
    { name: 'countTemplate', type: 'text', localized: true },
  ],
}

export const ContactMailtoBlock: Block = {
  slug: 'contactMailto',
  labels: { singular: 'Contact (mailto)', plural: 'Contacts (mailto)' },
  fields: [
    { name: 'heading', type: 'text', localized: true },
    { name: 'emailOverride', type: 'email' },
  ],
}

export const RichTextBlock: Block = {
  slug: 'richText',
  fields: [{ name: 'content', type: 'richText', localized: true }],
}

export const MediaFullBlock: Block = {
  slug: 'mediaFull',
  fields: [
    { name: 'media', type: 'upload', relationTo: 'media' },
    { name: 'caption', type: 'text', localized: true },
  ],
}

/**
 * Section 2 — the dark room SAMSARA lands in. Spec §7.7.
 *
 * ⚠️ Text ONLY. Everything about how the room looks and behaves — palette, key
 * light, camera, the landing pose, the gesture thresholds — lives in the
 * `samsara-sequence` GLOBAL, not here, because it is behaviour rather than
 * content and because it is tuned at /dev/samsara and frozen into
 * `lib/samsara/types.ts` by hand. A colour field here would be a second,
 * silently-diverging source for a value the bench already owns.
 */
export const SamsaraRoomBlock: Block = {
  slug: 'samsaraRoom',
  labels: { singular: 'SAMSARA room', plural: 'SAMSARA rooms' },
  /**
   * ⚠️ No fields, and that is deliberate rather than unfinished.
   *
   * The block carried `chatHeading` and `chatPlaceholder` for the chatbox stub,
   * which was removed on 2026-09-03. Everything else about Section 2 — colour,
   * light, camera, timings — lives in the `samsara-sequence` global, so the
   * block is now purely a marker saying "the room goes here", which is what lets
   * the owner position and reorder it in /admin.
   *
   * A block with no fields is valid; Payload keeps its `pages_blocks_samsara_room`
   * row for id and order. The holographic screen adds its own copy fields back
   * here if it needs any.
   */
  fields: [],
}

export const pageBlocks = [
  HeroBlock,
  SamsaraRoomBlock,
  // ⚠️ The five below are RETIRED from the homepage but MUST stay registered.
  // Removing a block definition drops its child tables on the next schema
  // push, which is content destroyed rather than content hidden.
  ManifestoStripBlock,
  FeaturedWorksBlock,
  ServicesRowsBlock,
  ArchiveTeaserBlock,
  ContactMailtoBlock,
  RichTextBlock,
  MediaFullBlock,
]
