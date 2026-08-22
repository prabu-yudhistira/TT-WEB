/* Real bilingual seed. Content lives in ./content.ts (sourced from the company
   strategy report + the actual project repos); this file only maps it onto the
   Payload schema. Run: npm run seed — idempotent: exits if users already exist. */
import { getPayload } from 'payload'
import config from '@payload-config'
import { content } from './content'

/**
 * Archive drag-canvas layout. Each row is centred on its own item count, so a
 * short final row sits under the middle of the one above instead of hugging the
 * left. Cards are 260px wide and anchor from their top-left corner, so half a
 * card is subtracted to centre the grid on the canvas origin rather than
 * pushing it right and down (which used to clip the leftmost card off-screen).
 */
const CARD_W = 260
const CARD_H = 200
const GAP_X = 440
const GAP_Y = 320

const archiveSlot = (i: number, total: number) => {
  const cols = total <= 6 ? 3 : 4
  const rows = Math.ceil(total / cols)
  const row = Math.floor(i / cols)
  const col = i % cols
  const inRow = Math.min(cols, total - row * cols) // last row is usually shorter
  return {
    x: (col - (inRow - 1) / 2) * GAP_X - CARD_W / 2 + (((i * 73) % 90) - 45),
    y: (row - (rows - 1) / 2) * GAP_Y - CARD_H / 2 + (((i * 37) % 70) - 35),
    scale: 0.85 + ((i * 29) % 31) / 100,
  }
}

const run = async () => {
  const payload = await getPayload({ config })

  const existing = await payload.find({ collection: 'users', limit: 1 })
  if (existing.totalDocs > 0) {
    payload.logger.info('Seed skipped — users already exist.')
    process.exit(0)
  }

  // --- admin user ---
  await payload.create({
    collection: 'users',
    data: {
      email: 'admin@tampa-taruno.local',
      password: process.env.SEED_ADMIN_PASSWORD || 'tampataruno-2026',
      role: 'admin',
    },
  })

  // --- site settings (both locales) ---
  const { settings } = content
  await payload.updateGlobal({
    slug: 'site-settings',
    locale: 'en',
    data: {
      siteName: content.siteName,
      email: content.email,
      locationLine: settings.locationLine.en,
      timezone: 'Asia/Jakarta',
      socials: content.socials,
      navLabels: {
        home: settings.navLabels.home.en,
        manifesto: settings.navLabels.manifesto.en,
        archive: settings.navLabels.archive.en,
      },
      archiveCountTemplate: settings.archiveCountTemplate.en,
      marginNotes: settings.marginNotes.en.map((word) => ({ word })),
      seo: { title: settings.seo.title.en, description: settings.seo.description.en },
    },
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    locale: 'id',
    data: {
      locationLine: settings.locationLine.id,
      navLabels: {
        home: settings.navLabels.home.id,
        manifesto: settings.navLabels.manifesto.id,
        archive: settings.navLabels.archive.id,
      },
      archiveCountTemplate: settings.archiveCountTemplate.id,
      marginNotes: settings.marginNotes.id.map((word) => ({ word })),
      seo: { title: settings.seo.title.id, description: settings.seo.description.id },
    },
  })

  // --- hero effects (not localized) ---
  await payload.updateGlobal({
    slug: 'hero-effects',
    data: {
      separationEnabled: true,
      timing: { chargeMs: 950, reformMs: 2500, separateStart: 0.65, staggerMax: 0.2 },
      motion: {
        spreadFrac: 1.6,
        spreadVar: 0.8,
        lateralDrift: 0.75,
        spinMin: 0.18,
        spinMax: 0.21,
        capNormalMin: 0.79,
      },
      material: {
        normalFollow: 0.55,
        hatchStrength: 0.65,
        hatchScale: 0.5,
        shineStrength: 0.3,
        shineWidth: 0.05,
        shineSpeed: 0.9,
        shineChargeBoost: 1,
        shineWarm: '#B4571C',
        shineBright: '#FFF8E0',
      },
      body: { skinOpacity: 0.6, bodyOpacity: 0, bodyEdgeOpacity: 0.9, bodyEdgeAngle: 26 },
      feel: { vibrateFrac: 0.006, vibratePhaseStep: 1.1, dragThresholdPx: 6 },
      ignitionEnabled: true,
      ignitionTiming: { ignitionMs: 2000, seedEnd: 0.12, frontEnd: 0.78, cueFrac: 0.73 },
      ignitionShape: {
        seedOffsetX: 0,
        seedOffsetY: 0,
        seedOffsetZ: 0,
        frontSoftness: 0.18,
        wakeLag: 0.1,
        coreRadius: 0.22,
        coreStrength: 1,
      },
      ignitionCage: { cageDensity: 0.3, cageDensityMobile: 0.3, cageOpacity: 0.26, cageSeed: 1337 },
      ignitionColor: {
        coldColor: '#2B2A27',
        warmColor: '#8E1114',
        hotColor: '#C8341A',
        crestColor: '#FFF8E0',
        darkMassOpacity: 0.12,
        glowDecay: 2.4,
      },
      ignitionOverlay: {
        overlayEnabled: true,
        overlayLeadMs: 1000,
        sphereScale: 1,
        bloomScale: 1.1,
        polySides: 8,
        bloomStart: 0.15,
        bloomEnd: 0.6,
        morphStart: 0.6,
      },
      ignitionPulse: { pulseEnabled: true, pulseMs: 2500 },
      ignitionLife: {
        wireJitter: 0.07,
        wireSpeed: 6,
        sparkStagger: 0.215,
        sparkRate: 2.3,
        sparkDensity: 0.19,
        sparkIdle: 0.25,
      },
      ignitionEmbers: {
        emberEnabled: true,
        emberDensity: 0.39,
        emberSize: 5,
        emberTwinkle: 2.5,
        emberOpacity: 0.95,
      },
    },
  })

  // --- manifesto statements ---
  for (let i = 0; i < content.manifesto.length; i++) {
    const s = content.manifesto[i]
    const doc = await payload.create({
      collection: 'manifesto-statements',
      locale: 'en',
      data: { text: s.en, order: i },
    })
    await payload.update({
      collection: 'manifesto-statements',
      id: doc.id,
      locale: 'id',
      data: { text: s.id },
    })
  }

  // --- services ---
  for (let i = 0; i < content.services.length; i++) {
    const s = content.services[i]
    const doc = await payload.create({
      collection: 'services',
      locale: 'en',
      data: {
        name: s.name.en,
        tagline: s.tagline.en,
        description: s.description.en,
        capabilities: s.capabilities.en.map((item) => ({ item })),
        projectCount: s.projectCount,
        icon: s.icon,
        order: i,
      },
    })
    await payload.update({
      collection: 'services',
      id: doc.id,
      locale: 'id',
      data: {
        name: s.name.id,
        tagline: s.tagline.id,
        description: s.description.id,
        capabilities: s.capabilities.id.map((item) => ({ item })),
      },
    })
  }

  // --- works ---
  for (let i = 0; i < content.works.length; i++) {
    const wk = content.works[i]
    const doc = await payload.create({
      collection: 'works',
      locale: 'en',
      data: {
        title: wk.title.en,
        slug: wk.slug,
        category: wk.category,
        year: wk.year,
        oneLiner: wk.oneLiner.en,
        servicesLine: wk.servicesLine.en,
        industry: wk.industry.en,
        location: wk.location.en,
        featured: wk.featured,
        archiveSlot: archiveSlot(i, content.works.length),
        order: i,
      },
    })
    await payload.update({
      collection: 'works',
      id: doc.id,
      locale: 'id',
      data: {
        title: wk.title.id,
        oneLiner: wk.oneLiner.id,
        servicesLine: wk.servicesLine.id,
        industry: wk.industry.id,
        location: wk.location.id,
      },
    })
  }

  // --- homepage (one shared layout; localized fields inside blocks) ---
  const { hero, headings } = content
  const home = await payload.create({
    collection: 'pages',
    locale: 'en',
    draft: false,
    data: {
      title: 'Homepage',
      slug: 'home',
      _status: 'published',
      layout: [
        {
          blockType: 'hero',
          line1: hero.line1.en,
          line2: hero.line2.en,
          locationLine: settings.locationLine.en,
          scrollCue: hero.scrollCue.en,
          orbitEnabled: true,
        },
        { blockType: 'manifestoStrip' },
        { blockType: 'featuredWorks', heading: headings.featuredWorks.en },
        { blockType: 'servicesRows', heading: headings.services.en },
        { blockType: 'archiveTeaser', countTemplate: settings.archiveCountTemplate.en },
        { blockType: 'contactMailto', heading: headings.contact.en },
      ],
    },
  })
  // second-locale values for the SAME blocks (match by block id)
  const created = await payload.findByID({ collection: 'pages', id: home.id, depth: 0 })
  const idValues: Record<string, Record<string, unknown>> = {
    hero: {
      line1: hero.line1.id,
      line2: hero.line2.id,
      locationLine: settings.locationLine.id,
      scrollCue: hero.scrollCue.id,
    },
    featuredWorks: { heading: headings.featuredWorks.id },
    servicesRows: { heading: headings.services.id },
    archiveTeaser: { countTemplate: settings.archiveCountTemplate.id },
    contactMailto: { heading: headings.contact.id },
  }
  await payload.update({
    collection: 'pages',
    id: home.id,
    locale: 'id',
    draft: false,
    data: {
      title: settings.navLabels.home.id,
      _status: 'published',
      layout: (created.layout || []).map((b: any) => ({
        ...b,
        ...(idValues[b.blockType] || {}),
      })),
    },
  })

  payload.logger.info(
    `Seed complete: admin user, settings, ${content.manifesto.length} statements, ` +
      `${content.services.length} services, ${content.works.length} works, homepage (en+id).`
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
