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
  onChargeSource,
  releaseContextOnUnmount = false,
}: {
  onReady?: () => void
  config?: SeparationConfig
  ignition?: IgnitionConfig
  armed?: boolean
  overlay?: boolean
  ignite?: boolean
  onIgnitionCue?: () => void
  onIgnitionDone?: () => void
  /** fires when the cursor moves onto or off the mark, for the click-and-hold hint */
  onLogoHover?: (over: boolean) => void
  /**
   * Publishes a getter for the separation's charge (0 at rest, 1 at full hold),
   * and null on unmount. Exists so effects outside the 3D scene can react
   * continuously to the hold gesture without mirroring a per-frame value
   * through React state. This is the consumer the sub-project 1 spec left the
   * onShatter/getCharge seam open for.
   */
  onChargeSource?: (get: (() => number) | null) => void
  /**
   * Release the WebGL context when this unmounts, not just the GPU resources.
   *
   * Off by default because it PERMANENTLY poisons the canvas element — a
   * reused canvas would fail its next context creation outright. Only turn it
   * on where the canvas is discarded too (a `key`ed element), which is what
   * the admin preview does when replaying: without it, each replay leaks a
   * context and the browser's ~16 cap is reached in seconds.
   */
  releaseContextOnUnmount?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LogoEngine | null>(null)
  const releaseRef = useRef(releaseContextOnUnmount)
  releaseRef.current = releaseContextOnUnmount

  // The engine is created once, in a mount-only effect, so the subscription it
  // makes would otherwise capture whatever callback identities existed on the
  // first render. Reading through refs keeps it pointed at the current ones.
  const cueRef = useRef(onIgnitionCue)
  const doneRef = useRef(onIgnitionDone)
  const hoverRef = useRef(onLogoHover)
  const chargeSrcRef = useRef(onChargeSource)
  cueRef.current = onIgnitionCue
  doneRef.current = onIgnitionDone
  hoverRef.current = onLogoHover
  chargeSrcRef.current = onChargeSource

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // WebGL can be unavailable outright — disabled, blocklisted, or every live
    // context already taken (browsers cap them at ~16). The renderer throws
    // synchronously in that case, and an unhandled throw here takes the whole
    // hero down. Degrade instead: no 3D logo, but the page survives and the
    // floating words still arrive, since they hang off `done`.
    let engine: LogoEngine
    try {
      engine = new LogoEngine(canvas, config, ignition)
    } catch (err) {
      console.error('LogoEngine: WebGL unavailable, hero will render without the 3D logo', err)
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

    // Safe to publish before load() resolves: getCharge() returns 0 while the
    // controller is still null rather than throwing.
    chargeSrcRef.current?.(() => engine.getCharge())

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
      chargeSrcRef.current?.(null)
      engine.dispose(releaseRef.current)
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

  return (
    <canvas
      ref={canvasRef}
      aria-label="Rotating TAMPA TARUNO logo"
      role="img"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
