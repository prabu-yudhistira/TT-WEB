'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { SketchIntro } from './SketchIntro'
import { HoldHint } from './HoldHint'
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
  onChargeSource,
  holdEnabled = true,
}: {
  onLive?: () => void
  onIntroPlayStart?: () => void
  separation: SeparationConfig
  ignition: IgnitionConfig
  /** See LogoCanvas — publishes the separation charge to effects outside the scene. */
  onChargeSource?: (get: (() => number) | null) => void
  /**
   * Spec §5.8. False while the SAMSARA sequence owns the charge, from beat 1
   * until the return to idle.
   *
   * ⚠️ It has to gate `armed` here rather than be checked inside
   * ShatterController, because during the pin `scrollY` never changes and the
   * controller's own SCROLL_DISARM_FRAC guard therefore never fires — leaving
   * hold-to-separate live throughout a cinematic the visitor could then fight.
   * Routed through `armed` so it also picks up setArmed(false)'s cancel(),
   * which reforms a charge already in flight instead of freezing it open.
   */
  holdEnabled?: boolean
}) {
  const [introDone, setIntroDone] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [ignited, setIgnited] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const [logoHover, setLogoHover] = useState(false)
  const live = introDone && canvasReady

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
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
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
          armed={ignited && holdEnabled}
          overlay={overlay}
          ignite={live}
          onIgnitionCue={onCue}
          onIgnitionDone={onDone}
          onLogoHover={setLogoHover}
          onChargeSource={onChargeSource}
        />
      </div>
      <SketchIntro
        onDone={() => setIntroDone(true)}
        onPlayStart={onIntroPlayStart}
        onNearEnd={onNearEnd}
        nearEndLeadMs={overlayWanted ? ignition.OVERLAY_LEAD_MS : 0}
      />
      {/* Gated on `ignited`, not just hover: until the ignition's `done` fires
          the logo is not armed, so a hold does nothing and the hint would be
          telling the visitor to try something that cannot work yet. */}
      <HoldHint active={ignited && holdEnabled && logoHover} />
    </div>
  )
}
