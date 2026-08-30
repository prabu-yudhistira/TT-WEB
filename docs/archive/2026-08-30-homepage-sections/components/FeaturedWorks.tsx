'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PlaceholderFrame } from './PlaceholderFrame'

type WorkItem = {
  id: number
  title: string
  slug: string
  category: string
  year: number
  oneLiner?: string | null
  servicesLine?: string | null
  industry?: string | null
  location?: string | null
}

const LABELS: Record<string, { desc: string; svc: string; ind: string; loc: string; view: string }> = {
  en: { desc: 'Description', svc: 'Services', ind: 'Industry', loc: 'Location', view: 'View Project' },
  id: { desc: 'Deskripsi', svc: 'Layanan', ind: 'Industri', loc: 'Lokasi', view: 'Lihat Proyek' },
}

const AUTOPLAY_MS = 4500 // slow advance (owner: "auto-play, slow movement")
const RESUME_AFTER_MS = 6500 // idle time after user interaction before autoplay resumes

// Synapser-style works carousel (reverse-engineered from the reference's
// live DOM 2026-07-16): full-bleed draggable strip of square covers — the
// centered card is full-size, neighbors shrink and dim (1s ease) — with a
// numbered //01–//04 metadata row and a giant project title below, all
// synced to the active card. Mechanism here is native horizontal scroll +
// scroll-snap (touch/keyboard/reduced-motion free) with pointer-drag and
// slow autoplay layered on top. Active-card styling is INLINE (not a CSS
// class) — same verifiability rationale as ServicesRows.
export function FeaturedWorks({
  heading,
  works,
  locale,
}: {
  heading?: string | null
  works: WorkItem[]
  locale: string
}) {
  const router = useRouter()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const lastInteractionRef = useRef(0)
  const reducedRef = useRef(false)
  const suppressClickRef = useRef(false) // set when a mouse drag ends so the release doesn't count as a card click
  const t = LABELS[locale] ?? LABELS.en

  useEffect(() => {
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const scrollToIdx = useCallback((idx: number, smooth = true) => {
    const scroller = scrollerRef.current
    const slide = slideRefs.current[idx]
    if (!scroller || !slide) return
    const left = slide.offsetLeft + slide.offsetWidth / 2 - scroller.clientWidth / 2
    scroller.scrollTo({ left, behavior: smooth && !reducedRef.current ? 'smooth' : 'auto' })
  }, [])

  // active = slide whose center is nearest the scroller's center
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => {
      const mid = scroller.scrollLeft + scroller.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      slideRefs.current.forEach((el, i) => {
        if (!el) return
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      activeRef.current = best
      setActive(best)
    }
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(measure, 90)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    measure()
    return () => {
      clearTimeout(timer)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [works])

  // slow autoplay; any interaction pauses it, resumes after idle
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || works.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const touch = () => {
      lastInteractionRef.current = Date.now()
    }
    const events: (keyof HTMLElementEventMap)[] = ['pointerdown', 'wheel', 'touchstart', 'keydown']
    events.forEach((e) => scroller.addEventListener(e, touch, { passive: true }))
    const interval = setInterval(() => {
      if (Date.now() - lastInteractionRef.current < RESUME_AFTER_MS) return
      scrollToIdx((activeRef.current + 1) % works.length)
    }, AUTOPLAY_MS)
    return () => {
      clearInterval(interval)
      events.forEach((e) => scroller.removeEventListener(e, touch))
    }
  }, [works, scrollToIdx])

  // mouse drag-to-scroll (touch scrolls natively)
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let dragging = false
    let startX = 0
    let startLeft = 0
    let moved = 0
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      dragging = true
      moved = 0
      startX = e.clientX
      startLeft = scroller.scrollLeft
      scroller.style.cursor = 'grabbing'
      scroller.style.scrollSnapType = 'none' // don't fight the drag
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - startX
      moved = Math.max(moved, Math.abs(dx))
      scroller.scrollLeft = startLeft - dx
    }
    const up = () => {
      if (!dragging) return
      dragging = false
      scroller.style.cursor = 'grab'
      scroller.style.scrollSnapType = ''
      // snap to whatever is now nearest center
      const mid = scroller.scrollLeft + scroller.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      slideRefs.current.forEach((el, i) => {
        if (!el) return
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      scrollToIdx(best)
      if (moved > 6) suppressClickRef.current = true
    }
    scroller.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      scroller.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [scrollToIdx])

  if (works.length === 0) return null
  const current = works[Math.min(active, works.length - 1)]

  return (
    <section data-block="featuredWorks" style={{ paddingBlock: 'var(--section-gap)' }}>
      <div className="tt-container">
        {heading ? (
          <h2
            className="tt-display"
            style={{
              fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
              textTransform: 'uppercase',
              marginBottom: 'clamp(24px, 4vw, 56px)',
            }}
          >
            {heading}
          </h2>
        ) : null}
      </div>

      {/* full-bleed autoplay strip */}
      <div
        ref={scrollerRef}
        className="tt-fw-strip"
        aria-label={heading ?? 'Selected works'}
        style={{ cursor: 'grab' }}
      >
        {works.map((work, i) => {
          const isActive = i === active
          return (
            <div
              key={work.id}
              ref={(el) => {
                slideRefs.current[i] = el
              }}
              className="tt-fw-slide"
            >
              <div
                className="tt-fw-frame"
                role="button"
                tabIndex={0}
                aria-label={isActive ? `${work.title} — ${t.view}` : work.title}
                aria-current={isActive || undefined}
                style={{
                  transform: isActive ? 'scale(1.7)' : 'scale(1)',
                  opacity: isActive ? 1 : 0.55,
                  zIndex: isActive ? 2 : 1,
                }}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false
                    return
                  }
                  if (isActive) router.push(`/${locale}/work/${work.slug}`)
                  else {
                    lastInteractionRef.current = Date.now()
                    scrollToIdx(i)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (isActive) router.push(`/${locale}/work/${work.slug}`)
                    else scrollToIdx(i)
                  }
                }}
              >
                <PlaceholderFrame aspectRatio="1 / 1" label={work.category} />
              </div>
            </div>
          )
        })}
      </div>

      {/* //01–//04 metadata row synced to the active card */}
      <div className="tt-container">
        <div key={`meta-${current.id}`} className="tt-fw-meta">
          <div className="tt-fw-col" style={{ maxWidth: '30ch' }}>
            <span className="tt-fw-label">{`// 01 ${t.desc}`}</span>
            <p className="tt-fw-value">{current.oneLiner}</p>
          </div>
          <div className="tt-fw-col" style={{ maxWidth: '28ch' }}>
            <span className="tt-fw-label">{`// 02 ${t.svc}`}</span>
            <p className="tt-fw-value">{current.servicesLine}</p>
          </div>
          <div className="tt-fw-col">
            <span className="tt-fw-label">{`// 03 ${t.ind}`}</span>
            <p className="tt-fw-value">{current.industry}</p>
          </div>
          <div className="tt-fw-col">
            <span className="tt-fw-label">{`// 04 ${t.loc}`}</span>
            <p className="tt-fw-value">{current.location}</p>
          </div>
          <Link href={`/${locale}/work/${current.slug}`} className="tt-fw-view">
            {t.view}
          </Link>
        </div>

        {/* giant active title */}
        <Link
          key={`title-${current.id}`}
          href={`/${locale}/work/${current.slug}`}
          className="tt-fw-bigtitle tt-display"
        >
          {current.title}
        </Link>
      </div>

      <style>{`
        .tt-fw-strip {
          display: flex;
          gap: clamp(14px, 2vw, 28px);
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          /* room for the active card's 1.7x scale so it never clips */
          padding-block: calc(clamp(150px, 19vw, 250px) * 0.38);
          padding-inline: calc(50vw - clamp(150px, 19vw, 250px) / 2);
        }
        .tt-fw-strip::-webkit-scrollbar { display: none; }
        .tt-fw-slide {
          flex: none;
          width: clamp(150px, 19vw, 250px);
          aspect-ratio: 1 / 1;
          scroll-snap-align: center;
          position: relative;
        }
        .tt-fw-frame {
          position: absolute;
          inset: 0;
          transition: transform 1s ease, opacity 1s ease;
          will-change: transform, opacity;
        }
        .tt-fw-frame:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
        .tt-fw-meta {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: clamp(16px, 3vw, 40px);
          margin-top: clamp(20px, 3.5vw, 44px);
          animation: ttFwFade 0.45s ease both;
        }
        .tt-fw-col { display: flex; flex-direction: column; gap: 0.5em; }
        .tt-fw-label {
          color: var(--accent);
          font-size: 0.8125rem;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
        .tt-fw-value { margin: 0; font-size: 0.9375rem; line-height: 1.55; color: var(--muted); }
        .tt-fw-view {
          flex: none;
          align-self: flex-start;
          padding: 0.7em 1.4em;
          border: 1px solid var(--fg);
          color: var(--fg);
          text-decoration: none;
          font-size: 0.9375rem;
          transition: background-color 0.25s ease, color 0.25s ease;
        }
        .tt-fw-view:hover { background-color: var(--fg); color: var(--bg); }
        .tt-fw-bigtitle {
          display: block;
          margin-top: clamp(20px, 4vw, 48px);
          font-size: clamp(2.6rem, 9vw, 8rem);
          line-height: 0.95;
          text-transform: uppercase;
          color: var(--fg);
          text-decoration: none;
          animation: ttFwFade 0.45s ease both;
        }
        .tt-fw-bigtitle:hover { font-style: italic; }
        @keyframes ttFwFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (max-width: 767px) {
          .tt-fw-meta { flex-wrap: wrap; }
          .tt-fw-col { flex: 1 1 40%; }
          .tt-fw-view { flex-basis: 100%; text-align: center; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-fw-frame, .tt-fw-meta, .tt-fw-bigtitle { transition: none; animation: none; }
        }
      `}</style>
    </section>
  )
}
