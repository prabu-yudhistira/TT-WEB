import {
  getWorks,
  getServices,
  getManifesto,
  getHeroEffects,
  getSamsaraSequence,
  type Locale,
} from '../../lib/cms'
import type { Page, SiteSetting } from '../../payload-types'
import { HeroBlock } from './HeroBlock'
import { ManifestoStrip } from './ManifestoStrip'
import { FeaturedWorks } from './FeaturedWorks'
import { ServicesRows } from './ServicesRows'
import { ArchiveTeaser } from './ArchiveTeaser'
import { ContactMailto } from './ContactMailto'
import { SamsaraRoomBlock } from './SamsaraRoomBlock'
import { resolveSeparation } from '../../lib/three/shatter/resolveSeparation'
import { resolveIgnition } from '../../lib/three/ignition/resolveIgnition'
import { resolveSatellites } from '../../lib/satellites/resolveSatellites'
import { resolveMascot } from '../../lib/mascot/resolveMascot'
import { resolveMascotEyes } from '../../lib/mascot/resolveMascotEyes'
import { resolveSamsara } from '../../lib/samsara/resolveSamsara'

type Blocks = NonNullable<Page['layout']>

export async function RenderBlocks({
  blocks,
  locale,
  settings,
}: {
  blocks: Blocks
  locale: Locale
  settings: SiteSetting
}) {
  return (
    <>
      {await Promise.all(
        blocks.map(async (block) => {
          switch (block.blockType) {
            case 'hero': {
              // Two independent globals, so they are fetched CONCURRENTLY.
              // Awaiting them one after the other would put an avoidable second
              // round trip on the homepage's critical render path.
              const [effects, samsaraCms] = await Promise.all([
                getHeroEffects(),
                getSamsaraSequence(),
              ])
              const samsara = resolveSamsara(samsaraCms)
              return (
                <HeroBlock
                  key={block.id}
                  line1={block.line1}
                  line2={block.line2}
                  locationLine={block.locationLine}
                  scrollCue={block.scrollCue}
                  constellationEnabled={block.constellationEnabled ?? true}
                  separation={resolveSeparation(effects)}
                  ignition={resolveIgnition(effects)}
                  satellites={resolveSatellites(effects)}
                  mascot={resolveMascot(effects)}
                  eyes={resolveMascotEyes(effects)}
                  samsara={samsara}
                  floatingWords={(block.floatingWords || [])
                    .map((w) => w.word)
                    .filter((w): w is string => !!w)}
                  locale={locale}
                />
              )
            }

            // Section 2. Text only — everything about how the room looks and
            // behaves comes from the `samsara-sequence` global, not from here.
            case 'samsaraRoom': {
              // Only the room's own black is needed here — everything else about
              // Section 2's behaviour reaches the engine through the hero.
              const room = resolveSamsara(await getSamsaraSequence())
              return (
                <SamsaraRoomBlock
                  key={block.id}
                  chatHeading={block.chatHeading}
                  chatPlaceholder={block.chatPlaceholder}
                  locale={locale}
                  bgColor={room.ROOM.BG_COLOR}
                />
              )
            }

            case 'manifestoStrip': {
              const statements = await getManifesto(locale)
              return <ManifestoStrip key={block.id} statements={statements.map((s) => s.text)} />
            }

            case 'featuredWorks': {
              const works = await getWorks(locale, { featured: true })
              return (
                <FeaturedWorks
                  key={block.id}
                  heading={block.heading}
                  locale={locale}
                  works={works.map((w) => ({
                    id: w.id,
                    title: w.title,
                    slug: w.slug,
                    category: w.category,
                    year: w.year,
                    oneLiner: w.oneLiner,
                    servicesLine: w.servicesLine,
                    industry: w.industry,
                    location: w.location,
                  }))}
                />
              )
            }

            case 'servicesRows': {
              const services = await getServices(locale)
              return (
                <ServicesRows
                  key={block.id}
                  heading={block.heading}
                  archiveHref={`/${locale}/archive`}
                  services={services.map((s) => ({
                    id: s.id,
                    name: s.name,
                    tagline: s.tagline,
                    description: s.description,
                    capabilities: (s.capabilities || []).map((c) => c.item),
                    projectCount: s.projectCount ?? 0,
                    icon: s.icon ?? 'spark',
                  }))}
                />
              )
            }

            case 'archiveTeaser': {
              const works = await getWorks(locale)
              return (
                <ArchiveTeaser
                  key={block.id}
                  countTemplate={block.countTemplate}
                  count={works.length}
                  locale={locale}
                />
              )
            }

            case 'contactMailto':
              return (
                <ContactMailto
                  key={block.id}
                  heading={block.heading}
                  email={block.emailOverride || settings.email}
                  locationLine={settings.locationLine}
                  timezone={settings.timezone}
                />
              )

            default:
              return null
          }
        }),
      )}
    </>
  )
}
