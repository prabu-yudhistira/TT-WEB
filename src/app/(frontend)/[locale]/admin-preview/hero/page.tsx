import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getHeroEffects, getPage } from '@/lib/cms'
import { isLocale } from '@/lib/i18n'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSatellites } from '@/lib/satellites/resolveSatellites'
import { resolveMascot } from '@/lib/mascot/resolveMascot'
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
  if (!page) notFound()

  const hero = (page.layout || []).find((b) => b.blockType === 'hero')
  if (!hero || hero.blockType !== 'hero') notFound()

  return (
    // HeroPreview reads the ?source= param via useSearchParams(), which
    // requires a Suspense boundary or the production build fails to
    // statically prerender this page (missing-suspense-with-csr-bailout) --
    // caught by `next build`, not `next dev`, which is why it wasn't seen
    // until this project's own build-verification step ran.
    <Suspense fallback={null}>
      <HeroPreview
        pageId={page.id}
        savedSeparation={resolveSeparation(effects)}
        savedIgnition={resolveIgnition(effects)}
        savedSatellites={resolveSatellites(effects)}
        savedMascot={resolveMascot(effects)}
        savedLine1={hero.line1}
        savedLine2={hero.line2}
        savedLocationLine={hero.locationLine}
        savedScrollCue={hero.scrollCue}
        savedConstellationEnabled={hero.constellationEnabled ?? true}
        savedWords={(hero.floatingWords || [])
          .map((w) => w.word)
          .filter((w): w is string => !!w)}
      />
    </Suspense>
  )
}
