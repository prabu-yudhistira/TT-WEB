'use client'

import { useEffect, useRef } from 'react'
import { SatelliteEngine } from '../../lib/satellites/SatelliteEngine'
import { DEFAULT_SATELLITES, type SatelliteConfig } from '../../lib/satellites/types'

/**
 * PROTOTYPE — hero orbiting satellites. Throwaway; see lib/satellites/types.ts.
 *
 * Renders TWO canvases at different z-indexes so the logo's own WebGL canvas
 * can sit between them:
 *
 *   z 0  back canvas   ← particles behind the mark (the logo paints over them)
 *   z 0  LogoStage     ← existing, untouched, later in DOM so it wins
 *   z 2  front canvas  ← particles in front of the mark, plus the word labels
 *
 * The root deliberately has NO z-index of its own: a positioned element with
 * `z-index: auto` does not create a stacking context, so the two canvases
 * participate in the hero section's stacking context directly and can straddle
 * a sibling. Give this div a z-index and the sandwich collapses.
 *
 * MUST be placed before <LogoStage> in the DOM — the back canvas and LogoStage
 * are both at z 0, so paint order decides, and paint order is DOM order.
 */
export function SatelliteField({
  words,
  config = DEFAULT_SATELLITES,
  active,
  enabled = true,
  chargeRef,
}: {
  words: string[]
  config?: SatelliteConfig
  /** Entrance trigger — the hero passes the sketch-video → 3D handoff. */
  active: boolean
  enabled?: boolean
  /**
   * Holds LogoEngine.getCharge, so the field can read the separation's charge
   * each frame and freeze/shake with it. A ref rather than a value: the charge
   * changes every frame, and re-rendering React at 60Hz to carry a number the
   * canvas loop can simply pull would be pure overhead.
   */
  chargeRef?: React.MutableRefObject<(() => number) | null>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLCanvasElement>(null)
  const frontRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<SatelliteEngine | null>(null)

  useEffect(() => {
    if (!enabled) return
    const back = backRef.current
    const front = frontRef.current
    const host = hostRef.current
    const root = rootRef.current
    if (!back || !front || !host || !root) return

    let engine: SatelliteEngine
    try {
      engine = new SatelliteEngine(back, front, host)
    } catch (err) {
      console.error('SatelliteField: could not start', err)
      return
    }
    engineRef.current = engine

    // Indirect through the ref on every call: LogoCanvas may not have built its
    // engine yet when this mounts, and a getter captured once would stay stuck
    // at zero. Same class of bug as the setShatterArmed race the 2026-08-09
    // review caught.
    engine.setChargeSource(() => chargeRef?.current?.() ?? 0)

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    engine.setConfig(config)
    engine.setWords(words)
    engine.setReduced(mq.matches)
    engine.resize()
    if (!mq.matches) engine.start()

    const onReduced = () => {
      engine.setReduced(mq.matches)
      if (mq.matches) engine.stop()
      else engine.start()
    }
    mq.addEventListener('change', onReduced)

    // The hero's headline dissolve dispatches a synthetic resize so the
    // constellation can reclaim that space; this listens to the same signal.
    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(root)

    return () => {
      mq.removeEventListener('change', onReduced)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      engine.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    engineRef.current?.setConfig(config)
  }, [config])

  useEffect(() => {
    engineRef.current?.setWords(words)
  }, [words])

  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])

  if (!enabled) return null

  return (
    <div ref={rootRef} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <canvas
        ref={backRef}
        data-satellites="back"
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      />
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <canvas
          ref={frontRef}
          data-satellites="front"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
        <div
          ref={hostRef}
          data-satellites="labels"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
      </div>
    </div>
  )
}
