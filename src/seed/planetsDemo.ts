/**
 * FICTIONAL demo planets, so the hero can be judged before real businesses
 * exist.  npm run seed:planets-demo   /   npm run seed:planets-demo -- --clear
 *
 * Deliberately NOT part of `npm run seed`. Every other seeded fact on this site
 * traces to a source document (see content.ts), and these do not: they are
 * invented businesses at invented addresses. Shipping them as real content
 * would be a lie on the front page.
 *
 * Every row is tagged with the marker email below, which is what `--clear`
 * deletes — so removing the demo can never take a real submission with it.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const MARKER = 'demo@example.invalid'

type Demo = {
  name: string
  city: string
  kind: 'clinic' | 'food' | 'craft' | 'retail' | 'service' | 'education' | 'other'
  foundedYear: number
  website?: string
  size: 'small' | 'medium' | 'large'
  pattern: 'plain' | 'crosshatch' | 'stipple' | 'ringed'
  ink: 'graphite' | 'red' | 'sepia' | 'blue'
  trailStyle: 'line' | 'dots' | 'ticks' | 'none'
  trailLength: 'short' | 'medium' | 'long'
}

// Spread on purpose across all four inks, all four patterns, all four trail
// styles and a wide founding-year range — the point of the demo is to show the
// range of the system, not a plausible customer list.
const DEMO: Demo[] = [
  { name: 'Klinik Ranakara', city: 'Surakarta', kind: 'clinic', foundedYear: 2014, website: 'https://example.com', size: 'large', pattern: 'ringed', ink: 'red', trailStyle: 'line', trailLength: 'long' },
  { name: 'Kopi Sendhang', city: 'Yogyakarta', kind: 'food', foundedYear: 2019, size: 'medium', pattern: 'stipple', ink: 'sepia', trailStyle: 'dots', trailLength: 'medium' },
  { name: 'Kriya Wengi', city: 'Surakarta', kind: 'craft', foundedYear: 2008, size: 'medium', pattern: 'crosshatch', ink: 'graphite', trailStyle: 'ticks', trailLength: 'medium' },
  { name: 'Toko Baskara', city: 'Semarang', kind: 'retail', foundedYear: 2021, size: 'small', pattern: 'plain', ink: 'blue', trailStyle: 'line', trailLength: 'short' },
  { name: 'Jasa Wulung', city: 'Bandung', kind: 'service', foundedYear: 2016, website: 'https://example.com', size: 'medium', pattern: 'plain', ink: 'graphite', trailStyle: 'line', trailLength: 'medium' },
  { name: 'Sanggar Tumaruna', city: 'Malang', kind: 'education', foundedYear: 2011, size: 'large', pattern: 'crosshatch', ink: 'sepia', trailStyle: 'dots', trailLength: 'long' },
  { name: 'Nirmala Studio', city: 'Denpasar', kind: 'other', foundedYear: 2023, size: 'small', pattern: 'stipple', ink: 'red', trailStyle: 'none', trailLength: 'short' },
  { name: 'Roti Padi Mas', city: 'Surabaya', kind: 'food', foundedYear: 1998, size: 'large', pattern: 'ringed', ink: 'sepia', trailStyle: 'line', trailLength: 'long' },
  { name: 'Klinik Anindita', city: 'Jakarta', kind: 'clinic', foundedYear: 2005, website: 'https://example.com', size: 'medium', pattern: 'plain', ink: 'red', trailStyle: 'ticks', trailLength: 'medium' },
  { name: 'Ukir Sawitri', city: 'Makassar', kind: 'craft', foundedYear: 2013, size: 'small', pattern: 'crosshatch', ink: 'blue', trailStyle: 'dots', trailLength: 'short' },
  { name: 'Warta Digital', city: 'Medan', kind: 'service', foundedYear: 2020, size: 'medium', pattern: 'stipple', ink: 'graphite', trailStyle: 'line', trailLength: 'medium' },
  { name: 'Ruang Sarwa', city: 'Yogyakarta', kind: 'other', foundedYear: 2017, size: 'small', pattern: 'ringed', ink: 'blue', trailStyle: 'ticks', trailLength: 'long' },
]

const run = async () => {
  const payload = await getPayload({ config })
  const clear = process.argv.includes('--clear')

  const existing = await payload.find({
    collection: 'businesses',
    where: { contactEmail: { equals: MARKER } },
    limit: 200,
  })

  for (const doc of existing.docs) {
    await payload.delete({ collection: 'businesses', id: doc.id })
  }

  if (clear) {
    payload.logger.info(`Demo planets cleared: ${existing.totalDocs} removed.`)
    process.exit(0)
  }

  let created = 0
  let skipped = 0
  for (const demo of DEMO) {
    const city = await payload.find({
      collection: 'cities',
      where: { name: { equals: demo.city } },
      limit: 1,
    })
    if (city.totalDocs === 0) {
      payload.logger.warn(`No city "${demo.city}" — run npm run seed:semesta first. Skipping ${demo.name}.`)
      skipped++
      continue
    }
    await payload.create({
      collection: 'businesses',
      data: {
        name: demo.name,
        city: city.docs[0].id,
        kind: demo.kind,
        website: demo.website,
        foundedYear: demo.foundedYear,
        planet: { size: demo.size, pattern: demo.pattern, ink: demo.ink },
        trail: { style: demo.trailStyle, length: demo.trailLength },
        status: 'approved',
        contactEmail: MARKER,
      },
    })
    created++
  }

  payload.logger.info(
    `Demo planets: ${created} created, ${skipped} skipped, ${existing.totalDocs} replaced. ` +
      'These are fictional — clear them with `npm run seed:planets-demo -- --clear`.',
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
