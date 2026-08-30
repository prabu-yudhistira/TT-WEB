'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText)

/**
 * Poetic manifesto scrub (spec base §1.2/§3.3): each statement pins as it
 * passes center, its words fill in (opacity 0.12->1) with scroll progress,
 * then drifts up and dims as the next statement takes over — verses handing
 * off. Reduced-motion: a plain, fully-visible, statically stacked list.
 */
export function ManifestoStrip({ statements }: { statements: string[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])

  useEffect(() => {
    if (statements.length === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const wrap = wrapRef.current
    const lines = lineRefs.current.filter((l): l is HTMLParagraphElement => !!l)
    if (!wrap || lines.length === 0) return

    const ctx = gsap.context(() => {
      const splits = lines.map((line) => new SplitText(line, { type: 'words' }))
      gsap.set(lines, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        xPercent: -50,
        yPercent: -50,
        opacity: 0,
        y: 40,
      })
      gsap.set(lines[0], { opacity: 1, y: 0 })
      splits.forEach((s) => gsap.set(s.words, { opacity: 0.12 }))

      const n = statements.length
      const trigger = ScrollTrigger.create({
        trigger: wrap,
        start: 'top top',
        end: `+=${n * 100}%`,
        pin: true,
        scrub: 0.4,
        onUpdate: (self) => {
          const raw = self.progress * n
          const idx = Math.min(n - 1, Math.floor(raw))
          const local = raw - idx
          splits.forEach((split, i) => {
            if (i < idx) {
              gsap.set(lines[i], { opacity: 0, y: -40 })
              gsap.set(split.words, { opacity: 1 })
            } else if (i === idx) {
              gsap.set(lines[i], { opacity: 1, y: 0 })
              const wc = split.words.length
              split.words.forEach((w, wi) => {
                const t = gsap.utils.clamp(0, 1, local * wc - wi)
                gsap.set(w, { opacity: gsap.utils.interpolate(0.12, 1, t) })
              })
            } else {
              gsap.set(lines[i], { opacity: 0, y: 40 })
              gsap.set(split.words, { opacity: 0.12 })
            }
          })
        },
      })

      return () => {
        trigger.kill()
        splits.forEach((s) => s.revert())
      }
    }, wrap)

    return () => ctx.revert()
  }, [statements])

  return (
    <div
      ref={wrapRef}
      data-block="manifestoStrip"
      style={{
        position: 'relative',
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        gap: 'var(--section-gap)',
        paddingBlock: statements.length ? 0 : 'var(--section-gap)',
      }}
    >
      {statements.map((text, i) => (
        <p
          key={i}
          ref={(el) => {
            lineRefs.current[i] = el
          }}
          className="tt-display"
          style={{
            maxWidth: '20ch',
            textAlign: 'center',
            fontSize: 'var(--text-manifesto)',
            lineHeight: 'var(--leading-manifesto)',
            padding: '0 var(--gutter)',
          }}
        >
          {text}
        </p>
      ))}
    </div>
  )
}
