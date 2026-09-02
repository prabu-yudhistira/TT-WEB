/**
 * Bring an EXISTING install to the Section 2 layout. Plan Task 16.
 *
 * ⚠️ Why this exists at all: `npm run seed` cannot do it.
 *
 * The seed bails on its first line with "Seed skipped — users already exist",
 * which is correct and deliberate — it is a fresh-install script, and letting it
 * re-run would overwrite `hero-effects`, where the owner's tuned values diverge
 * from code defaults (spec §7.1). So on any database that has ever been seeded,
 * Task 16's "reseed" step is a no-op, and the homepage keeps its six old blocks
 * for ever. This does the same two writes the seed now does for a fresh install:
 *
 *   1. the homepage layout becomes exactly `hero` + `samsaraRoom`
 *   2. the `samsara-sequence` global is written from the frozen config
 *
 * ⚠️ It does NOT touch `hero-effects`, for the reason above.
 *
 * The five retired blocks are removed from the PAGE only. Their definitions stay
 * in `pageBlocks`, so their tables survive; the content they rendered lives in
 * its own collections (manifesto statements, works, services) and is untouched.
 *
 * Back up the database first. Then:
 *   node --env-file=.env --import tsx scripts/apply-section2-layout.mjs
 *   (stop the dev server, rm -rf .next/cache, restart — unstable_cache persists
 *    to disk and survives a clear made while the server is running)
 */
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { DEFAULT_SEQUENCE } from '../src/lib/samsara/types.ts'
import { toSamsaraPayload, resolveSamsara } from '../src/lib/samsara/resolveSamsara.ts'

const KEEP = ['hero', 'samsaraRoom']

/**
 * Drop the ids of NESTED array rows, keeping the block's own id.
 *
 * ⚠️ Not cosmetic — writing them back is destructive. Payload updates an array
 * field by deleting its rows and re-inserting; the hero's `floatingWords` rows
 * carry ids that are unique per row, not per locale, so re-sending them fails on
 * `UNIQUE constraint failed: pages_blocks_hero_floating_words.id` AFTER the
 * delete has already happened. The first run of this script did exactly that and
 * left the homepage with one block and zero floating words in both locales.
 *
 * The BLOCK's own id must survive, though: it is what matches a block across
 * locales, and dropping it orphans every Indonesian value stored against it.
 */
const stripRowIds = (block) =>
  Object.fromEntries(
    Object.entries(block).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.map((row) => (row && typeof row === 'object' ? omitId(row) : row)) : v,
    ]),
  )
const omitId = ({ id: _drop, ...rest }) => rest

const payload = await getPayload({ config })

const found = await payload.find({
  collection: 'pages',
  where: { slug: { equals: 'home' } },
  locale: 'en',
  depth: 0,
  limit: 1,
})
const home = found.docs[0]
if (!home) throw new Error('no homepage')

const before = (home.layout || []).map((b) => b.blockType)
console.log('layout before:', before.join(' -> '))

// Keep the existing hero block OBJECT, ids and all: dropping the id would make
// Payload treat it as a new block and the Indonesian locale values, which are
// stored against that id, would be orphaned.
const kept = (home.layout || []).filter((b) => KEEP.includes(b.blockType))
if (!kept.some((b) => b.blockType === 'hero')) throw new Error('refusing to run: no hero block')

if (!kept.some((b) => b.blockType === 'samsaraRoom')) {
  kept.push({
    blockType: 'samsaraRoom',
    chatHeading: 'Ask SAMSARA',
    chatPlaceholder: 'Coming soon…',
  })
}
// hero first, then the room.
kept.sort((a, b) => KEEP.indexOf(a.blockType) - KEEP.indexOf(b.blockType))

await payload.update({
  collection: 'pages',
  id: home.id,
  locale: 'en',
  data: { layout: kept.map(stripRowIds) },
})

/**
 * Now the Indonesian locale.
 *
 * ⚠️ Read back in `id`, NOT in `en`. The block structure is shared across
 * locales, so the write above has already removed the retired blocks from both;
 * what differs per locale are the field values. Mapping over the ENGLISH layout
 * here would write "sketch, craft, design…" over the Indonesian "sketsa, kriya,
 * desain…" — a silent translation loss that nothing else in the project would
 * have caught.
 */
const idDoc = await payload.findByID({ collection: 'pages', id: home.id, locale: 'id', depth: 0 })
const idValues = {
  samsaraRoom: { chatHeading: 'Tanya SAMSARA', chatPlaceholder: 'Segera hadir…' },
}
await payload.update({
  collection: 'pages',
  id: home.id,
  locale: 'id',
  data: {
    layout: (idDoc.layout || []).map((b) => ({
      ...stripRowIds(b),
      ...(idValues[b.blockType] || {}),
    })),
  },
})

await payload.updateGlobal({
  slug: 'samsara-sequence',
  data: toSamsaraPayload(DEFAULT_SEQUENCE),
})

const after = await payload.findByID({ collection: 'pages', id: home.id, locale: 'en', depth: 0 })
console.log('layout after :', (after.layout || []).map((b) => b.blockType).join(' -> '))
const seq = resolveSamsara(await payload.findGlobal({ slug: 'samsara-sequence' }))
console.log(
  'global matches the frozen config:',
  JSON.stringify(seq) === JSON.stringify(DEFAULT_SEQUENCE),
)
process.exit(0)
