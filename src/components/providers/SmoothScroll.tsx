'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * The live Lenis instance, or null.
 *
 * A module-level ref rather than a context, to match this file: SmoothScroll
 * renders nothing, sits at the app root and has no provider around it, so a
 * context would be a wrapper built for exactly one consumer.
 *
 * ⚠️ It is null under `prefers-reduced-motion`, because Lenis is never
 * constructed there — and that is not an edge case to guard once and forget.
 * The SAMSARA pin has no scroll to stop on that path (spec §5.9: no pin, no
 * cinematic), so every caller must treat null as "there is no smooth scroll to
 * hold" rather than as "not ready yet".
 */
export const lenisRef: { current: Lenis | null } = { current: null }

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.registerPlugin(ScrollTrigger)
    const lenis = new Lenis()
    lenisRef.current = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(raf)
      // Cleared before destroy, so nothing can reach a destroyed instance — a
      // stale ref here would leave the page permanently stopped if the sequence
      // unmounted mid-pin.
      lenisRef.current = null
      lenis.destroy()
    }
  }, [])

  return null
}
