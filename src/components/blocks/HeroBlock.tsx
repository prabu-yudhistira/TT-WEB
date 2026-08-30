'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { LogoStage } from '../hero/LogoStage'
import { SatelliteField } from '../hero/SatelliteField'
import { MascotLayer } from '../hero/MascotLayer'
import type { SeparationConfig } from '../../lib/three/shatter/types'
import type { IgnitionConfig } from '../../lib/three/ignition/types'
import type { SatelliteConfig } from '../../lib/satellites/types'
import type { MascotConfig } from '../../lib/mascot/types'
import type { MascotEyesConfig } from '../../lib/mascot/eyeTypes'
import type { LabelBox } from '../../lib/satellites/labels'

type Props = {
  line1: string
  line2?: string | null
  locationLine?: string | null
  scrollCue?: string | null
  constellationEnabled?: boolean
  // Required, not optional: a dropped prop must fail loudly rather than
  // silently reverting the hero to frozen defaults.
  separation: SeparationConfig
  ignition: IgnitionConfig
  satellites: SatelliteConfig
  mascot: MascotConfig
  eyes: MascotEyesConfig
  floatingWords?: string[]
}

const TYPE_DUR_S = 1.4 // characters finish typing by this mark (owner 2026-07-17: 1.4s reveal / 7s full)
const HOLD_DUR_S = 5.6 // complete text stays put this long — dissolve begins at the 7s mark
const DISMISS_AT_MS = (TYPE_DUR_S + HOLD_DUR_S) * 1000
const HEADLINE_AFTER_VIDEO_MS = 300 // owner 2026-07-18: typing starts 0.3s after the video truly plays
const VIDEO_START_FALLBACK_MS = 8000 // video stalls with no error/end → run the headline anyway

// Splits a line into per-character spans with a staggered animation-delay so
// each line types itself out over TYPE_DUR_S seconds (CSS keyframes only —
// no GSAP/SplitText involved, deliberately: a prior version used SplitText
// here and it's suspected of throwing silently in some browsers, which left
// the whole hero blank forever since downstream state never unblocked).
function TypedLine({ text }: { text: string }) {
  const chars = useMemo(() => text.split(''), [text])
  return (
    <>
      {chars.map((ch, i) => (
        <span
          key={i}
          className="hero-char"
          style={{ animationDelay: `${(i / Math.max(1, chars.length - 1)) * TYPE_DUR_S}s` }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  )
}

// No preloader — the hero IS the arrival moment (spec base §1.2/§3.2).
// Sequence: the sketch-draw video starts → 0.3s after playback truly begins
// (`playing` event, NOT mount — a slow-buffering video must not be typed
// over) the headline types itself out letter-by-letter (1.4s type, 5.6s hold
// — see TYPE_DUR_S/HOLD_DUR_S) → headline dissolves 7s after it started →
// video ends and crossfades to the rotating 3D logo → constellation floating
// words activate. Nothing is gated behind a "seen this session" flag, so the
// whole sequence replays every time the hero remounts (e.g. navigating back
// from Manifesto/Archive).
export function HeroBlock({
  line1,
  line2,
  locationLine,
  scrollCue,
  constellationEnabled = true,
  separation,
  ignition,
  satellites,
  mascot,
  eyes,
  floatingWords = [],
}: Props) {
  const metaRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLSpanElement>(null)
  const [stageLive, setStageLive] = useState(false)
  const [videoStarted, setVideoStarted] = useState(false)
  const heroRef = useRef<HTMLElement>(null)

  /**
   * Rigid page shake for the SAMSARA freeze (spec §4.4, corrected in Task 10).
   *
   * ⚠️ Applied to the DOM layers ONLY — never to a wrapper around the 3D ones.
   *
   * Two constraints pull against each other here. A `transform` on an ancestor
   * of MascotLayer would make that ancestor the containing block for
   * `position: fixed`, restoring the hero's `overflow: hidden` clipping and
   * trapping SAMSARA mid-fall — intermittently, only while shaking. But the
   * obvious alternative, one shake wrapper around the hero's contents, is
   * worse: satellites-back (z0), MascotLayer (z0), LogoStage (z0) and
   * satellites-front (z2) all interleave inside ONE stacking context, and a
   * transform creates a new one, collapsing them into a unit so the mascot
   * could never pass behind the mark again.
   *
   * It costs nothing to leave the 3D layers alone: all three already shake from
   * their own charge-driven jitter (HOLD_SHAKE_PX on the satellites and the
   * mascot, the separation on the logo). The DOM is the part that was missing.
   */
  const [shakePx, setShakePx] = useState(0)
  const shakeRef = useRef(0)
  shakeRef.current = shakePx

  useEffect(() => {
    if (shakePx <= 0) return
    const cfg = { hz: 14 }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = (now - t0) / 1000
      const a = shakeRef.current
      const x = Math.sin(t * cfg.hz * Math.PI * 2) * a
      const y = Math.cos(t * cfg.hz * 1.31 * Math.PI * 2) * a
      const el = heroRef.current
      if (el) {
        el.style.setProperty('--tt-shake-x', `${x.toFixed(2)}px`)
        el.style.setProperty('--tt-shake-y', `${y.toFixed(2)}px`)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      const el = heroRef.current
      if (el) {
        el.style.setProperty('--tt-shake-x', '0px')
        el.style.setProperty('--tt-shake-y', '0px')
      }
    }
  }, [shakePx])

  // Dev handle so the shake can be driven before the sequence wiring exists.
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__ttHeroShake = (px: number) => {
      setShakePx(px)
      return px
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).__ttHeroShake
    }
  }, [])

  const [headlineStarted, setHeadlineStarted] = useState(false)
  const [headlineDismissed, setHeadlineDismissed] = useState(false)
  const onStageLive = useCallback(() => setStageLive(true), [])
  const onIntroPlayStart = useCallback(() => setVideoStarted(true), [])

  // Holds LogoEngine.getCharge so the satellites can read the separation's
  // charge each frame and freeze/shake with it. A ref rather than state: the
  // charge changes every frame, and re-rendering at 60Hz to carry one number
  // the canvas loop can pull directly would be pure overhead.
  const chargeRef = useRef<(() => number) | null>(null)
  const onChargeSource = useCallback((get: (() => number) | null) => {
    chargeRef.current = get
  }, [])

  // Carries the mascot's current label box to the satellites' collision pass,
  // so the mascot's word wins any overlap. Pull-based like chargeRef: it
  // changes every frame and mirroring it into React state would cost a
  // re-render per frame.
  const labelBoxRef = useRef<(() => LabelBox | null) | null>(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      gsap.set(metaRef.current, { clearProps: 'all' })
      return // headline stays fully visible, no typing/dissolve animation
    }
    gsap.set(metaRef.current, { yPercent: 100 })
    gsap.to(metaRef.current, { yPercent: 0, duration: 0.75, ease: 'power3.out', delay: 0.1 })
  }, [])

  // Safety net: if the video never fires `playing` (and never errors — e.g. a
  // stalled network) don't leave the headline hidden forever.
  useEffect(() => {
    if (videoStarted) return
    const t = setTimeout(() => setVideoStarted(true), VIDEO_START_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [videoStarted])

  useEffect(() => {
    if (!videoStarted) return
    const t = setTimeout(() => setHeadlineStarted(true), HEADLINE_AFTER_VIDEO_MS)
    return () => clearTimeout(t)
  }, [videoStarted])

  useEffect(() => {
    if (!headlineStarted) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return // stays visible
    const t = setTimeout(() => setHeadlineDismissed(true), DISMISS_AT_MS)
    return () => clearTimeout(t)
  }, [headlineStarted])

  useEffect(() => {
    if (!headlineDismissed) return
    // headline is dissolving (CSS transition below) — once it's clear of the
    // layout, let the constellation reclaim the freed space
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 650)
    return () => clearTimeout(t)
  }, [headlineDismissed])

  useEffect(() => {
    const onScroll = () => {
      gsap.to(cueRef.current, { opacity: 0, duration: 0.4, ease: 'power1.out' })
      window.removeEventListener('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section
      ref={heroRef}
      style={{ position: 'relative', minHeight: '100svh', overflow: 'hidden' }}
    >
      {/* Mobile-only: the sketch video is a mid-screen band there, leaving
          bare site background above/below — fill the whole hero with the
          video's own paper (Paper-BG.jpg, same sheet/shoot) so it reads as
          one continuous page. Bottom 10% fades out to blend into the site's
          paper-tile background. Owner request 2026-07-17. */}
      <div className="tt-hero-paper" aria-hidden />
      {/* Before <LogoStage> deliberately: the satellites' back canvas and
          LogoStage are both at z-index 0, so the logo has to come later in the
          DOM to paint over the particles orbiting behind it. */}
      <SatelliteField
        words={floatingWords}
        config={satellites}
        active={stageLive}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
        enabled={satellites.SAT_ENABLED}
      />
      {/* Also before <LogoStage>: its z-0 (behind-the-mark) state relies on
          painting before the logo does. Reads the satellites' config as the
          belt it shares. */}
      <MascotLayer
        config={mascot}
        belt={satellites}
        active={stageLive}
        enabled={mascot.ENABLED}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
        eyes={eyes}
      />
      <LogoStage
        onLive={onStageLive}
        onIntroPlayStart={onIntroPlayStart}
        separation={separation}
        ignition={ignition}
        onChargeSource={onChargeSource}
      />

      <div
        className={`hero-headline-overlay${headlineStarted ? ' headline-started' : ''}`}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: headlineDismissed ? 0 : 1,
          visibility: headlineDismissed ? 'hidden' : 'visible',
          transition: 'opacity 0.6s ease',
        }}
      >
        <div className="tt-container" style={{ position: 'relative', height: '100%' }}>
          <h1
            className="tt-display hero-text1"
            data-constellation-avoid
            style={{
              position: 'absolute',
              top: 'clamp(96px, 14vh, 140px)',
              left: 0,
              margin: 0,
              whiteSpace: 'nowrap',
              color: '#333333',
              fontSize: 'clamp(1.75rem, 4.8vw, calc(var(--text-h1) * 1.12))',
              lineHeight: 'var(--leading-display)',
            }}
          >
            <TypedLine text={line1} />
          </h1>
          {line2 ? (
            <p
              className="hero-text2"
              data-constellation-avoid
              style={{
                position: 'absolute',
                bottom: 'calc(8vh + 4.5rem)',
                right: 0,
                margin: 0,
                whiteSpace: 'nowrap',
                textAlign: 'right',
                color: 'var(--accent)',
                fontSize: 'clamp(1.3rem, 3vw, calc(var(--text-manifesto) * 1.15))',
                lineHeight: 'var(--leading-manifesto)',
              }}
            >
              <TypedLine text={line2} />
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="tt-container tt-hero-domshake"
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          paddingBottom: '8vh',
          pointerEvents: 'none',
        }}
      >
        <div
          ref={metaRef}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{locationLine}</span>
          <span ref={cueRef} style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
            ↓ {scrollCue}
          </span>
        </div>
      </div>

      <style>{`
        .hero-char {
          display: inline-block;
          opacity: 0;
        }
        /* The typing animation only exists once the video actually plays
           (+0.3s) — animations are created fresh when .headline-started
           lands, so every char's stagger delay counts from that moment.
           linear (not steps(1)) over 10ms: visually still a hard pop, but
           steps(1) left chars stuck invisible when Chrome computed final
           progress as 0.99999… instead of 1 for some delay values. */
        .headline-started .hero-char {
          animation: heroTypeIn 0.01s linear forwards;
        }
        @keyframes heroTypeIn {
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-char { animation: none; opacity: 1; }
        }
        /* SAMSARA freeze shake — DOM layers ONLY. See the shakePx comment in
           this component: transforming an ancestor of MascotLayer would clip
           the fall, and wrapping the 3D layers would collapse the z-sandwich
           that lets the mascot pass behind the mark. */
        .hero-headline-overlay,
        .tt-hero-domshake {
          transform: translate(var(--tt-shake-x, 0px), var(--tt-shake-y, 0px));
        }
        .tt-hero-paper { display: none; }
        @media (max-width: 639px) {
          .tt-hero-paper {
            display: block;
            position: absolute;
            inset: 0;
            background: url('/media/paper-bg-hero.webp') center / cover no-repeat;
            -webkit-mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
            mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
            pointer-events: none;
          }
        }
        @media (max-width: 639px) {
          /* Sits above the logo (mobile logo box is roughly 41–65vh — see
             MOBILE_HEIGHT_FRAC/CENTER_Y in lib/three/calibration.ts) so the
             two lines frame it top/bottom without overlapping. line1 sits
             right at the frame's top edge (owner's marked-up screenshot),
             not high up under the header. */
          .hero-text1 {
            position: absolute !important;
            top: clamp(150px, 29vh, 230px) !important;
            left: 50% !important;
            right: auto !important;
            bottom: auto !important;
            transform: translateX(-50%) !important;
            text-align: center !important;
            font-size: clamp(1.4rem, 8vw, 2.1rem) !important;
          }
          .hero-text2 {
            position: absolute !important;
            top: 71vh !important;
            left: 50% !important;
            right: auto !important;
            bottom: auto !important;
            transform: translateX(-50%) !important;
            text-align: center !important;
            font-size: clamp(1.15rem, 6vw, 1.75rem) !important;
          }
        }
      `}</style>
    </section>
  )
}
