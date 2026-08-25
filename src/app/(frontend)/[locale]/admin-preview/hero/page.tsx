import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getHeroEffects, getPage } from '@/lib/cms'
import { isLocale } from '@/lib/i18n'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import HeroPreview from './HeroPreview'

// A second page rendering the same hero must never compete with the homepage
// in search, nor be crawled.
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Hero-only live-preview target for /admin (spec 4.1).
 *
 * Ships to production deliberately — the dev benches are notFound() there, so
 * without this the owner has no way to see what an effects value does once the
 * site is live. It renders only content that is already public on the
 * homepage, so it carries no auth gate; gating it would break the iframe's
 * cookie context for no security gain.
 */
export default async function HeroPreviewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const [effects, page] = await Promise.all([getHeroEffects(), getPage('home', locale)])

  const hero = (page?.layout || []).find((b) => b.blockType === 'hero')
  if (!hero || hero.blockType !== 'hero') notFound()

  return (
    <HeroPreview
      savedSeparation={resolveSeparation(effects)}
      savedIgnition={resolveIgnition(effects)}
      savedLine1={hero.line1}
      savedLine2={hero.line2}
      savedLocationLine={hero.locationLine}
      savedScrollCue={hero.scrollCue}
      savedConstellationEnabled={hero.constellationEnabled ?? true}
      savedWords={(hero.floatingWords || [])
        .map((w) => w.word)
        .filter((w): w is string => !!w)}
    />
  )
}
