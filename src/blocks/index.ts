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
      name: 'orbitEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Planets orbiting the logo — one per approved business (Semesta → Businesses). Turning this off leaves the logo alone in the hero; nothing else breaks.',
      },
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

export const pageBlocks = [
  HeroBlock,
  ManifestoStripBlock,
  FeaturedWorksBlock,
  ServicesRowsBlock,
  ArchiveTeaserBlock,
  ContactMailtoBlock,
  RichTextBlock,
  MediaFullBlock,
]
