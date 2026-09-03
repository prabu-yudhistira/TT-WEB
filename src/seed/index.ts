/* Bilingual lorem seed (owner 2026-07-12: "fill it with Lorem ipsum", real info later).
   Run: npm run seed  — idempotent: exits if users already exist. */
import { getPayload } from 'payload'
import config from '@payload-config'
import { DEFAULT_SEQUENCE } from '../lib/samsara/types'
import { toSamsaraPayload } from '../lib/samsara/resolveSamsara'

const lorem = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore.',
  'Ut enim ad minim veniam, quis nostrud exercitation.',
  'Duis aute irure dolor in reprehenderit in voluptate.',
  'Excepteur sint occaecat cupidatat non proident.',
  'Sunt in culpa qui officia deserunt mollit anim.',
]
const id = (s: string) => `${s} (ID)` // visibly proves the locale switch until real copy arrives

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
  await payload.updateGlobal({
    slug: 'site-settings',
    locale: 'en',
    data: {
      siteName: 'TAMPA TARUNO',
      email: 'yuthista@gmail.com',
      locationLine: 'Lorem ipsum — GMT+7',
      timezone: 'Asia/Jakarta',
      socials: [
        { label: 'Instagram', url: 'https://instagram.com/' },
        { label: 'LinkedIn', url: 'https://linkedin.com/' },
      ],
      navLabels: { home: 'Homepage', manifesto: 'Manifesto', archive: 'Archive' },
      archiveCountTemplate: '{{count}} projects in the archive',
      seo: { title: 'TAMPA TARUNO', description: lorem[0] },
    },
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    locale: 'id',
    data: {
      locationLine: 'Kota Lorem — GMT+7',
      navLabels: { home: 'Beranda', manifesto: 'Manifesto', archive: 'Arsip' },
      archiveCountTemplate: '{{count}} proyek dalam arsip',
      seo: { title: 'TAMPA TARUNO', description: id(lorem[0]) },
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
      // Owner-approved satellite values, tuned live at /dev/satellites and
      // signed off 2026-08-26. These mirror DEFAULT_SATELLITES exactly; the
      // check suite in lib/satellites/types.check.ts pins the same numbers.
      //
      // ⚠ This block only runs on a FRESH install. The seed bails early with
      // "Seed skipped — users already exist", so adding values here does NOT
      // backfill an existing dev or production database. Payload's own
      // defaultValue covers the scalar fields on read, but `satelliteColors`
      // is an array and arrays have no defaultValue — an existing install
      // shows an EMPTY colour list in /admin until it is written. Write it
      // with an authenticated POST to /api/globals/hero-effects
      // (toSatellitesPayload(DEFAULT_SATELLITES) produces exactly this shape),
      // or through the dev bench's save button.
      satellitesEnabled: true,
      satelliteField: {
        innerRadius: 3,
        outerRadius: 1.6,
        mobileInnerRadius: 1.5,
        mobileOuterRadius: 0.78,
        tilt: 20,
        tiltSideway: 160,
        perspective: 1300,
      },
      satelliteMotion: { orbitSpeed: 2.2, orbitCcw: true, speedScale: 0.8, trail: 42 },
      satelliteLook: {
        size: 4,
        alpha: 0.95,
        shade: 1,
        depthScale: 0.9,
        streak: 1,
        ring: 1.1,
        bandInner: 0.5,
        bandOuter: 0.8,
        tiltSpread: 15,
        baseColor: '#8E1114',
      },
      // 12 colours to match the 12 hero words after "samsara" moved to the
      // mascot (2026-08-28). Colour belongs to the ORBIT SLOT, not the word —
      // dropping the leading '#000000' kept every remaining word its tuned hue.
      satelliteColors: [
        '#ffd500',
        '#f96d3e',
        '#23e126',
        '#0f8a75',
        '#04b1b4',
        '#13118d',
        '#2B2A27',
        '#b04803',
        '#145c0a',
        '#118d1f',
        '#b400cc',
        '#bd0000',
      ].map((color) => ({ color })),
      satelliteLabels: {
        mode: 'always',
        size: 12,
        color: '#2B2A27',
        offset: 14,
        hoverRadius: 90,
      },
      satelliteHold: { freeze: true, shakePx: 3, shakeSpeed: 1.1 },
      satelliteBehaviour: { entranceMs: 1600, scrollFadeVh: 0.6, seed: 20260826 },

      // Owner-tuned at /dev/mascot and signed off 2026-08-28. Mirrors
      // DEFAULT_MASCOT exactly; src/lib/mascot/types.check.ts pins the same
      // numbers. Like the satellites block above, this only runs on a FRESH
      // install — an existing DB reads Payload's field defaultValues, which
      // cover every mascot field (no arrays here), so resolveMascot returns
      // the right values even before anyone opens /admin.
      mascotEnabled: true,
      mascotLabelText: 'SAMSARA',
      mascotOrbit: {
        radius: 0.71,
        mobileRadius: 0.55,
        height: 136,
        tiltOffset: 0,
        phase: 88,
        speedScale: 0.52,
      },
      mascotLook: {
        size: 28,
        mobileSize: 18,
        depthScale: 0.3,
        opacity: 1,
        envIntensity: 1,
        lightIntensity: 1.5,
      },
      mascotSpin: { spinSpeed: 113, spinTilt: 12, bobPx: 0, bobSeconds: 8.8 },
      mascotTrail: {
        enabled: true,
        seconds: 1.4,
        density: 130,
        size: 10,
        spread: 6.5,
        drift: 25,
        glow: 0.95,
        twinkle: 0.45,
        opacity: 0.75,
        additive: true,
        color: '#FDB721',
        coreColor: '#FFFCD6',
      },
      mascotLabel: { enabled: true, size: 12, color: '#2B2A27', offset: 14, halo: 0 },
      mascotHold: { freeze: true, shakePx: 1.5, shakeSpeed: 1 },
      mascotBehaviour: { entranceMs: 1600, scrollFadeVh: 0.6 },

      // Eyes — owner-tuned at /dev/mascot across three rounds, signed off
      // 2026-08-28. Mirrors DEFAULT_MASCOT_EYES exactly;
      // src/lib/mascot/eyeTypes.check.ts pins the same numbers. The expression
      // SHAPES are frozen in src/lib/mascot/eyes.ts and are not seeded.
      mascotEyesEnabled: true,
      mascotEyesLook: {
        color: '#F2A81C',
        coreColor: '#FFF0BE',
        socketColor: '#000000',
        glow: 0.55,
        gap: 0.38,
        socketSpan: 1.34,
      },
      mascotEyesScanlines: { max: 9, minBodyPx: 44, ramp: 12 },
      mascotEyesBeat: {
        glanceSeconds: 0.6,
        glancePeak: 0.45,
        facingThreshold: 0.3,
        chargeCrossover: 0.7,
        noRepeat: false,
      },
      mascotEyesWeights: {
        neutral: 0,
        blink: 2,
        squint: 1,
        wide: 0,
        happy: 1,
        lookLeft: 1,
        lookRight: 1,
        lookUp: 1,
        lookDown: 1,
        lookUpLeft: 1,
        lookUpRight: 1,
        lookDownLeft: 1,
        lookDownRight: 1,
        wink: 1,
      },
    },
  })

  // --- manifesto statements ---
  for (let i = 0; i < 6; i++) {
    const doc = await payload.create({
      collection: 'manifesto-statements',
      locale: 'en',
      data: { text: lorem[i], order: i },
    })
    await payload.update({
      collection: 'manifesto-statements',
      id: doc.id,
      locale: 'id',
      data: { text: id(lorem[i]) },
    })
  }

  // --- services (structural names kept; tagline/description/capabilities lorem) ---
  const services = ['Brand Strategy', 'Interface Design', 'Immersive & Motion', 'Engineering']
  const serviceIcons = ['strategy', 'grid', 'motion', 'code'] as const
  const serviceCounts = [3, 2, 3, 2]
  for (let i = 0; i < services.length; i++) {
    const caps = (n: number, loc: (s: string) => string) =>
      Array.from({ length: 4 }, (_, k) => ({ item: loc(lorem[(i + k) % 6].slice(0, 42)) }))
    const doc = await payload.create({
      collection: 'services',
      locale: 'en',
      data: {
        name: services[i],
        tagline: lorem[i % 6].slice(0, 56),
        description: `${lorem[(i + 1) % 6]} ${lorem[(i + 2) % 6]}`.slice(0, 180),
        capabilities: caps(i, (s) => s),
        projectCount: serviceCounts[i],
        icon: serviceIcons[i],
        order: i,
      },
    })
    await payload.update({
      collection: 'services',
      id: doc.id,
      locale: 'id',
      data: {
        name: services[i],
        tagline: id(lorem[i % 6].slice(0, 56)),
        description: id(`${lorem[(i + 1) % 6]} ${lorem[(i + 2) % 6]}`.slice(0, 180)),
        capabilities: caps(i, id),
      },
    })
  }

  // --- works ×12 (5 featured), deterministic archive scatter ---
  const cats = ['brand', 'web', 'motion', 'engineering'] as const
  const svcLines = [
    'Lorem Ipsum, Dolor Sit, Amet Consectetur',
    'Adipiscing Elit, Sed Eiusmod, Tempor',
    'Incididunt Labore, Dolore Magna, Aliqua',
    'Enim Minim, Veniam Quis, Nostrud',
  ]
  const industries = ['Lorem Industry', 'Ipsum Sector', 'Dolor Field', 'Amet Domain']
  const locations = ['Jakarta', 'Bandung', 'Surabaya', 'Yogyakarta']
  for (let i = 0; i < 12; i++) {
    const jx = ((i * 73) % 90) - 45 // deterministic jitter
    const jy = ((i * 37) % 70) - 35
    const doc = await payload.create({
      collection: 'works',
      locale: 'en',
      data: {
        title: `Lorem Project ${String(i + 1).padStart(2, '0')}`,
        slug: `lorem-project-${i + 1}`,
        category: cats[i % 4],
        year: 2022 + (i % 4),
        oneLiner: lorem[i % 6],
        servicesLine: svcLines[i % 4],
        industry: industries[i % 4],
        location: locations[i % 4],
        featured: i < 5,
        archiveSlot: {
          x: (i % 4) * 440 - 660 + jx,
          y: Math.floor(i / 4) * 320 - 320 + jy,
          scale: 0.85 + ((i * 29) % 31) / 100,
        },
        order: i,
      },
    })
    await payload.update({
      collection: 'works',
      id: doc.id,
      locale: 'id',
      data: {
        title: `Proyek Lorem ${String(i + 1).padStart(2, '0')}`,
        oneLiner: id(lorem[i % 6]),
        servicesLine: id(svcLines[i % 4]),
        industry: id(industries[i % 4]),
        location: locations[i % 4],
      },
    })
  }

  // --- the SAMSARA transition (not localized) ---
  //
  // Seeded straight from the frozen config, so a fresh install matches what
  // ships without anyone opening /admin. Spec §7.1: unlike `hero-effects`, this
  // global has no owner tuning that diverges from code, so writing it here is
  // safe rather than destructive.
  //
  // ⚠️ It is written through toSamsaraPayload() rather than by hand. A literal
  // object here would be a THIRD copy of ~75 approved numbers, and the two that
  // already existed both went stale within a day (MascotEngine's uniform
  // defaults, and resolveMascotEyes.check's fixture).
  await payload.updateGlobal({
    slug: 'samsara-sequence',
    data: toSamsaraPayload(DEFAULT_SEQUENCE) as never,
  })

  // --- homepage (one shared layout; localized fields inside blocks) ---
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
          line1: 'Mitreka Satata',
          line2: 'Jer Basuki Mawa Bea',
          locationLine: 'Lorem ipsum — GMT+7',
          scrollCue: 'Scroll',
          constellationEnabled: true,
          floatingWords: [
            'sketch', 'craft', 'design', 'identity', 'motion', 'detail',
            'story', 'precision', 'digital', 'atelier', 'jakarta', 'brand',
          ].map((word) => ({ word })),
        },
        // Section 2. Spec §7.7: the homepage is exactly these TWO blocks now.
        //
        // ⚠️ The five blocks that used to follow — manifestoStrip, featuredWorks,
        // servicesRows, archiveTeaser, contactMailto — are RETIRED from this page,
        // not deleted. Their definitions stay in `pageBlocks` (see
        // src/blocks/index.ts) precisely so their tables survive the next schema
        // push, and the content they rendered still lives in its own collections
        // (manifesto statements, works, services). Section 3 will use them again.
        // No fields: the chatbox stub that owned them was removed 2026-09-03.
        { blockType: 'samsaraRoom' },
      ],
    },
  })
  // second-locale values for the SAME blocks (match by block id)
  const created = await payload.findByID({ collection: 'pages', id: home.id, depth: 0 })
  const idValues: Record<string, Record<string, unknown>> = {
    hero: {
      line1: 'Mitreka Satata',
      line2: 'Jer Basuki Mawa Bea',
      locationLine: 'Kota Lorem — GMT+7',
      scrollCue: 'Gulir',
      floatingWords: [
        'sketsa', 'kriya', 'desain', 'identitas', 'gerak', 'detail',
        'cerita', 'presisi', 'digital', 'atelier', 'jakarta', 'merek',
      ].map((word) => ({ word })),
    },
    // Kept for the retired blocks: they are not on the homepage any more, but
    // this map is keyed by blockType and costs nothing to leave complete, so
    // Section 3 does not have to rediscover the Indonesian headings.
    featuredWorks: { heading: 'Karya pilihan' },
    servicesRows: { heading: 'Layanan' },
    archiveTeaser: { countTemplate: '{{count}} proyek dalam arsip' },
    contactMailto: { heading: 'Lorem ipsum dolor? (ID)' },
  }
  await payload.update({
    collection: 'pages',
    id: home.id,
    locale: 'id',
    draft: false,
    data: {
      title: 'Beranda',
      _status: 'published',
      layout: (created.layout || []).map((b: any) => ({
        ...b,
        ...(idValues[b.blockType] || {}),
      })),
    },
  })

  payload.logger.info(
    'Seed complete: admin user, settings, hero effects, SAMSARA sequence, 6 statements, 4 services, 12 works, homepage (hero + samsaraRoom, en+id).',
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
