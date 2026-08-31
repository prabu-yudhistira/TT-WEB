'use client'

import { useEffect, useRef, useState } from 'react'
import { MascotEngine } from '../../lib/mascot/MascotEngine'
import type { MascotConfig } from '../../lib/mascot/types'
import type { MascotEyesConfig } from '../../lib/mascot/eyeTypes'
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
/** How many times the press-and-hold hint may appear per page load. */
const HINT_MAX_SHOWS = 2

export function MascotLayer({
  config,
  belt,
  active,
  enabled = true,
  chargeRef,
  labelBoxRef,
  modelUrl = '/models/mascot.draco.glb',
  onStatus,
  eyes,
  inspect,
  onEngine,
  rootElRef,
  holdHint,
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
  /**
   * REQUIRED, not optional. An optional config would silently fall back to the
   * engine's defaults if a caller ever dropped the prop — the same failure mode
   * the 2026-08-09 review found when `separation` was optional on HeroBlock.
   */
  eyes: MascotEyesConfig
  /** ⚠️ BENCH ONLY. Parks the mascot face-on and blown up for shape work. */
  inspect?: { on: boolean; angleDeg: number; sizePx: number }
  /**
   * Publishes the engine as it is built and torn down, for the SAMSARA
   * sequence. Called with null on unmount, deliberately: the sequence drives a
   * pin and a fixed-position promotion, and a handle left pointing at a
   * disposed engine would strand the page stopped with the hero hidden.
   */
  onEngine?: (e: MascotEngine | null) => void
  /**
   * The layer root, so the sequence can promote it from hero-absolute to
   * viewport-fixed (spec §4.2). Handed over rather than promoted from inside,
   * because the promotion is only correct as part of the wider handoff — it
   * fires on the same frame as the camera swap.
   */
  rootElRef?: React.MutableRefObject<HTMLDivElement | null>
  /**
   * Discovery hint shown over SAMSARA while the pointer is on it — "CLICK &
   * HOLD". Omit to show nothing.
   *
   * ⚠️ Anchored to the BODY, not to the cursor, and deliberately not the site's
   * `data-cursor` pill. That pill eases toward the pointer and extends to one
   * side of it, so a label meaning "this thing here is interactive" ends up
   * sitting beside SAMSARA rather than on it — which reads as the target being
   * somewhere it is not. Measured separately: the hit circle itself is centred
   * on the body to within 2px at 1440x900 and 1920x1080.
   *
   * ⚠️ Shown at most HINT_MAX_SHOWS times per page load. It teaches one thing
   * once; past that it is noise sitting on top of the mascot every time the
   * pointer crosses it.
   */
  holdHint?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<MascotEngine | null>(null)
  const [behind, setBehind] = useState(true)
  const [overMascot, setOverMascot] = useState(false)
  const hintRef = useRef<HTMLDivElement>(null)
  /** Counts hover-ins, so the hint can retire itself. See holdHint. */
  const hintShowsRef = useRef(0)
  const [hintVisible, setHintVisible] = useState(false)

  const statusRef = useRef(onStatus)
  statusRef.current = onStatus

  // Same indirection as statusRef and for the same reason: the mount effect
  // runs once, and capturing the callback in its closure would pin whichever
  // identity the first render happened to produce.
  const engineCbRef = useRef(onEngine)
  engineCbRef.current = onEngine

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
    if (rootElRef) rootElRef.current = root
    engineCbRef.current?.(engine)

    // Indirect through the ref on every call: LogoCanvas may not have built its
    // engine yet when this mounts, and a getter captured once would stay stuck
    // at zero. Same class of bug as the setShatterArmed race the 2026-08-09
    // review caught.
    engine.setChargeSource(() => chargeRef?.current?.() ?? 0)
    engine.onDepth(setBehind)
    engine.onMascotHover(setOverMascot)
    if (labelBoxRef) labelBoxRef.current = () => engine.getLabelBox()

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    engine.setBelt(belt)
    engine.setConfig(config)
    engine.setEyeConfig(eyes)
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
      engineCbRef.current?.(null)
      if (rootElRef) rootElRef.current = null
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

  // Bench only. Declared after the mount effect, so the engine exists by the
  // time these first run.
  useEffect(() => {
    engineRef.current?.setEyeConfig(eyes)
  }, [eyes])

  useEffect(() => {
    if (inspect) engineRef.current?.setInspect(inspect)
  }, [inspect])

  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])

  /**
   * The hint appears on the first HINT_MAX_SHOWS hovers and then never again.
   *
   * Counted on hover-IN rather than on a timer, so a visitor who never goes near
   * SAMSARA still gets both of their chances to see it.
   */
  useEffect(() => {
    if (!holdHint) return
    if (!overMascot) {
      setHintVisible(false)
      return
    }
    if (hintShowsRef.current >= HINT_MAX_SHOWS) return
    hintShowsRef.current += 1
    setHintVisible(true)
  }, [overMascot, holdHint])

  /**
   * Follows the body every frame while visible.
   *
   * A rAF loop rather than React state: the body bobs, and re-rendering this
   * component sixty times a second to carry two numbers a style write can set
   * directly is the overhead the rest of this file exists to avoid. The loop
   * only runs while the hint is actually on screen.
   */
  useEffect(() => {
    if (!hintVisible) return
    let raf = 0
    const tick = () => {
      const engine = engineRef.current
      const el = hintRef.current
      if (engine && el) {
        const b = engine.getBodyScreen()
        // Just below the body, so it never covers the face it is pointing at.
        el.style.transform = `translate3d(${b.x}px, ${b.y + b.diameterPx / 2 + 14}px, 0) translateX(-50%)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hintVisible])

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
          /**
           * ⚠️ 'auto' ONLY while the pointer is actually over SAMSARA's disc.
           *
           * The drag itself does not need this — the engine listens on the
           * window and hit-tests the circle itself, precisely so this layer can
           * stay transparent to everything else. What needs it is the cursor:
           * the site's Cursor component reads `data-cursor` off the event
           * TARGET, and a `pointer-events: none` element is never the target.
           *
           * Left permanently 'auto' this canvas would swallow every click in
           * the room, including the chatbox that lands on top of it.
           *
           * ⚠️ The site's `data-cursor` pill is deliberately NOT used here — see
           * the holdHint prop. What this buys now is the grab cursor, which is
           * the affordance that survives after the hint has retired itself.
           */
          cursor: holdHint && overMascot ? 'grab' : 'default',
          pointerEvents: holdHint && overMascot ? 'auto' : 'none',
        }}
      />
      {holdHint ? (
        <div
          ref={hintRef}
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            zIndex: 3,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            // Smaller than the site's cursor pill (0.75rem) — this sits ON the
            // artwork rather than following the pointer, so it has to stay out
            // of the way of what it is annotating.
            font: '600 0.625rem/1 ui-monospace, SFMono-Regular, Menlo, monospace',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(8,8,10,0.72)',
            color: '#F6F1E7',
            border: '1px solid rgba(246,241,231,0.22)',
            opacity: hintVisible ? 1 : 0,
            transition: 'opacity 0.25s ease',
            willChange: 'transform, opacity',
          }}
        >
          {holdHint}
        </div>
      ) : null}
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
