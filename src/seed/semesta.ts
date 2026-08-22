/**
 * Backfill for the universe rework (docs/CONCEPT-SEMESTA.md, phase 1).
 * Run once after `npm run db:push`:  npm run seed:semesta
 *
 * The main seed (./index.ts) exits early whenever a user already exists, which
 * is correct — it is a first-run script and re-running it would duplicate every
 * work and service. But that also means an existing database never receives the
 * two new things phase 1 introduces: the city list, and the margin-note words
 * in their new home on Site Settings.
 *
 * So this script is additive and safe to run twice: it creates only what is
 * missing and never overwrites an edit the owner has already made.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { content } from './content'

/**
 * Section headings the universe rework rewrote (docs/CONCEPT-SEMESTA.md §6).
 * Replaced only where the stored value is still the original seeded string —
 * anything the owner has since edited is left exactly as it is.
 */
const HEADINGS: Record<string, { from: { en: string; id: string }; to: { en: string; id: string } }> = {
  featuredWorks: {
    from: { en: 'REAL WORK', id: 'KARYA NYATA' },
    to: content.headings.featuredWorks,
  },
  servicesRows: {
    from: { en: 'WHAT WE TAKE ON', id: 'YANG KAMI KERJAKAN' },
    to: content.headings.services,
  },
}

const run = async () => {
  const payload = await getPayload({ config })

  // --- cities ---
  let created = 0
  for (const city of content.cities) {
    const existing = await payload.find({
      collection: 'cities',
      where: { name: { equals: city.name } },
      limit: 1,
    })
    if (existing.totalDocs > 0) continue
    await payload.create({ collection: 'cities', data: city })
    created++
  }

  // --- margin notes, moved off the hero block ---
  const settings = await payload.findGlobal({ slug: 'site-settings', locale: 'en' })
  let notesWritten = false
  if (!settings.marginNotes || settings.marginNotes.length === 0) {
    await payload.updateGlobal({
      slug: 'site-settings',
      locale: 'en',
      data: { marginNotes: content.settings.marginNotes.en.map((word) => ({ word })) },
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      locale: 'id',
      data: { marginNotes: content.settings.marginNotes.id.map((word) => ({ word })) },
    })
    notesWritten = true
  }

  // --- section headings ---
  let headingsUpdated = 0
  for (const locale of ['en', 'id'] as const) {
    const res = await payload.find({
      collection: 'pages',
      where: { slug: { equals: 'home' } },
      locale,
      depth: 0,
      limit: 1,
    })
    const page = res.docs[0]
    if (!page) continue

    let changed = false
    const layout = (page.layout || []).map((block: any) => {
      const rule = HEADINGS[block.blockType]
      if (!rule || block.heading !== rule.from[locale]) return block
      changed = true
      return { ...block, heading: rule.to[locale] }
    })
    if (!changed) continue

    await payload.update({
      collection: 'pages',
      id: page.id,
      locale,
      draft: false,
      data: { layout, _status: 'published' },
    })
    headingsUpdated++
  }

  payload.logger.info(
    `Semesta backfill: ${created} city/cities created (${content.cities.length - created} already there), ` +
      `margin notes ${notesWritten ? 'written' : 'left alone — already set'}, ` +
      `headings updated in ${headingsUpdated} locale(s).`,
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
