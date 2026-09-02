'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLivePreview } from '@payloadcms/live-preview-react'
import { HeroBlock } from '@/components/blocks/HeroBlock'
import { parseSource, SOURCE_PARAM } from '@/lib/livePreview/source'
import { resolveIgnition, type HeroEffectsIgnitionInput } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation, type HeroEffectsInput } from '@/lib/three/shatter/resolveSeparation'
import {
  resolveSatellites,
  type HeroEffectsSatellitesInput,
} from '@/lib/satellites/resolveSatellites'
import { resolveMascot, type HeroEffectsMascotInput } from '@/lib/mascot/resolveMascot'
import { resolveMascotEyes, type HeroEffectsEyesInput } from '@/lib/mascot/resolveMascotEyes'
import { resolveSamsara, type SamsaraSequenceInput } from '@/lib/samsara/resolveSamsara'
import type { SequenceConfig } from '@/lib/samsara/types'
import type { SequenceControls } from '@/components/hero/SamsaraSequence'
import type { IgnitionConfig } from '@/lib/three/ignition/types'
import type { SatelliteConfig } from '@/lib/satellites/types'
import type { MascotConfig } from '@/lib/mascot/types'
import type { MascotEyesConfig } from '@/lib/mascot/eyeTypes'
import type { SeparationConfig } from '@/lib/three/shatter/types'

type HeroBlockShape = {
  blockType?: string
  line1?: string | null
  line2?: string | null
  locationLine?: string | null
  scrollCue?: string | null
  constellationEnabled?: boolean | null
  floatingWords?: { word?: string | null }[] | null
}

type Props = {
  pageId: string | number
  savedSeparation: SeparationConfig
  savedIgnition: IgnitionConfig
  savedSatellites: SatelliteConfig
  savedMascot: MascotConfig
  savedEyes: MascotEyesConfig
  savedLine1: string
  savedLine2?: string | null
  savedLocationLine?: string | null
  savedScrollCue?: string | null
  savedConstellationEnabled: boolean
  savedWords: string[]
  savedSamsara: SequenceConfig
  locale: string
}

/**
 * Mounts the REAL HeroBlock with live-edited values (spec 4.1).
 *
 * Live values go through resolveSeparation()/resolveIgnition() untouched: they
 * already merge a partial, null-riddled CMS shape over frozen defaults and
 * clamp phase boundaries, which is exactly what half-typed form state looks
 * like. Live data is LESS trustworthy than saved data, and these functions
 * were already built to be that guard.
 */
export default function HeroPreview(props: Props) {
  const searchParams = useSearchParams()
  const source = parseSource(searchParams.get(SOURCE_PARAM))
  const serverURL =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

  // Ignition is one-shot and tied to the video handoff, so it does not loop.
  // Remounting the whole block replays the sequence on demand (owner decision);
  // edits alone update state quietly rather than restarting on every keystroke.
  const [nonce, setNonce] = useState(0)
  const replay = useCallback(() => setNonce((n) => n + 1), [])

  /**
   * Drive the transition into the ROOM when the SAMSARA global is what is being
   * edited.
   *
   * Nearly every field on that global describes the room, the landing or the
   * golden smoke, and none of it is visible from the hero. Left alone, an editor
   * dragging the key-light slider would watch a 7.7s sketch intro and then a
   * hero that never changes, and would reasonably conclude the preview is
   * broken.
   *
   * ⚠️ The sequence only ARMS once the hero stage goes live, and the controls ref
   * is null until then — so this polls for it rather than firing on mount. It
   * runs once per mount; `replay` remounts, which is what replays the cinematic.
   */
  const controls = useRef<SequenceControls | null>(null)
  const wantsRoom = source === 'samsara-sequence'
  useEffect(() => {
    if (!wantsRoom) return
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const poll = setInterval(() => {
      const c = controls.current
      if (!c || cancelled) return
      clearInterval(poll)
      // Beats are spaced past GESTURES.COOLDOWN_MS, or the later ones are
      // swallowed and the sequence stalls part-charged.
      const beats = Math.max(1, samsaraBeatsRef.current)
      for (let i = 0; i < beats; i++) {
        timers.push(setTimeout(() => controls.current?.beat('down'), 420 * (i + 1)))
      }
    }, 200)
    return () => {
      cancelled = true
      clearInterval(poll)
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsRoom, nonce])

  // One subscription. Payload posts whichever document the parent edit screen
  // is editing; `source` says which that is.
  //
  // `initialData` must carry the real page id: Payload's own mergeData() does
  // not merge locally — every live update round-trips through a real server
  // endpoint (POST /api/{collection}/{id} with a GET method-override), and
  // for the `pages` collection that id comes from initialData.id. An empty
  // {} here resolved to /api/pages/undefined and every page-sourced live
  // edit would have failed silently. hero-effects is a global (looked up by
  // slug, not id) so this is unused on that path, but harmless to include.
  const { data } = useLivePreview<Record<string, unknown>>({
    initialData: { id: props.pageId },
    serverURL,
    depth: 2,
  })

  let separation = props.savedSeparation
  let ignition = props.savedIgnition
  let satellites = props.savedSatellites
  let mascot = props.savedMascot
  let eyes = props.savedEyes
  let line1 = props.savedLine1
  let line2 = props.savedLine2
  let locationLine = props.savedLocationLine
  let scrollCue = props.savedScrollCue
  let constellationEnabled = props.savedConstellationEnabled
  let words = props.savedWords
  let samsara = props.savedSamsara
  // Read at fire time rather than captured in the effect's closure — the
  // editor may be dragging BEATS_TO_COMMIT itself while the preview runs.
  const samsaraBeatsRef = useRef(props.savedSamsara.GESTURES.BEATS_TO_COMMIT)

  // `initialData` seeds `id` so mergeData() has a real endpoint to hit (see
  // the useLivePreview call above) — which means `data` always has at LEAST
  // that one key, even before any live message arrives. A generic
  // "Object.keys(data).length > 0" check would therefore read as "live" from
  // the very first render. Checking for a key that only a REAL payload of
  // that shape would carry avoids that false positive.
  const hasLiveEffects = source === 'hero-effects' && ('timing' in data || 'separationEnabled' in data)
  // Same false-positive guard as above: a key only a real sequence payload
  // carries. `sequenceEnabled` is a checkbox, so it is present even when every
  // group is still untouched.
  const hasLiveSamsara =
    source === 'samsara-sequence' && ('sequenceEnabled' in data || 'landing' in data)
  const hasLivePage = source === 'page' && 'layout' in data

  if (hasLiveEffects) {
    separation = resolveSeparation(data as HeroEffectsInput)
    ignition = resolveIgnition(data as HeroEffectsIgnitionInput)
    satellites = resolveSatellites(data as HeroEffectsSatellitesInput)
    mascot = resolveMascot(data as HeroEffectsMascotInput)
    eyes = resolveMascotEyes(data as HeroEffectsEyesInput)
  }

  if (hasLiveSamsara) {
    // Straight through the resolver, exactly like the effects above: it already
    // merges a partial, null-riddled shape over the frozen defaults and clamps
    // the values the engine divides by. Half-typed form state is precisely what
    // it was built to survive.
    samsara = resolveSamsara(data as SamsaraSequenceInput)
  }

  if (hasLivePage) {
    const layout = (data as { layout?: HeroBlockShape[] }).layout
    const hero = Array.isArray(layout) ? layout.find((b) => b?.blockType === 'hero') : undefined
    if (hero) {
      // line1 is required on the real block; an empty draft must not blank the
      // hero mid-edit, so fall back to the saved value.
      line1 = hero.line1 || props.savedLine1
      line2 = hero.line2 ?? props.savedLine2
      locationLine = hero.locationLine ?? props.savedLocationLine
      scrollCue = hero.scrollCue ?? props.savedScrollCue
      constellationEnabled = hero.constellationEnabled ?? props.savedConstellationEnabled
      words = (hero.floatingWords || [])
        .map((w) => (w?.word ?? '').trim())
        .filter((w) => w.length > 0)
    }
  }

  samsaraBeatsRef.current = samsara.GESTURES.BEATS_TO_COMMIT

  return (
    <div style={{ position: 'relative', minHeight: '100dvh' }}>
      <HeroBlock
        key={nonce}
        line1={line1}
        line2={line2}
        locationLine={locationLine}
        scrollCue={scrollCue}
        constellationEnabled={constellationEnabled}
        separation={separation}
        ignition={ignition}
        satellites={satellites}
        mascot={mascot}
        eyes={eyes}
        floatingWords={words}
        samsara={samsara}
        locale={props.locale}
        samsaraControlsRef={controls}
      />

      <button
        type="button"
        onClick={replay}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 50,
          padding: '8px 14px',
          font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#2B2A27',
          background: 'rgba(246,241,231,0.94)',
          border: '1px solid rgba(43,42,39,0.35)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Replay intro
      </button>

      <div
        style={{
          position: 'fixed',
          left: 16,
          bottom: 16,
          zIndex: 50,
          font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#2B2A27',
          opacity: 0.65,
        }}
      >
        {source ? `live: ${source}` : 'saved values (no live source)'}
      </div>
    </div>
  )
}
