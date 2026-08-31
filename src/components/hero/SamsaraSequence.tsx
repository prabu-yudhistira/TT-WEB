'use client'

import { useEffect, useRef } from 'react'
import { lenisRef } from '../providers/SmoothScroll'
import { MascotEngine } from '../../lib/mascot/MascotEngine'
import { SequenceController, type Mode } from '../../lib/samsara/SequenceController'
import {
  createGestureState,
  endTouch,
  feedTouchMove,
  feedWheel,
  type Beat,
} from '../../lib/samsara/gestures'
import { farPointAngle, hasClearedLogo, transitPoseAt, type Box, type TransitContext } from '../../lib/samsara/transitScript'
import { bounceAt } from '../../lib/samsara/bounce'
import { worldSizeFor } from '../../lib/samsara/cameraHandoff'
import { roomCameraFor } from '../../lib/samsara/room'
import { logoScreenBox } from '../../lib/three/calibration'
import type { SequenceConfig } from '../../lib/samsara/types'
import type { SatelliteConfig } from '../../lib/satellites/types'
import type { MascotConfig } from '../../lib/mascot/types'

/**
 * The SAMSARA transition — React wiring.
 *
 * Spec: docs/superpowers/specs/2026-08-30-samsara-transition-design.md §5.
 * Plan: docs/superpowers/plans/2026-08-30-samsara-transition.md Task 11.
 *
 * This component renders NOTHING. Every module it connects was built and pinned
 * on its own — gestures, the state machine, the bounce arc, the transit script,
 * the camera solve — and this is the only place they meet a DOM, a clock and an
 * engine. Keeping it that way is the point: all the arithmetic that decides
 * where SAMSARA is stays testable without a browser, and what lives here is
 * only wiring, which a browser script can check end to end.
 *
 * What it owns, in order of the frame:
 *
 *   1. gestures  — non-passive wheel/touch on the hero, normalised to beats
 *   2. the pin   — lenis.stop() while the hero owns the scroll
 *   3. the charge— published outward so the belt freezes and shakes with it
 *   4. the sweep — beat 4 eases the ORBIT to the far point, still in the belt
 *   5. promotion — canvas to fixed, camera to perspective, room revealed
 *   6. the fall  — the scripted pose, solved into world units every frame
 */

/**
 * Stacking position for the promoted canvas.
 *
 * Above `--z-header` (10) so the room covers the site header once it is opaque;
 * below MobileNav's 50 and the cursor's 9999, which must stay reachable. This
 * z-index is applied ONLY after promotion and removed on the way back — while
 * SAMSARA is in the belt the layer root must keep `z-index: auto` or the hero's
 * z 0/2 sandwich collapses and the mascot can never pass behind the mark again.
 */
const PROMOTED_Z = 40

/** Owner requirement, spec §6.3b. Lazy: never fetched by a hero-only visit. */
const ROOM_MODEL_URL = '/models/mascot.room.draco.glb'

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Smoothstep. Used for the half-orbit sweep so it leaves and arrives gently. */
const smooth = (p: number) => p * p * (3 - 2 * p)

export function SamsaraSequence({
  config,
  belt,
  mascot,
  engine,
  rootElRef,
  heroRef,
  armed,
  onShake,
  chargeOutRef,
  onPointerHold,
  onMode,
}: {
  config: SequenceConfig
  /** The belt SAMSARA orbits in — supplies the shared plane, as the engine does. */
  belt: SatelliteConfig
  mascot: MascotConfig
  engine: MascotEngine | null
  rootElRef: React.MutableRefObject<HTMLDivElement | null>
  heroRef: React.RefObject<HTMLElement | null>
  /**
   * The hero is genuinely live (spec §5.2) — the same `introDone && canvasReady`
   * signal that already gates hold-to-separate. Scrolling during the 7.67s
   * sketch intro must scroll the page normally and do nothing to SAMSARA.
   */
  armed: boolean
  /** Rigid DOM shake amplitude, px. Called only when the value changes. */
  onShake: (px: number) => void
  /**
   * Where the sequence publishes its charge for the belt to read. A ref, not a
   * prop: it changes every frame and re-rendering React at 60Hz to carry one
   * number the canvas loops can pull is the overhead chargeRef already exists
   * to avoid.
   */
  chargeOutRef: React.MutableRefObject<number>
  /**
   * Spec §5.8, plan Task 11 step 4. Called with false from beat 1 and true again
   * on the return to idle. It reaches LogoEngine.setShatterArmed() through
   * LogoStage, which is the only path there — the sequence has no handle on the
   * logo engine and should not grow one.
   */
  onPointerHold: (allowed: boolean) => void
  onMode?: (m: Mode) => void
}) {
  const ctrlRef = useRef<SequenceController | null>(null)
  const cfgRef = useRef(config)
  cfgRef.current = config

  const engineRef = useRef(engine)
  engineRef.current = engine

  const shakeCbRef = useRef(onShake)
  shakeCbRef.current = onShake
  const holdCbRef = useRef(onPointerHold)
  holdCbRef.current = onPointerHold
  const modeCbRef = useRef(onMode)
  modeCbRef.current = onMode

  const beltRef = useRef(belt)
  beltRef.current = belt
  const mascotRef = useRef(mascot)
  mascotRef.current = mascot

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    if (!config.ENABLED) return
    // Spec §5.9. No pin, no gesture counting, no cinematic — a scroll-jack must
    // never be the only route to content, and this preference is not
    // hypothetical here: the owner's own machine has had it silently enabled.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!armed) return

    const ctrl = new SequenceController(cfgRef.current)
    ctrlRef.current = ctrl
    const gest = createGestureState()

    // ── state that lives for one run of the sequence ──────────────────
    let promoted = false
    let promotedAtMs = 0
    let startSizePx = 0
    let sweepFrom = 0
    let sweepBy = 0
    let sweepArmed = false
    let sweepSettled = false
    let lastShake = -1
    let lastHoldAllowed = true
    let lastMode: Mode | null = null
    let cameraDistance = 0
    let zBack = 0
    let raf = 0
    let last = performance.now()
    let elapsed = 0

    const heroEl = hero as HTMLElement

    // ── the pin ───────────────────────────────────────────────────────
    //
    // Stopped on ARM rather than on the first beat (spec §5.5). The plan's
    // "stop on leaving idle" is too late by one event: beat 1 is itself a wheel
    // gesture, and Lenis has its own listener on the same event, so by the time
    // the beat is counted Lenis has already begun a scroll. §5.3 requires beat 1
    // to move nothing.
    //
    // ⚠️ lenisRef is null under reduced motion — SmoothScroll never constructs
    // it there. That path returned above, but the null check stays because it is
    // also null for the frames between mount and the provider's own effect.
    lenisRef.current?.stop()
    const prevTouchAction = heroEl.style.touchAction
    const prevOverscroll = heroEl.style.overscrollBehavior
    heroEl.style.touchAction = 'none'
    heroEl.style.overscrollBehavior = 'none'

    const releasePin = () => {
      lenisRef.current?.start()
    }

    /**
     * Build the transit's geometry from where SAMSARA ACTUALLY is.
     *
     * Rebuilt every frame rather than captured once, so a resize mid-fall
     * re-solves against the new viewport instead of driving a stale one.
     * `startSizePx` is the single captured value — see its assignment.
     */
    const buildCtx = (eng: MascotEngine): TransitContext | null => {
      const f = eng.getOrbitFrame()
      if (!f.W || !f.H) return null
      const b = beltRef.current
      const m = mascotRef.current
      return {
        cfg: cfgRef.current,
        W: f.W,
        H: f.H,
        mobile: f.mobile,
        cx: f.cx,
        cy: f.cy,
        hh: logoScreenBox(f.W, f.H, f.mobile).hh,
        orbitR: f.orbitR,
        height: f.heightPx,
        // TILT_OFFSET folded into the plane, because transitScript derives its
        // own tiltRad from plane.TILT alone while the engine adds the mascot's
        // offset. Left unfolded, the two would disagree about where the far
        // point is by exactly that offset — invisible at the shipped 0 and a
        // jump at the seam the moment anyone tuned it.
        plane: { TILT: b.TILT + m.TILT_OFFSET, TILT_SIDEWAY: b.TILT_SIDEWAY, PERSPECTIVE: b.PERSPECTIVE },
        startSizePx,
      }
    }

    const logoBoxFor = (ctx: TransitContext): Box => {
      const box = logoScreenBox(ctx.W, ctx.H, ctx.mobile)
      return { x: box.cx - box.hw, y: box.cy - box.hh, w: box.hw * 2, h: box.hh * 2 }
    }

    /**
     * The camera, and the plane SAMSARA enters the room on.
     *
     * The framing itself lives in room.ts beside the geometry it is solved from
     * — the engine's dev handle needs the same answer, and a second copy here
     * would let the bench show a framing the real transition does not use.
     */
    const solveCamera = (ctx: TransitContext) => {
      const cam = roomCameraFor(ctx.cfg.ROOM, ctx.H)
      cameraDistance = cam.distance
      // SAMSARA enters at the BACK of the room and comes forward with every
      // bounce (spec §5.6, §6.3). Held off the back wall by its own world radius
      // there, so it never intersects the geometry it is falling in front of —
      // computed, not nudged by a literal.
      const backDist = cam.distance + ctx.cfg.ROOM.DEPTH
      const rBack = worldSizeFor(startSizePx, backDist, ctx.H, cam.fovDeg) / 2
      zBack = -ctx.cfg.ROOM.DEPTH + rBack
      return cam
    }

    const promote = (eng: MascotEngine, ctx: TransitContext, nowMs: number) => {
      promoted = true
      promotedAtMs = nowMs
      const root = rootElRef.current
      if (root) {
        root.style.position = 'fixed'
        root.style.inset = '0'
        root.style.zIndex = String(PROMOTED_Z)
      }
      eng.setCameraMode('perspective', solveCamera(ctx))
      eng.setRoomVisible(true)
      // Ordered, not incidental: the room is built visible, so the reveal must
      // be zeroed in the same synchronous block or it paints over the hero for
      // one frame before the fade it is supposed to arrive on.
      eng.setRoomReveal(0)
      // Spec §6.3b, owner requirement. Fire and forget: it resolves false rather
      // than throwing when the 2.1 MB asset is unavailable, and the room must
      // never wait on it. The swap happens under cover of the fall, while
      // SAMSARA is still small and moving.
      void eng.loadDetail(ROOM_MODEL_URL)
    }

    const demote = (eng: MascotEngine) => {
      promoted = false
      sweepSettled = false
      sweepArmed = false
      const root = rootElRef.current
      if (root) {
        root.style.position = 'absolute'
        root.style.inset = '0'
        // ⚠️ Removed, not set to 0. `z-index: 0` creates a stacking context;
        // `auto` does not. Leaving a numeric value here would collapse the
        // hero's z 0/2 sandwich and the mascot could never pass behind the mark
        // again — the load-bearing property of the whole shipped orbit.
        root.style.removeProperty('z-index')
      }
      eng.setCameraMode('ortho')
      eng.setRoomReveal(0)
      eng.setRoomVisible(false)
      eng.setMode('orbit')
      eng.setTransform(null)
      eng.setAngleOverride(null)
    }

    // ── gestures ──────────────────────────────────────────────────────
    const applyBeat = (beat: Beat) => {
      if (!beat) return
      const before = ctrl.mode
      ctrl.beat(beat)
      if (ctrl.mode === 'committed' && before !== 'committed') {
        // Capture the sweep the instant the commit lands, so the ease has a
        // fixed start and a fixed length regardless of where the belt was.
        const eng = engineRef.current
        const f = eng?.getOrbitFrame()
        if (f) {
          const m = mascotRef.current
          sweepFrom = f.angle + (m.PHASE * Math.PI) / 180
          const dir = beltRef.current.ORBIT_DIR < 0 ? -1 : 1
          // Travel FORWARD along the orbit's own direction to the far point.
          // Solving for the signed shortest path instead would reverse the belt
          // for up to half a turn, which reads as the animation stuttering
          // backwards at the exact moment it is asked to commit.
          const TAU = Math.PI * 2
          const need = dir * (farPointAngle() - sweepFrom)
          sweepBy = dir * (((need % TAU) + TAU) % TAU)
          sweepArmed = true
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      // Non-passive and unconditional while the sequence holds the hero: §5.3
      // requires beats 1–3 to move nothing, and beat 1 IS a wheel gesture — a
      // handler that only prevents once the mode has left idle is one event too
      // late and the page lurches on the first scroll.
      e.preventDefault()
      applyBeat(feedWheel(gest, e.deltaY, performance.now(), cfgRef.current.GESTURES))
    }

    let touchY: number | null = null
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const y = e.touches[0]?.clientY
      if (y == null || touchY == null) return
      // Screen y grows downward, so a finger moving UP is a scroll DOWN.
      const delta = touchY - y
      touchY = y
      applyBeat(feedTouchMove(gest, delta, performance.now(), cfgRef.current.GESTURES))
    }
    const onTouchEnd = () => {
      touchY = null
      endTouch(gest)
    }

    heroEl.addEventListener('wheel', onWheel, { passive: false })
    heroEl.addEventListener('touchstart', onTouchStart, { passive: true })
    heroEl.addEventListener('touchmove', onTouchMove, { passive: false })
    heroEl.addEventListener('touchend', onTouchEnd, { passive: true })
    heroEl.addEventListener('touchcancel', onTouchEnd, { passive: true })

    // ── the frame ─────────────────────────────────────────────────────
    const frame = (now: number) => {
      const dt = Math.min(now - last, 100)
      last = now
      elapsed += dt
      ctrl.advance(dt)

      const eng = engineRef.current
      const cfg = cfgRef.current
      const mode = ctrl.mode

      if (mode !== lastMode) {
        lastMode = mode
        modeCbRef.current?.(mode)
        if (mode === 'landed') releasePin()
        if (mode === 'idle') lenisRef.current?.stop()
      }

      // Spec §5.8. The sequence owns the charge from beat 1, so hold-to-separate
      // must be off: during a pin `scrollY` never changes, so ShatterController's
      // own scroll-disarm can never fire and the visitor would otherwise be able
      // to fight the cinematic with a pointer press.
      const holdAllowed = ctrl.pointerHoldAllowed
      if (holdAllowed !== lastHoldAllowed) {
        lastHoldAllowed = holdAllowed
        holdCbRef.current(holdAllowed)
      }

      const shake = ctrl.shakePx
      if (shake !== lastShake) {
        lastShake = shake
        shakeCbRef.current(shake)
      }

      if (!eng) {
        raf = requestAnimationFrame(frame)
        return
      }

      const total = ctrl.transitTotalMs
      const half = cfg.TRANSIT.HALF_ORBIT_MS
      const tMs = ctrl.transit01 * total

      // The charge the BELT sees, which is not the same as the controller's.
      //
      // The controller holds it at 1 through the whole cinematic, which is right
      // for its own state machine. But HOLD_SHAKE_PX jitters SAMSARA by up to
      // 1.5px while it is still on the orbit path, and the scripted pose that
      // takes over at the seam has no jitter — so holding the charge across the
      // handoff would put a 1.5px step exactly where the seam is measured. Fading
      // it out across the sweep removes that by construction, and reads correctly
      // besides: the freeze is what beats 1–3 built, and it is over the moment
      // SAMSARA breaks out of the belt.
      const published =
        mode === 'committed'
          ? ctrl.chargeLevel * (1 - clamp01(half > 0 ? tMs / half : 1))
          : mode === 'landed' || mode === 'exiting'
            ? 0
            : ctrl.chargeLevel
      chargeOutRef.current = published

      if (mode === 'idle' || mode === 'charge1' || mode === 'charge2' || mode === 'charge3') {
        if (promoted) demote(eng)
        else if (eng.getAngleOverride() !== null) eng.setAngleOverride(null)
        raf = requestAnimationFrame(frame)
        return
      }

      if (mode === 'committed' && tMs < half && !promoted) {
        // ── the sweep ──────────────────────────────────────────────────
        // Still IN the belt: orbit mode, so the depth cue, the perspective
        // divide and the z-flip all keep working and SAMSARA can pass behind
        // the mark on its way round.
        const p = smooth(clamp01(half > 0 ? tMs / half : 1))
        if (sweepArmed) eng.setAngleOverride(sweepFrom + sweepBy * p)
        raf = requestAnimationFrame(frame)
        return
      }

      if (!promoted && !sweepSettled) {
        // ⚠️ One frame of settle, and it is not a nicety.
        //
        // The sweep's last frame lands at whatever `tMs / half` happened to be
        // just under 1, and the smoothstep still has a sliver of angle left. Over
        // a 511px orbit radius that sliver is several pixels — MEASURED at 3.5px
        // (1440x900) and 4.9px (1280x720), against a 1px budget, while 390x844
        // passed at 0.18px purely because its start angle left less to travel.
        // A seam that is continuous on one viewport and not on another is the
        // §12-risk-2 failure shape exactly.
        //
        // So: park the override on the far point EXACTLY, yield, and let the
        // engine render that pose in ortho. The next frame promotes from a pose
        // that already is transitPoseAt(0), and the handoff is continuous by
        // construction rather than by tolerance. It costs one frame, ~16ms,
        // inside a 3.4s cinematic.
        eng.setAngleOverride(farPointAngle())
        sweepSettled = true
        raf = requestAnimationFrame(frame)
        return
      }

      // ── the seam ──────────────────────────────────────────────────────
      if (!promoted) {
        // The size the engine ACTUALLY drew on its last orbit frame, parked at
        // the far point by the override. Read rather than recomputed on purpose:
        // a second copy of the depth-cue formula would make the seam depend on
        // two expressions agreeing, and this one cannot disagree with itself.
        startSizePx = eng.getOrbitFrame().diameterPx
        const seamCtx = buildCtx(eng)
        if (!seamCtx) {
          raf = requestAnimationFrame(frame)
          return
        }
        const pose0 = transitPoseAt(0, seamCtx)
        // A GUARD, not a mechanism (see hasClearedLogo). With shipped geometry
        // SAMSARA's box clears the mark's by 19.1px at the far point and this is
        // true on the first frame. The margin is thin and viewport-dependent, so
        // on a window where it vanishes the promotion defers rather than popping
        // — but never past first contact with the floor, because by then SAMSARA
        // is large and in front and leaving the hero showing under it is the
        // worse of the two failures.
        const past = clamp01((tMs - half) / Math.max(1, total - half))
        const mustPromote = bounceAt(past, cfg.TRANSIT).bounceIndex >= 0
        if (hasClearedLogo(pose0, logoBoxFor(seamCtx)) || mustPromote) {
          promote(eng, seamCtx, tMs)
        }
      }

      // ── the fall, the bounces, the landing ────────────────────────────
      //
      // ⚠️ Built HERE, after the seam block, never before it. `startSizePx` is
      // captured at the promotion, and a context built earlier in the frame
      // carries the 0 it held beforehand — which makes the transit interpolate
      // its size up from nothing and drops SAMSARA to 0.27px for exactly one
      // frame at the seam. Measured, not theorised: samsara-seam.mjs caught it.
      const ctx = buildCtx(eng)
      if (!ctx) {
        raf = requestAnimationFrame(frame)
        return
      }
      // ⚠️ The transit clock starts at the PROMOTION, not at HALF_ORBIT_MS.
      //
      // Those are not the same instant. The sweep ends on the first frame where
      // `tMs >= half`, one more frame goes to settling the angle on the far
      // point, and the guard can defer further — so by the time the scripted
      // pose takes over, `tMs - half` is already 30–50ms. Dividing by that
      // origin evaluates the first scripted frame at t ≈ 0.012 instead of 0, and
      // SAMSARA arrives a step down the fall: MEASURED as 3.8px of size and
      // 4.3px of x appearing in one frame, on three viewports, immediately after
      // the frame-labelling fix made the seam visible to the assertion at all.
      //
      // Anchoring here makes transitPoseAt(0) the pose the last orthographic
      // frame actually rendered, whenever the promotion happens to land.
      const t01 =
        mode === 'landed' || mode === 'exiting'
          ? 1
          : clamp01((tMs - promotedAtMs) / Math.max(1, total - promotedAtMs))
      const pose = transitPoseAt(t01, ctx)
      let x = pose.x
      let y = pose.y
      let sizePx = pose.sizePx
      let depth01 = pose.depth01

      if (mode === 'landed') {
        // Idle float. Not part of the transit script, which ends at the hover
        // height and hands over here.
        const b = cfg.LANDING
        y += Math.sin((elapsed / Math.max(1, b.HOVER_BOB_MS)) * Math.PI * 2) * b.HOVER_BOB_PX
      }

      if (mode === 'exiting') {
        // ⚠️ Not a rewind of the fall (spec §5.1). A three-bounce arc scrubbed
        // backwards does not read as physics. The exit is its own short move:
        // straight back to the far point, room fading out under it.
        const e = ctrl.exit01
        const back = transitPoseAt(0, ctx)
        x = pose.x + (back.x - pose.x) * e
        y = y + (back.y - y) * e
        sizePx = pose.sizePx + (back.sizePx - pose.sizePx) * e
        depth01 = pose.depth01 * (1 - e)
      }

      // World Z from the bounce's own depth term, so SAMSARA really is deeper in
      // the room early on and really does come forward with each contact — which
      // is what puts its shadow where the body is rather than under the camera.
      const z = zBack + (0 - zBack) * depth01
      eng.setMode(mode === 'landed' ? 'room' : 'transit')
      eng.setTransform({ x, y, sizePx, z })

      // Spec §4.2: the room's fade-up FOLLOWS the promotion, never precedes it —
      // starting earlier would cover SAMSARA while it is still drawing on the
      // hero's back canvas.
      if (mode === 'exiting') {
        eng.setRoomReveal(1 - ctrl.exit01)
      } else if (promoted) {
        eng.setRoomReveal(clamp01((tMs - promotedAtMs) / Math.max(1, cfg.TRANSIT.FALL_MS)))
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    // Dev handle for the verification harness and the Task 12 bench: the
    // sequence is driven by hardware gestures, and a browser script cannot
    // synthesise a trackpad. Reading state is the other half — samsara-seam.mjs
    // needs the exact frame the promotion happens on.
    const w = window as unknown as Record<string, unknown>
    w.__ttSamsara = () => ({
      mode: ctrl.mode,
      transit01: ctrl.transit01,
      exit01: ctrl.exit01,
      charge: chargeOutRef.current,
      shake: ctrl.shakePx,
      promoted,
      pinned: ctrl.pinned,
      cameraDistance,
      zBack,
      startSizePx,
    })
    w.__ttSamsaraBeat = (dir: 'down' | 'up') => {
      applyBeat(dir)
      return ctrl.mode
    }
    w.__ttSamsaraReset = () => {
      ctrl.reset()
      const eng = engineRef.current
      if (eng) demote(eng)
      chargeOutRef.current = 0
      return ctrl.mode
    }

    return () => {
      cancelAnimationFrame(raf)
      heroEl.removeEventListener('wheel', onWheel)
      heroEl.removeEventListener('touchstart', onTouchStart)
      heroEl.removeEventListener('touchmove', onTouchMove)
      heroEl.removeEventListener('touchend', onTouchEnd)
      heroEl.removeEventListener('touchcancel', onTouchEnd)
      heroEl.style.touchAction = prevTouchAction
      heroEl.style.overscrollBehavior = prevOverscroll
      // Unmounting mid-pin must never strand the page. This is the one cleanup
      // that cannot be skipped: a stopped Lenis with no sequence left to release
      // it is a site the visitor cannot scroll.
      releasePin()
      const eng = engineRef.current
      if (eng) demote(eng)
      chargeOutRef.current = 0
      shakeCbRef.current(0)
      holdCbRef.current(true)
      ctrlRef.current = null
      delete w.__ttSamsara
      delete w.__ttSamsaraBeat
      delete w.__ttSamsaraReset
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, config.ENABLED])

  // Config edits (the bench, and the CMS once Task 15 lands) reach the running
  // machine without tearing the sequence down mid-cinematic.
  useEffect(() => {
    ctrlRef.current?.setConfig(config)
    engine?.setRoomConfig(config.ROOM)
  }, [config, engine])

  return null
}
