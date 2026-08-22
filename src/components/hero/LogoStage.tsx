'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SketchIntro } from './SketchIntro'
import { HoldHint } from './HoldHint'
import { CALIB, videoCoverScale } from '../../lib/three/calibration'
import type { SeparationConfig } from '../../lib/three/shatter/types'
import type { IgnitionConfig } from '../../lib/three/ignition/types'

// next/dynamic(ssr:false) keeps three.js out of the base bundle.
const LogoCanvas = dynamic(() => import('../three/LogoCanvas'), {
  ssr: false,
  loading: () => null,
})

// If the 3D canvas never reports ready (WebGL init failure, slow GPU, etc.)
// don't leave the hero permanently blank — force the handoff through anyway.
const CANVAS_READY_FALLBACK_MS = 4000

/**
 * Composes the hero logo: the 3D canvas underneath, the sketch-draw video on
 * top. The video fades out once it ends and the canvas fades in, but the real
 * bridge between them is the electrical wireframe ignition (spec §3.1) — the
 * video's last frame and the cold cage are both dark lines on warm paper, so
 * there is no cut to hide.
 *
 * Signal order (spec §4.4):
 *   introDone && canvasReady -> canvas visible, startIgnition()
 *   ignition 'cue'           -> onLive fires, floating words enter
 *   ignition 'done'          -> separation arms
 */
export function LogoStage({
  onLive,
  onIntroPlayStart,
  separation,
  ignition,
}: {
  onLive?: () => void
  onIntroPlayStart?: () => void
  separation: SeparationConfig
  ignition: IgnitionConfig
}) {
  const [introDone, setIntroDone] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [ignited, setIgnited] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const [logoHover, setLogoHover] = useState(false)
  const [webglMissing, setWebglMissing] = useState(false)
  const [plate, setPlate] = useState<{ height: number; top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const live = introDone && canvasReady
  const onUnavailable = useCallback(() => setWebglMissing(true), [])

  // Where the mesh WOULD have been. Same three numbers LogoEngine and the orbit
  // field read, so the fallback logo, the real logo and the orbits all agree on
  // one centre — and the cover factor has to be in here too, or the fallback
  // sits at the wrong size on anything wider than 16:9.
  useEffect(() => {
    if (!webglMissing) return
    const measure = () => {
      const el = rootRef.current
      if (!el) return
      const W = el.clientWidth
      const H = el.clientHeight
      const mobile = window.innerWidth < 640
      const cover = mobile ? 1 : videoCoverScale(W, H)
      const frac = mobile ? CALIB.MOBILE_HEIGHT_FRAC : CALIB.HEIGHT_FRAC
      setPlate({
        height: frac * H * cover,
        top: H / 2 + (CALIB.CENTER_Y - 0.5) * H * cover,
        left: CALIB.CENTER_X * W,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [webglMissing])

  // Both CMS switches have to gate the overlay ITSELF, not just its lead time.
  // SketchIntro's finish() signals near-end unconditionally (a skipped or failed
  // video must still let the cage come up), so a lead of 0 does not mean "no
  // overlay" — it only means "no early warning". Without this guard, turning
  // ignition off raised the canvas above the still-playing video with an
  // unpatched, fully opaque skin, popping the solid logo over the last second
  // of the sketch video: strictly worse than the plain crossfade the switch
  // promises to restore.
  const overlayWanted = ignition.ENABLED && ignition.OVERLAY_ENABLED
  const onNearEnd = useCallback(() => {
    if (overlayWanted) setOverlay(true)
  }, [overlayWanted])

  // The words enter at the ignition's cue rather than when the canvas appears:
  // the cue lands just as the charge front finishes, so the energy disperses
  // INTO them instead of the two events merely coinciding.
  const onCue = useCallback(() => onLive?.(), [onLive])
  const onDone = useCallback(() => setIgnited(true), [])

  useEffect(() => {
    if (!introDone || canvasReady) return
    const t = setTimeout(() => {
      console.error('LogoStage: 3D canvas never reported ready — forcing handoff')
      setCanvasReady(true)
    }, CANVAS_READY_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [introDone, canvasReady])

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          // Once the overlay starts the canvas sits ABOVE the video and stays
          // there. It has to, or the cage would be hidden behind an opaque
          // video — and dropping back down at the cut would bury the charge
          // behind the video's own half-second fade-out.
          zIndex: overlay ? 3 : 0,
          opacity: live || overlay ? 1 : introDone ? 0.001 : 0,
          transition: 'opacity 0.4s ease',
        }}
      >
        <LogoCanvas
          onReady={() => setCanvasReady(true)}
          config={separation}
          ignition={ignition}
          armed={ignited}
          overlay={overlay}
          ignite={live}
          onIgnitionCue={onCue}
          onIgnitionDone={onDone}
          onLogoHover={setLogoHover}
          onUnavailable={onUnavailable}
        />
      </div>

      {/* No WebGL — old GPU, blocklisted driver, hardware acceleration switched
          off, or every context already taken. Without this the hero would be
          bare paper: the intro video fades itself out expecting the mesh to
          take over, and the mesh never arrives.

          The flat brand mark, NOT the video's final frame. The poster would be
          the closer likeness, but it is an opaque 16:9 photograph of paper, and
          full-bleed at this depth it buries everything the orbit field draws
          underneath — trails, orbit lines, and the half of every orbit that
          passes behind the logo. This SVG is transparent, so the sky survives.
          Its viewBox is 1532x1427, the same ratio the orbit anchor assumes.

          Held back until the intro finishes so it cannot spoil the draw-in. No
          rotation and no hold-to-shatter here; those need the engine. */}
      {webglMissing && introDone && plate ? (
        <img
          src="/media/logo-full-color.svg"
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            left: plate.left,
            top: plate.top,
            height: plate.height,
            width: 'auto',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      <SketchIntro
        onDone={() => setIntroDone(true)}
        onPlayStart={onIntroPlayStart}
        onNearEnd={onNearEnd}
        nearEndLeadMs={overlayWanted ? ignition.OVERLAY_LEAD_MS : 0}
      />
      {/* Gated on `ignited`, not just hover: until the ignition's `done` fires
          the logo is not armed, so a hold does nothing and the hint would be
          telling the visitor to try something that cannot work yet. */}
      <HoldHint active={ignited && logoHover} />

      <style>{`
        @media (max-width: 639px) {
          /* Match the 3D logo's mobile scale (MOBILE_HEIGHT_FRAC / HEIGHT_FRAC
             = 0.24 / 0.408) so the video-to-mesh handoff doesn't jump size.
             Only the intro video needs this: the static fallback above reads
             CALIB directly instead of restating it in svh units. */
          .tt-hero-plate {
            position: absolute !important;
            top: 51.3% !important;
            left: 50% !important;
            width: calc(100svh * 1.0458) !important;
            height: calc(100svh * 0.5882) !important;
            max-width: none !important;
            max-height: none !important;
            transform: translate(-50%, -50%);
            object-fit: contain !important;
          }
        }
      `}</style>
    </div>
  )
}
