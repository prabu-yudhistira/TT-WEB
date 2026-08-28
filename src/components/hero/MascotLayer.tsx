'use client'

import { useEffect, useRef, useState } from 'react'
import { MascotEngine } from '../../lib/mascot/MascotEngine'
import type { MascotConfig } from '../../lib/mascot/types'
import type { SatelliteConfig } from '../../lib/satellites/types'

/**
 * Hero orbiting mascot — React wrapper.
 *
 * Design: docs/superpowers/specs/2026-08-28-hero-mascot-design.md
 *
 * ONE canvas, whose z-index flips as the mascot crosses behind the mark:
 *
 *   z 0  ← behind the logo (LogoStage is later in the DOM, so it paints over)
 *   z 2  ← in front of the logo
 *
 * Like SatelliteField, the root has NO z-index of its own: a positioned element
 * with `z-index: auto` does not create a stacking context, so the canvas
 * participates in the hero's stacking context directly and can straddle
 * LogoStage. Give this div a z-index and the sandwich collapses.
 *
 * MUST be placed before <LogoStage> in the DOM.
 *
 * When disabled, this returns null — the canvas is absent from the DOM
 * entirely and no WebGL context or model fetch ever happens. That is
 * deliberate and load-bearing: on this project a kill switch that left the
 * effect half-running has now shipped TWICE.
 */
export function MascotLayer({
  config,
  belt,
  active,
  enabled = true,
  chargeRef,
  labelBoxRef,
  modelUrl = '/models/mascot.draco.glb',
  onStatus,
}: {
  config: MascotConfig
  /** The belt the mascot orbits in — supplies the shared plane and radii. */
  belt: SatelliteConfig
  active: boolean
  enabled?: boolean
  chargeRef?: React.MutableRefObject<(() => number) | null>
  /**
   * Publishes the mascot's current label box so SatelliteField can treat it as
   * occupied space and yield to it. Same ref-carrying-a-getter pattern as
   * chargeRef, and for the same reason: it changes every frame, and re-rendering
   * React at 60Hz to carry a rectangle the other loop can simply pull would be
   * pure overhead.
   */
  labelBoxRef?: React.MutableRefObject<(() => import('../../lib/satellites/labels').LabelBox | null) | null>
  modelUrl?: string
  onStatus?: (s: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<MascotEngine | null>(null)
  const [behind, setBehind] = useState(true)

  const statusRef = useRef(onStatus)
  statusRef.current = onStatus

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    const root = rootRef.current
    if (!canvas || !root) return

    let engine: MascotEngine
    try {
      engine = new MascotEngine(canvas, root, labelRef.current)
    } catch (err) {
      console.error('MascotLayer: could not start', err)
      return
    }
    engineRef.current = engine

    // Indirect through the ref on every call: LogoCanvas may not have built its
    // engine yet when this mounts, and a getter captured once would stay stuck
    // at zero. Same class of bug as the setShatterArmed race the 2026-08-09
    // review caught.
    engine.setChargeSource(() => chargeRef?.current?.() ?? 0)
    engine.onDepth(setBehind)
    if (labelBoxRef) labelBoxRef.current = () => engine.getLabelBox()

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    engine.setBelt(belt)
    engine.setConfig(config)
    engine.setReduced(mq.matches)
    engine.resize()
    if (!mq.matches) engine.start()

    statusRef.current?.('loading mascot…')
    void engine.load(modelUrl).then(() => {
      statusRef.current?.('mascot loaded')
      engine.resize()
    })

    const onReduced = () => {
      engine.setReduced(mq.matches)
      if (mq.matches) engine.stop()
      else engine.start()
    }
    mq.addEventListener('change', onReduced)

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(root)

    return () => {
      mq.removeEventListener('change', onReduced)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      // false: this canvas element is being unmounted with the component, and
      // forceContextLoss() on an element that might be reused permanently
      // poisons it.
      engine.dispose(false)
      engineRef.current = null
      // Leaving a getter pointing at a disposed engine would freeze the
      // satellites' reserved box at the mascot's last position forever,
      // permanently blanking whichever word happened to be under it.
      if (labelBoxRef) labelBoxRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, modelUrl])

  useEffect(() => {
    engineRef.current?.setConfig(config)
  }, [config])

  useEffect(() => {
    engineRef.current?.setBelt(belt)
  }, [belt])

  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])

  if (!enabled) return null

  return (
    <div ref={rootRef} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        data-mascot={behind ? 'behind' : 'front'}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: behind ? 0 : 2,
          pointerEvents: 'none',
        }}
      />
      {/* The word sits at a FIXED z 2, deliberately not flipping with the
          canvas: a name that disappears behind the mark for half of every orbit
          is worse than one that stays readable. The engine dims it instead when
          the body is behind the logo and over its face, exactly as the
          satellites do. Later in the DOM than the canvas, so at z 2 it wins. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <div
          ref={labelRef}
          data-mascot-label
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            willChange: 'transform, opacity',
            opacity: 0,
          }}
        />
      </div>
    </div>
  )
}
