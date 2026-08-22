'use client'

import { useEffect, useRef } from 'react'
import { LogoEngine } from '../../lib/three/LogoEngine'
import { DEFAULT_SEPARATION, type SeparationConfig } from '../../lib/three/shatter/types'
import { DEFAULT_IGNITION, type IgnitionConfig } from '../../lib/three/ignition/types'

// Heavy client component — import it via next/dynamic(ssr:false) so three.js
// stays out of the base bundle (Global Constraint: three lazy).
export default function LogoCanvas({
  onReady,
  config = DEFAULT_SEPARATION,
  ignition = DEFAULT_IGNITION,
  armed = false,
  overlay = false,
  ignite = false,
  onIgnitionCue,
  onIgnitionDone,
  onLogoHover,
  onUnavailable,
}: {
  onReady?: () => void
  config?: SeparationConfig
  ignition?: IgnitionConfig
  armed?: boolean
  overlay?: boolean
  ignite?: boolean
  onIgnitionCue?: () => void
  onIgnitionDone?: () => void
  /** WebGL could not start — the caller should put a static logo up instead. */
  onUnavailable?: () => void
  /** fires when the cursor moves onto or off the mark, for the click-and-hold hint */
  onLogoHover?: (over: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LogoEngine | null>(null)

  // The engine is created once, in a mount-only effect, so the subscription it
  // makes would otherwise capture whatever callback identities existed on the
  // first render. Reading through refs keeps it pointed at the current ones.
  const cueRef = useRef(onIgnitionCue)
  const doneRef = useRef(onIgnitionDone)
  const hoverRef = useRef(onLogoHover)
  const unavailableRef = useRef(onUnavailable)
  cueRef.current = onIgnitionCue
  doneRef.current = onIgnitionDone
  hoverRef.current = onLogoHover
  unavailableRef.current = onUnavailable

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // WebGL can be unavailable outright — disabled, blocklisted, or every live
    // context already taken (browsers cap them at ~16). The renderer throws
    // synchronously in that case, and an unhandled throw here takes the whole
    // hero down. Degrade instead: the page survives, the planets still arrive
    // (they hang off `done`), and `onUnavailable` lets the stage put a static
    // logo up — without it the hero ends up empty, because the intro video has
    // already faded itself out by the time this is known.
    let engine: LogoEngine
    try {
      engine = new LogoEngine(canvas, config, ignition)
    } catch (err) {
      console.error('LogoEngine: WebGL unavailable, hero falls back to the static logo', err)
      unavailableRef.current?.()
      cueRef.current?.()
      doneRef.current?.()
      return
    }
    engineRef.current = engine

    const offIgnition = engine.onIgnition((e) => {
      if (e === 'cue') cueRef.current?.()
      else if (e === 'done') doneRef.current?.()
    })

    const offHover = engine.onLogoHover((over) => hoverRef.current?.(over))

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setInteractive(!reduced)

    engine
      .load()
      .then(() => onReady?.())
      .catch((err) => {
        console.error('LogoEngine load failed', err)
        // No mesh means no ignition controller will ever exist. `armed` and the
        // floating-words entrance both hang off `done`, so force the sequence
        // rather than leave the hero inert behind a transition that never ends.
        engine.finishIgnitionNow()
      })

    // Reduced motion skips the whole interactive path inside load(), so no
    // controller is built there either — same reasoning as above.
    if (reduced) engine.finishIgnitionNow()

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      offIgnition()
      offHover()
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Starts once the 3D mesh has taken over from the sketch-draw video. Safe to
  // call before load() resolves — the engine records the intent.
  // Brings the cage up as a sphere over the tail of the sketch video.
  useEffect(() => {
    if (overlay) engineRef.current?.startOverlay()
  }, [overlay])

  useEffect(() => {
    if (ignite) engineRef.current?.startIgnition()
  }, [ignite])

  // Armed only once the ignition has finished, so a press mid-transition cannot
  // trigger the separation.
  useEffect(() => {
    engineRef.current?.setShatterArmed(armed)
  }, [armed])

  // touchAction is pan-y, not none. This canvas fills the hero's full 100svh,
  // so touch-action: none made it swallow every vertical swipe and a phone
  // simply could not scroll past the first screen. pan-y hands vertical panning
  // back to the browser and still claims horizontal gestures, which is all the
  // logo needs — drag-to-spin reads dx only (see LogoEngine.onMove), and
  // hold-to-separate is a stationary press. A hold that drifts far enough to
  // become a vertical pan now arrives as pointercancel, which onCancel already
  // treats as "never leave a blast stuck open".
  return (
    <canvas
      ref={canvasRef}
      aria-label="Rotating TAMPA TARUNO logo"
      role="img"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' }}
    />
  )
}
