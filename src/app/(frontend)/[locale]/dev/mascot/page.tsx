import { notFound } from 'next/navigation'
import { getHeroEffects, getPage, type Locale } from '@/lib/cms'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import { resolveSatellites } from '@/lib/satellites/resolveSatellites'
import MascotLab from './MascotLab'

// Tuning bench for the orbiting mascot. Dev-only, never reachable in a
// production build — same gate as /dev/ignition, /dev/shatter, /dev/satellites.
//
// ⚠️ PROTOTYPE. There is no mascot CMS group yet and nothing here saves. The
// point of this page is to settle the numbers on screen first; the spec is
// written around whatever comes out of it.
export default async function MascotDevPage({ params }: { params: Promise<{ locale: Locale }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { locale } = await params
  const [effects, page] = await Promise.all([getHeroEffects(), getPage('home', locale)])

  // The real hero words, so the mascot is judged against the actual belt it
  // will share rather than an invented one.
  const hero = (page?.layout || []).find((b) => b.blockType === 'hero')
  const words =
    hero && hero.blockType === 'hero'
      ? (hero.floatingWords || []).map((w) => w.word).filter((w): w is string => !!w)
      : []

  return (
    <MascotLab
      separation={resolveSeparation(effects)}
      ignition={resolveIgnition(effects)}
      satellites={resolveSatellites(effects)}
      words={words}
    />
  )
}
