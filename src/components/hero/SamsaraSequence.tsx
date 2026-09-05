'use client'

import { useEffect, useRef } from 'react'
import { lenisRef } from '../providers/SmoothScroll'
import { MascotEngine } from '../../lib/mascot/MascotEngine'
import { SequenceController, type Mode } from '../../lib/samsara/SequenceController'
import { HologramController } from '../../lib/samsara/HologramController'
import { PokeController } from '@/lib/samsara/orbPoke'
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

export type SequenceControls = {
  beat: (dir: 'down' | 'up') => void
  reset: () => void
  mode: () => Mode
}

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
  logoChargeOutRef,
  onPointerHold,
  onMode,
  controlsRef,
  viewportOverride = null,
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
   * The mark's separation charge — SEPARATE from the belt's, and not an
   * oversight that there are two.
   *
   * `chargeOutRef` fades to 0 across the sweep, because HOLD_SHAKE_PX jitters
   * SAMSARA by 1.5px while it is still on the orbit path and the scripted pose
   * that takes over has no jitter, so carrying the charge across the handoff
   * would put a 1.5px step exactly where the seam is measured.
   *
   * The mark has no such constraint and the opposite requirement: the owner
   * asked for "the logo runs its full hold-to-separate", so it must stay blown
   * apart while SAMSARA leaves rather than snapping back together underneath
   * it. It holds through the commit and reassembles across the EXIT instead, as
   * the room clears and the hero comes back.
   */
  logoChargeOutRef?: React.MutableRefObject<number>
  /**
   * Spec §5.8, plan Task 11 step 4. Called with false from beat 1 and true again
   * on the return to idle. It reaches LogoEngine.setShatterArmed() through
   * LogoStage, which is the only path there — the sequence has no handle on the
   * logo engine and should not grow one.
   */
  onPointerHold: (allowed: boolean) => void
  onMode?: (m: Mode) => void
  /**
   * Imperative handle for the /dev/samsara bench: fire a beat, or reset.
   *
   * The same ref-carrying-functions pattern as `chargeRef` and `labelBoxRef`,
   * and for a related reason — the alternative is prop-drilling a control
   * surface through a component that renders nothing, or having the bench reach
   * for the `__ttSamsara*` window handles, which exist for verification scripts
   * and should not be a component's API.
   */
  controlsRef?: React.MutableRefObject<SequenceControls | null>
  /**
   * The viewport the hologram and the orbs are composed against — the bench's
   * simulated phone, and nothing else.
   *
   * ⚠️ UNDEFINED EVERYWHERE BUT /dev/samsara, deliberately, and the homepage
   * must keep it that way. `HOLOGRAM.MOBILE_*` and `EMITTERS.MOBILE_*` are a
   * different composition, not a smaller one; a build that read this from
   * anything but the bench could serve a real visitor the portrait screen on a
   * desktop window. Same containment as `controlsRef`.
   *
   * ⚠️ Carries W and H, not just the flag. This context feeds `screenQuad` and
   * `orbParkedPose`, which place things as FRACTIONS of it — a `mobile: true`
   * with a 1440x900 W/H would put the portrait screen at portrait fractions of
   * a landscape frame, which is a composition that exists nowhere.
   */
  viewportOverride?: { W: number; H: number; mobile: boolean } | null
}) {
  const ctrlRef = useRef<SequenceController | null>(null)
  const cfgRef = useRef(config)
  cfgRef.current = config

  // A ref, because the frame loop below is installed once and must see the
  // current value without the effect tearing the sequence down mid-cinematic.
  const viewportRef = useRef(viewportOverride)
  viewportRef.current = viewportOverride

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
    /**
     * Spec §5.10, fail-open. No engine, no sequence.
     *
     * ⚠️ This is not defensive tidiness — without it the site becomes a DEAD END
     * on any machine that cannot give us a GL context. `MascotLayer` catches the
     * failure and never calls `onEngine`, so `engine` stays null; but the
     * sequence armed anyway, installed its wheel listener, counted beats and
     * pinned the page with `lenis.stop()` — and then had nothing to animate, so
     * it never reached `landed` and never released. Measured: the document sat
     * at scrollY 0 through fourteen wheel gestures and Section 2 was
     * unreachable.
     *
     * `engine` is in this effect's deps, so arming simply waits for it rather
     * than being lost: the model loads asynchronously and normally arrives after
     * the hero goes live.
     */
    if (!engine) return

    const ctrl = new SequenceController(cfgRef.current)
    ctrlRef.current = ctrl
    const gest = createGestureState()

    // ── state that lives for one run of the sequence ──────────────────
    let promoted = false
    let promotedAtMs = 0
    /**
     * When the scripted fall actually BEGAN — the first frame past the seam.
     *
     * ⚠️ Not the same instant as `promotedAtMs`, and conflating the two was a
     * bug. The fall starts the moment the seam block runs; the promotion can
     * defer behind `hasClearedLogo` for hundreds of ms. Anchoring the transit
     * clock to the promotion made the fall's progress depend on a value that is
     * 0 on a fresh load — so the fall advanced before it had started — and
     * STALE after a demote, where `tMs` restarts and `tMs - promotedAtMs` goes
     * negative and clamps the fall to its own first frame forever. That is why
     * the sequence played correctly exactly once per page load and dropped
     * SAMSARA at the back wall on every replay after it.
     *
     * -1, not 0: 0 is a legitimate `tMs`, and the seam must be able to tell
     * "not started" from "started on frame zero".
     */
    let fallStartedAtMs = -1
    let startSizePx = 0
    let sweepFrom = 0
    let sweepBy = 0
    let sweepArmed = false
    let sweepSettled = false
    let lastShake = -1
    let lastHoldAllowed = true
    let lastMode: Mode | null = null
    /**
     * The hologram's own clock, running INSIDE `landed`.
     *
     * A separate machine from SequenceController on purpose — that one's modes
     * are asserted by name in six gates and the bench.
     */
    const holo = new HologramController()
    let holoStarted = false
    const poke = new PokeController()
    let lastHoloAttr: string | null = null
    let orbsRequested = false
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
      const cam = roomCameraFor(ctx.cfg.ROOM, ctx.H, ctx.mobile)
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
      // ⚠️ Both clocks go back with it. Left standing, they are read on the NEXT
      // run — before they are written again — and a stale anchor is what made
      // the replay differ from the first play at all.
      promotedAtMs = 0
      fallStartedAtMs = -1
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
      // ⚠️ A finger dragged across SAMSARA is BOTH a rotation and an upward
      // swipe, and an upward swipe means "leave the room". Without this,
      // inspecting the far side of the body on a phone exits the room instead
      // of turning it. The drag wins: it started ON the mascot, which is as
      // explicit as intent gets.
      if (engineRef.current?.isDragging()) return
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

    /**
     * Press and hold an orb.
     *
     * ⚠️ On WINDOW, not on the hero element, and pointerUP especially. A press
     * that starts on an orb and lifts anywhere else — over the DOM that will
     * sit on this screen, outside the window entirely — must still release, or
     * the orbs shake forever with nothing holding them.
     *
     * ⚠️ Does NOT fight the drag-to-turn. That is gated on hitsMascot(), and
     * SAMSARA parks well clear of the orbs, so the two hit tests never both
     * pass on the same press.
     */
    const onOrbDown = (e: PointerEvent) => {
      const c = cfgRef.current
      if (!c.POKE.ENABLED) return
      // Only once the screen exists — the flicker is the payoff, and there is
      // nothing to flicker while the orbs are still flying in.
      if (holo.phase !== 'emitting' && holo.phase !== 'forming' && holo.phase !== 'live') return
      const eng = engineRef.current
      if (!eng || !eng.hitsOrb(e.clientX, e.clientY, c.POKE.HIT_SLOP)) return
      poke.press()
    }
    const onOrbUp = () => poke.release()

    window.addEventListener('pointerdown', onOrbDown)
    window.addEventListener('pointerup', onOrbUp)
    window.addEventListener('pointercancel', onOrbUp)
    // A press whose release lands in another window would otherwise never end.
    window.addEventListener('blur', onOrbUp)

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
        /**
         * ⚠️ The pin is HELD through `landed`. It used to be released here.
         *
         * Owner requirement 2026-09-02: downward scrolling must do nothing once
         * SAMSARA has landed. Spec §6.7 — nothing sits below the room until
         * Section 3 exists — so scrolling down was 1,171px of travel behind a
         * fixed, full-screen canvas: the view never changed, and the only thing
         * it achieved was dragging the page off the room.
         *
         * ⚠️ Releasing here did NOT hand scrolling to the browser, which is why
         * the cause was not obvious. `onWheel` still calls preventDefault on
         * every event — measured, 8 of 8 — so the document never scrolled
         * itself. What moved the page was LENIS, restarted by this line and
         * doing its own smooth scrolling from the same wheel events.
         *
         * `SequenceController.beat()` already ignores `down` while landed, so
         * with the pin held a downward gesture is simply inert. `up` still
         * reaches it and still exits: verified end to end, landed -> idle.
         */
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

      /**
       * Park the spin once it has arrived, so the face SAMSARA lands with is the
       * one LANDING.ROT_X/Y/Z_DEG aims at the visitor.
       *
       * ⚠️ Without this the whole parked orientation is DEAD CONFIG. `place()`
       * only uses that pose when `spinParked` is true, so the owner could tune
       * ROT_X/Y/Z across four passes at the bench, watch it work there, and still
       * get a body turning at SPIN_SPEED 113 on the live page — approved values
       * loaded and doing nothing. SamsaraLab had called this since Task 12; the
       * component that runs on the real page never did.
       *
       * Set every frame rather than on the mode transition. It is a field
       * assignment, so it costs nothing, and a transition-only write is lost for
       * good if the engine happens to be null on the one frame that fires it —
       * the mode block above runs before the engine guard and would still have
       * advanced `lastMode`.
       *
       * The condition mirrors SamsaraLab's checkbox exactly, on purpose: the
       * moment the two disagree the bench stops predicting the site, which is the
       * only thing the bench is for. (`exiting` is inert today — the engine is in
       * `transit` mode by then and the pose eases back to the spin — but it is
       * kept so the intent survives a change to that mapping.)
       */
      eng.setSpinParked(mode === 'landed' || mode === 'exiting')

      const total = ctrl.transitTotalMs
      const half = cfg.TRANSIT.HALF_ORBIT_MS
      const tMs = ctrl.transit01 * total

      /**
       * ⚠️ Section 2 has no sequence-driven DOM as of 2026-09-03.
       *
       * The chatbox stub used to be revealed from here: this block computed a
       * boolean from `CHATBOX.DELAY_MS` and published `data-tt-chatbox` on
       * `<html>`, which the `samsaraRoom` block styled itself off. Both the box
       * and its config are gone; a holographic screen projected by two emitter
       * orbs replaces it.
       *
       * The technique is worth keeping when that lands. It was published as an
       * ATTRIBUTE on the document rather than through a ref, because the DOM is
       * not the hero's: it belongs to the `samsaraRoom` block, which RenderBlocks
       * mounts as a SIBLING the owner can reorder in /admin. Reaching across for
       * its element couples two blocks and breaks the moment Section 2 is moved
       * or removed; an attribute is a one-way contract that simply goes unread if
       * nothing is listening.
       *
       * And the PRESENCE/VALUE split is what made it fail open — presence lifted
       * the box onto the fixed layer above the promoted canvas, value faded it in
       * — so with no sequence running the attribute was never written and Section
       * 2 stayed ordinary readable content. Anything that floats DOM over the
       * room again needs that same split, or every degraded path gets a blank
       * black panel.
       */

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

      // The mark holds its separation right through the cinematic and lets go
      // across the exit — see logoChargeOutRef. Ramped rather than dropped: at
      // `idle` the hero is visible again, and a charge that fell to 0 in one
      // frame would snap the mark back together in front of the visitor.
      if (logoChargeOutRef) {
        logoChargeOutRef.current =
          mode === 'exiting' ? ctrl.chargeLevel * (1 - ctrl.exit01) : ctrl.chargeLevel
      }

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
        //
        // ⚠️ ONCE, on the first frame past the seam — NEVER re-read while the
        // promotion is deferred. This block runs every frame until the guard
        // below lets go, but by the second of them the fall has already put the
        // engine in `transit`, so `diameterPx` stops being an orbit frame and
        // becomes the engine reporting back the scripted size that this very
        // value computes. That loop inflated it 12px -> 408px over ~900ms and
        // walked `zBack` from -89 to -60 — invisible while the guard passed on
        // the first frame, which it did until the orbit was lowered.
        if (fallStartedAtMs < 0) {
          startSizePx = eng.getOrbitFrame().diameterPx
          fallStartedAtMs = tMs
        }
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
      // ⚠️ The transit clock starts at the SEAM, not at HALF_ORBIT_MS — and not
      // at the promotion, which is a different instant whenever the clearance
      // guard defers (see `fallStartedAtMs`).
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
          : clamp01((tMs - fallStartedAtMs) / Math.max(1, total - fallStartedAtMs))
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

      // ⚠️ The camera is re-solved EVERY frame while promoted, not once at the
      // promotion. Two things move under it: a viewport resize mid-fall (the
      // engine updates the perspective camera's aspect on resize but has no way
      // to know the distance was solved against the old height), and the bench
      // tuning ROOM.DEPTH or CAMERA_FOV_DEG live, which is the entire point of
      // Task 13. The screen pose is unaffected either way — place() re-solves
      // position and size at whatever distance it finds — so this reframes the
      // ROOM around SAMSARA rather than moving SAMSARA.
      eng.setCameraMode('perspective', solveCamera(ctx))

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

      // ── the hologram ────────────────────────────────────────────
      //
      // Fetched only once the room is actually committed to, so a hero-only
      // visit never pays 590 KB for two orbs it will not see.
      if ((mode === 'committed' || mode === 'landed') && !orbsRequested) {
        orbsRequested = true
        void eng.loadEmitters('/models/emitter-orb.draco.glb')
      }

      if (mode === 'landed') {
        if (!holoStarted) {
          holoStarted = true
          holo.start()
        }
        holo.update(cfg, dt)
        poke.update(cfg.POKE, dt)
      } else if (holoStarted) {
        // Leaving the room stands the whole thing down, so a replay starts
        // from the entry beat rather than mid-flicker.
        holoStarted = false
        holo.reset()
        // Leaving the room drops any press with it, or a hold that survived the
        // exit would still be shaking orbs nobody can see on the next entry.
        poke.reset()
      }

      const holoPhase = holo.phase
      if (eng.hasEmitters() && holoPhase !== 'dormant') {
        eng.setHologram({
          cfg,
          // The real window, unless the bench is simulating a phone — see
          // `viewportOverride`, which is undefined on every page but /dev/samsara.
          ctx: {
            W: viewportRef.current?.W ?? window.innerWidth,
            H: viewportRef.current?.H ?? window.innerHeight,
            mobile: viewportRef.current?.mobile ?? window.innerWidth < 640,
            roomDepth: cfg.ROOM.DEPTH,
            camZ: cfg.ROOM.DEPTH / 2,
          },
          phase: holoPhase,
          entry01: holo.entry01(cfg),
          form01: holo.form01(cfg),
          parkedMs: holo.parkedMs(),
          smokeMs: holo.totalMs,
          shake01: poke.shake01(cfg.POKE),
          pokeDip: poke.dip(cfg.POKE),
          dtMs: dt,
          reveal: eng.getRoomReveal(),
        })
      } else {
        eng.setHologram(null)
      }

      /**
       * The screen's DOM contract — spec §5.7.
       *
       * ⚠️ PRESENCE lifts, VALUE animates, and that split is load-bearing.
       * With no sequence running — reduced motion, no WebGL, sequenceEnabled
       * false — the attribute is never written, so a future subtitle/button
       * layer stays ordinary in-flow content. Gating on the value alone would
       * hand every degraded visitor a blank panel, which is exactly the bug
       * the removed chatbox's Task 14 comment recorded.
       *
       * It matters more here than it did for the chatbox: this screen will
       * carry SUBTITLES and OPTION BUTTONS. If those were reachable only
       * through a working hologram, the visitors who most need them would be
       * the ones who cannot get them.
       */
      const holoAttr = holoPhase === 'forming' || holoPhase === 'live' ? holoPhase : null
      if (holoAttr !== lastHoloAttr) {
        lastHoloAttr = holoAttr
        if (holoAttr) document.documentElement.dataset.ttHologram = holoAttr
        else delete document.documentElement.dataset.ttHologram
      }

      // ⚠️ From the engine's RENDERED snapshot, never read live — see the note
      // in MascotEngine.place(). A live read would be this frame's geometry
      // labelled with next frame's state.
      if (holoAttr) {
        const r = eng.rendered.holoRect
        if (r) {
          const st = document.documentElement.style
          st.setProperty('--tt-holo-x', `${r.x.toFixed(1)}px`)
          st.setProperty('--tt-holo-y', `${r.y.toFixed(1)}px`)
          st.setProperty('--tt-holo-w', `${r.w.toFixed(1)}px`)
          st.setProperty('--tt-holo-h', `${r.h.toFixed(1)}px`)
        }
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    // Dev handle for the verification harness and the Task 12 bench: the
    // sequence is driven by hardware gestures, and a browser script cannot
    // synthesise a trackpad. Reading state is the other half — samsara-seam.mjs
    // needs the exact frame the promotion happens on.
    const w = window as unknown as Record<string, unknown>
    w.__ttHologram = () => ({
      phase: holo.phase,
      rect: engineRef.current?.rendered.holoRect ?? null,
      attr: document.documentElement.dataset.ttHologram ?? null,
      // The press-and-hold state. A gate cannot see a shake in a screenshot,
      // and the flicker it fires lasts about half a second.
      poke: {
        phase: poke.phase,
        shake: poke.shake01(cfgRef.current.POKE),
        dip: poke.dip(cfgRef.current.POKE),
      },
    })
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
    const reset = () => {
      ctrl.reset()
      const eng = engineRef.current
      if (eng) demote(eng)
      chargeOutRef.current = 0
      if (logoChargeOutRef) logoChargeOutRef.current = 0
      shakeCbRef.current(0)
      return ctrl.mode
    }
    w.__ttSamsaraReset = reset

    if (controlsRef) {
      controlsRef.current = { beat: applyBeat, reset, mode: () => ctrl.mode }
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointerdown', onOrbDown)
      window.removeEventListener('pointerup', onOrbUp)
      window.removeEventListener('pointercancel', onOrbUp)
      window.removeEventListener('blur', onOrbUp)
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
      if (logoChargeOutRef) logoChargeOutRef.current = 0
      shakeCbRef.current(0)
      holdCbRef.current(true)
      ctrlRef.current = null
      if (controlsRef) controlsRef.current = null
      // Removed, not left at a value: a torn-down sequence must leave the page
      // exactly as one that never had a hologram, which is no attribute at all.
      delete document.documentElement.dataset.ttHologram
      for (const k of ['x', 'y', 'w', 'h']) {
        document.documentElement.style.removeProperty(`--tt-holo-${k}`)
      }
      delete w.__ttHologram
      delete w.__ttSamsara
      delete w.__ttSamsaraBeat
      delete w.__ttSamsaraReset
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, config.ENABLED, engine])

  // Config edits (the bench, and the CMS once Task 15 lands) reach the running
  // machine without tearing the sequence down mid-cinematic.
  useEffect(() => {
    ctrlRef.current?.setConfig(config)
    engine?.setRoomConfig(config.ROOM)
    // Both viewports' poses; the engine picks per frame — see setRoomPose.
    engine?.setRoomPose(
      {
        x: config.LANDING.ROT_X_DEG,
        y: config.LANDING.ROT_Y_DEG,
        z: config.LANDING.ROT_Z_DEG,
      },
      {
        x: config.LANDING.MOBILE_ROT_X_DEG,
        y: config.LANDING.MOBILE_ROT_Y_DEG,
        z: config.LANDING.MOBILE_ROT_Z_DEG,
      },
    )
    engine?.setDragConfig(config.DRAG)
    // Same number the press uses, so the cursor never promises a target the
    // press would miss, nor misses one the press would take.
    engine?.setOrbHitSlop(config.POKE.ENABLED ? config.POKE.HIT_SLOP : -1e6)
    engine?.setIdleEyes(config.IDLE_EYES)
    engine?.setBurstConfig(config.BURST)
    engine?.setExhaustConfig(config.EXHAUST)
  }, [config, engine])

  return null
}
