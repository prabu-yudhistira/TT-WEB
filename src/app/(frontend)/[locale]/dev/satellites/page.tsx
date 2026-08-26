import { notFound } from 'next/navigation'
import { getHeroEffects, getPage, type Locale } from '@/lib/cms'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import SatelliteLab from './SatelliteLab'

// PROTOTYPE bench for the orbiting satellites (sub-project 3). Dev-only, never
// reachable in a production build — same gate as /dev/ignition and /dev/shatter.
export default async function SatellitesDevPage({
  params,
}: {
  params: Promise<{ locale: Locale }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { locale } = await params
  const [effects, page] = await Promise.all([getHeroEffects(), getPage('home', locale)])

  // Seed from the homepage's REAL words rather than invented sample text, so
  // what gets judged here is the actual copy at its actual lengths. Editing
  // them in the bench is local only — nothing writes back to the CMS.
  const hero = (page?.layout || []).find((b) => b.blockType === 'hero')
  const words =
    hero && hero.blockType === 'hero'
      ? (hero.floatingWords || []).map((w) => w.word).filter((w): w is string => !!w)
      : []

  return (
    <SatelliteLab
      separation={resolveSeparation(effects)}
      ignition={resolveIgnition(effects)}
      initialWords={words}
    />
  )
}
