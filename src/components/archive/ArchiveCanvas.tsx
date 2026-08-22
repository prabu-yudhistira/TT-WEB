'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import Draggable from 'gsap/Draggable'
import InertiaPlugin from 'gsap/InertiaPlugin'
import Flip from 'gsap/Flip'
import { PlaceholderFrame } from '../blocks/PlaceholderFrame'

gsap.registerPlugin(Draggable, InertiaPlugin, Flip)

type WorkItem = {
  id: number
  title: string
  slug: string
  category: string
  year: number
  slot: { x: number; y: number; scale: number }
}

const CATEGORY_LABELS: Record<string, { en: string; id: string }> = {
  brand: { en: 'Brand', id: 'Merek' },
  web: { en: 'Web', id: 'Web' },
  motion: { en: 'Motion', id: 'Motion' },
  engineering: { en: 'Engineering', id: 'Teknik' },
}

/**
 * 003 Archive (spec base §1.3): desktop gets a drag-to-explore canvas with
 * inertia + elastic bounds (GSAP Draggable/InertiaPlugin); touch and
 * reduced-motion fall back to a scrollable grid with FLIP-animated filtering.
 * Keyboard: tab/arrow moves focus card-to-card, canvas auto-pans to it.
 */
export function ArchiveCanvas({
  works,
  locale,
  countTemplate,
}: {
  works: WorkItem[]
  locale: string
  countTemplate?: string | null
}) {
  // Grid by default (matches SSR, keeps the archive crawlable/no-JS-safe);
  // upgrades to the drag canvas client-side only for fine-pointer, motion-OK devices.
  const [canvasMode, setCanvasMode] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const draggableRef = useRef<Draggable | null>(null)
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null)

  useEffect(() => {
    // Canvas needs a mouse-like pointer, motion, AND room to drag around in —
    // touch, reduced-motion, or a narrow (phone/small-tablet) viewport all
    // fall back to the grid (spec §1.3: "Touch/tablet... falls back... 1-col phone").
    const evaluate = () => {
      const fine = window.matchMedia('(pointer: fine)').matches
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const wide = window.innerWidth >= 768
      setCanvasMode(fine && !reduced && wide)
    }
    evaluate()
    window.addEventListener('resize', evaluate)
    return () => window.removeEventListener('resize', evaluate)
  }, [])

  useEffect(() => {
    if (!canvasMode) return
    const viewport = viewportRef.current
    const world = worldRef.current
    if (!viewport || !world) return

    const cards = Array.from(world.querySelectorAll<HTMLElement>('[data-archive-card]'))
    if (cards.length === 0) return

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    cards.forEach((c) => {
      minX = Math.min(minX, c.offsetLeft)
      maxX = Math.max(maxX, c.offsetLeft + c.offsetWidth)
      minY = Math.min(minY, c.offsetTop)
      maxY = Math.max(maxY, c.offsetTop + c.offsetHeight)
    })
    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const pad = 140
    const bounds = { minX: -maxX - pad, maxX: vw - minX + pad, minY: -maxY - pad, maxY: vh - minY + pad }

    const [draggable] = Draggable.create(world, {
      type: 'x,y',
      inertia: true,
      bounds,
      edgeResistance: 0.6,
      dragResistance: 0.05,
    })
    draggableRef.current = draggable

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const currentY = gsap.getProperty(world, 'y') as number
      const next = gsap.utils.clamp(bounds.minY, bounds.maxY, currentY - e.deltaY)
      gsap.set(world, { y: next })
      draggable.update()
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      viewport.removeEventListener('wheel', onWheel)
      draggable.kill()
      draggableRef.current = null
    }
  }, [canvasMode, works.length])

  const panToCard = (card: HTMLElement) => {
    const viewport = viewportRef.current
    const world = worldRef.current
    const draggable = draggableRef.current
    if (!viewport || !world || !draggable) return
    const targetX = viewport.clientWidth / 2 - (card.offsetLeft + card.offsetWidth / 2)
    const targetY = viewport.clientHeight / 2 - (card.offsetTop + card.offsetHeight / 2)
    const x = gsap.utils.clamp(draggable.minX, draggable.maxX, targetX)
    const y = gsap.utils.clamp(draggable.minY, draggable.maxY, targetY)
    gsap.to(world, { x, y, duration: 0.5, ease: 'power2.out', onUpdate: () => draggable.update() })
  }

  useLayoutEffect(() => {
    if (canvasMode !== false) return
    if (flipStateRef.current) {
      Flip.from(flipStateRef.current, {
        duration: 0.4,
        ease: 'power2.out',
        absolute: true,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.3 }),
        onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.9, duration: 0.2 }),
      })
      flipStateRef.current = null
    }
  }, [filter, canvasMode])

  const handleFilter = (cat: string | null) => {
    if (canvasMode === false) {
      flipStateRef.current = Flip.getState('[data-archive-card]')
    }
    setFilter(cat)
  }

  const categories = Array.from(new Set(works.map((w) => w.category)))
  const visible = filter ? works.filter((w) => w.category === filter) : works
  const countLine = (countTemplate || '{{count}} projects in the archive').replace(
    '{{count}}',
    String(works.length),
  )
  const dragLabel = locale === 'id' ? 'Seret' : 'Drag'

  return (
    <div>
      <div className="tt-container" style={{ paddingTop: 'clamp(96px, 14vw, 160px)', paddingBottom: 24 }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: 16 }}>{countLine}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="tt-filter-chip" data-active={filter === null} onClick={() => handleFilter(null)}>
            {locale === 'id' ? 'Semua' : 'All'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className="tt-filter-chip"
              data-active={filter === cat}
              onClick={() => handleFilter(cat)}
            >
              {CATEGORY_LABELS[cat]?.[locale as 'en' | 'id'] || cat}
            </button>
          ))}
        </div>
      </div>

      {canvasMode ? (
        <div ref={viewportRef} style={{ position: 'relative', height: '70vh', overflow: 'hidden', touchAction: 'none' }}>
          <div ref={worldRef} style={{ position: 'absolute', top: '50%', left: '50%' }}>
            {works.map((work) => (
              <Link
                key={work.id}
                data-archive-card
                data-cursor={dragLabel}
                href={`/${locale}/work/${work.slug}`}
                onFocus={(e) => panToCard(e.currentTarget)}
                style={{
                  position: 'absolute',
                  left: work.slot.x,
                  top: work.slot.y,
                  width: 260,
                  transform: `scale(${work.slot.scale})`,
                  transformOrigin: 'top left',
                  opacity: filter && filter !== work.category ? 0.25 : 1,
                  transition: 'opacity 0.3s ease',
                  textDecoration: 'none',
                }}
              >
                <PlaceholderFrame label={work.category} slug={work.slug} title={work.title} />
                <p className="tt-display" style={{ marginTop: 8, fontSize: '0.9375rem', color: 'var(--fg)' }}>
                  {work.title}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="tt-container tt-archive-grid" style={{ paddingBottom: 'var(--section-gap)' }}>
          {visible.map((work) => (
            <Link key={work.id} data-archive-card href={`/${locale}/work/${work.slug}`} style={{ textDecoration: 'none' }}>
              <PlaceholderFrame label={work.category} slug={work.slug} title={work.title} />
              <p className="tt-display" style={{ marginTop: 8, fontSize: '0.9375rem', color: 'var(--fg)' }}>
                {work.title}
              </p>
            </Link>
          ))}
        </div>
      )}
      <style>{`
        .tt-filter-chip {
          padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line);
          background: transparent; color: var(--muted); font-size: 0.8125rem; cursor: pointer;
        }
        .tt-filter-chip[data-active="true"] { background: var(--fg); color: var(--bg); border-color: var(--fg); }
        .tt-archive-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: clamp(16px, 3vw, 32px); }
        @media (max-width: 640px) { .tt-archive-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
