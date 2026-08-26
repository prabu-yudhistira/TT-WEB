import { notFound } from 'next/navigation'
import { getHeroEffects } from '@/lib/cms'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import SatelliteLab from './SatelliteLab'

// PROTOTYPE bench for the orbiting satellites (sub-project 3). Dev-only, never
// reachable in a production build — same gate as /dev/ignition and /dev/shatter.
export default async function SatellitesDevPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const effects = await getHeroEffects()
  return (
    <SatelliteLab
      separation={resolveSeparation(effects)}
      ignition={resolveIgnition(effects)}
    />
  )
}
