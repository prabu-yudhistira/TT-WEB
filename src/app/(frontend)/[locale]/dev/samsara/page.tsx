import { notFound } from 'next/navigation'
import { getHeroEffects, getPage, type Locale } from '@/lib/cms'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import { resolveSatellites } from '@/lib/satellites/resolveSatellites'
import { resolveMascot } from '@/lib/mascot/resolveMascot'
import { resolveMascotEyes } from '@/lib/mascot/resolveMascotEyes'
import SamsaraLab from './SamsaraLab'

/**
 * Tuning bench for the SAMSARA transition. Dev-only, never reachable in a
 * production build — same gate as /dev/ignition, /dev/shatter, /dev/satellites,
 * /dev/mascot.
 *
 * ⚠️ This page is plan Task 12, and it exists to serve Task 13: the FREEZE
 * GATE. Every number in DEFAULT_SEQUENCE is a starting value. The owner tunes
 * them here, presses `copy json`, and those values are pasted back into
 * `lib/samsara/types.ts` with `types.check.ts` updated in the same commit.
 * Nothing downstream of that gate may treat the current defaults as approved.
 *
 * The real belt, the real mascot config and the real eye config are all loaded
 * from the CMS rather than invented, so what is judged here is the transition
 * against the hero it actually leaves.
 *
 * ⚠️ `hero-effects` is READ here and never written. Unlike the other benches
 * there is no `save` button: the sequence's own values will live in a NEW
 * global (plan Task 15), and `hero-effects` carries owner-tuned values that
 * diverge from code defaults — writing a partial payload back to it is how
 * those get lost.
 */
export default async function SamsaraDevPage({ params }: { params: Promise<{ locale: Locale }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { locale } = await params
  const [effects, page] = await Promise.all([getHeroEffects(), getPage('home', locale)])

  const hero = (page?.layout || []).find((b) => b.blockType === 'hero')
  const words =
    hero && hero.blockType === 'hero'
      ? (hero.floatingWords || []).map((w) => w.word).filter((w): w is string => !!w)
      : []

  return (
    <SamsaraLab
      separation={resolveSeparation(effects)}
      ignition={resolveIgnition(effects)}
      satellites={resolveSatellites(effects)}
      mascot={resolveMascot(effects)}
      eyes={resolveMascotEyes(effects)}
      words={words}
    />
  )
}
