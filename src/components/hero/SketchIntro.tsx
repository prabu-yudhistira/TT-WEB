'use client'

import { useEffect, useRef, useState } from 'react'

// Full-bleed sketch-draw video, plays on every hero mount (no "seen once"
// skip) so navigating back to the hero — e.g. from Manifesto/Archive —
// always replays it, then hands off to the 3D mesh (spec §7). No poster:
// until the first frame renders the element is transparent (bare paper
// background behind it) — the old poster was the video's FINAL frame and
// spoiled the draw-in whenever the file was slow to buffer. Reduced-motion
// hands off to the static 3D mesh immediately.
export function SketchIntro({
  onDone,
  onPlayStart,
  onNearEnd,
  nearEndLeadMs = 0,
}: {
  onDone: () => void
  onPlayStart?: () => void
  /** fires once, `nearEndLeadMs` before playback ends — the ignition cage rides in here */
  onNearEnd?: () => void
  nearEndLeadMs?: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hidden, setHidden] = useState(false)
  const doneRef = useRef(false)
  const startedRef = useRef(false)
  const nearEndRef = useRef(false)

  // Fires once, when playback truly begins (first `playing` event) — the
  // headline keys off this instead of mount time, so it can't type over a
  // still-buffering video.
  const signalStart = () => {
    if (startedRef.current) return
    startedRef.current = true
    onPlayStart?.()
  }

  const signalNearEnd = () => {
    if (nearEndRef.current) return
    nearEndRef.current = true
    onNearEnd?.()
  }

  // `timeupdate` only fires a few times a second, so this lands within ~250ms of
  // the intended moment. That is deliberately tolerated: the ignition completes
  // the morph itself if the overlay is cut short, which is the same mechanism
  // that absorbs the video's own duration not being frame-exact.
  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return
    if (v.currentTime >= v.duration - nearEndLeadMs / 1000) signalNearEnd()
  }

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    signalStart() // skipped/failed video must not strand headline consumers
    signalNearEnd() // ditto: a skipped video must still let the cage come up
    setHidden(true)
    onDone()
  }

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      finish()
      return
    }
    const v = videoRef.current
    if (!v) return
    v.play().catch(() => finish()) // autoplay blocked → skip to mesh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        opacity: hidden ? 0 : 1,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <video
        ref={videoRef}
        // Sizing rule lives in LogoStage — the static fallback logo has to match
        // this element exactly, and two copies of those numbers would drift.
        className="tt-hero-plate"
        muted
        playsInline
        preload="auto"
        onPlaying={signalStart}
        onTimeUpdate={onTimeUpdate}
        onEnded={finish}
        onError={finish}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      >
        <source src="/media/sketch-draw-16x9.webm" type="video/webm" />
        <source src="/media/sketch-draw-16x9.mp4" type="video/mp4" />
      </video>
    </div>
  )
}
