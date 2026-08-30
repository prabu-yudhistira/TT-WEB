'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

type ServiceItem = {
  id: number
  name: string
  tagline?: string | null
  description?: string | null
  capabilities: string[]
  projectCount: number
  icon: string
}

// Simple 24×24 stroke icons (Tabler-style), drawn inline so the owner can
// pick one per service in /admin without a media upload.
const ICONS: Record<string, React.ReactNode> = {
  strategy: (
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M6.5 17.5L12 13l5.5 4.5M12 7v6" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  motion: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </>
  ),
  code: (
    <>
      <path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1.5-5.5L16 4a2.1 2.1 0 013 3L8.5 17.5 4 20zM13.5 6.5l3 3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
    </>
  ),
  camera: (
    <>
      <path d="M5 7h2l2-3h6l2 3h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </>
  ),
}

const pad3 = (n: number) => String(Math.max(0, n)).padStart(3, '0')

// Synapser-style services accordion (reverse-engineered from the reference
// site's live DOM 2026-07-16): full-bleed 4rem rows that expand on
// hover/focus/tap into a graphite panel — paper text, big project count,
// tagline, description, "/"-separated capability tags, "Explore more" link.
// Expansion is pure CSS (hover + focus-within + .open for touch); rows
// slide-reveal on first scroll into view.
export function ServicesRows({
  heading,
  archiveHref,
  services,
}: {
  heading?: string | null
  archiveHref: string
  services: ServiceItem[]
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rows = rowRefs.current.filter((el): el is HTMLDivElement => !!el)
    gsap.set(rows, { yPercent: 100 })
    const trigger = ScrollTrigger.create({
      trigger: rows[0]?.parentElement?.parentElement ?? undefined,
      start: 'top 82%',
      once: true,
      onEnter: () => gsap.to(rows, { yPercent: 0, duration: 0.7, stagger: 0.09, ease: 'power3.out' }),
    })
    return () => trigger.kill()
  }, [services])

  if (services.length === 0) return null

  return (
    <section data-block="servicesRows" style={{ paddingBlock: 'var(--section-gap)' }}>
      <div className="tt-container">
        {heading ? (
          <h2
            className="tt-display"
            style={{
              fontSize: 'clamp(2.5rem, 7vw, 5.5rem)',
              textTransform: 'uppercase',
              marginBottom: 'clamp(40px, 6vw, 96px)',
            }}
          >
            {heading}
          </h2>
        ) : null}
      </div>
      <div>
        {services.map((service, i) => {
          // Tap/keyboard-toggled expansion is driven by INLINE styles, not a
          // CSS class: inline styles bypass selector matching entirely, which
          // sidesteps a style-invalidation failure observed live 2026-07-16
          // where class-mutation didn't re-match the expanded rules. Pure-CSS
          // :hover / :focus-within (below) still handles pointer/keyboard.
          const open = openIdx === i
          return (
            <div key={service.id} style={{ overflow: 'hidden', borderBottom: '1px solid var(--line)', borderTop: i === 0 ? '1px solid var(--line)' : undefined }}>
              <div
                ref={(el) => {
                  rowRefs.current[i] = el
                }}
                className="tt-svc"
                style={open ? { backgroundColor: 'var(--fg)', color: 'var(--bg)' } : undefined}
                onClick={() => setOpenIdx(open ? null : i)}
              >
                <div
                  className="tt-container tt-svc-inner"
                  style={open ? { gridTemplateRows: '4rem 1fr' } : undefined}
                >
                  {/* header line — always visible */}
                  <div className="tt-svc-head">
                    <button
                      type="button"
                      className="tt-svc-title"
                      aria-expanded={open}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenIdx(open ? null : i)
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="1.25em"
                        height="1.25em"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        {ICONS[service.icon] ?? ICONS.spark}
                      </svg>
                      <span className="tt-display">{service.name}</span>
                    </button>
                    <span className="tt-svc-count" style={open ? { opacity: 0 } : undefined} aria-hidden>
                      {pad3(service.projectCount)}//
                    </span>
                    <Link
                      href={archiveHref}
                      className="tt-svc-explore"
                      style={open ? { display: 'inline', opacity: 1 } : undefined}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Explore more
                    </Link>
                  </div>

                  {/* expanded panel — 0fr row collapses it; 1fr reveals content-sized */}
                  <div className="tt-svc-panelwrap">
                    <div className="tt-svc-panel" style={open ? { opacity: 1 } : undefined}>
                      <div className="tt-svc-bigcount" aria-hidden>
                        <span>{pad3(service.projectCount)}</span>
                        <span className="tt-svc-bigcount-label">//projects</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {service.tagline ? <div className="tt-svc-tagline tt-display">{service.tagline}</div> : null}
                        {service.description ? <p className="tt-svc-desc">{service.description}</p> : null}
                        {service.capabilities.length ? (
                          <div className="tt-svc-tags">
                            {service.capabilities.map((cap, ci) => (
                              <span key={ci}>
                                {cap}
                                {ci < service.capabilities.length - 1 ? <span className="tt-svc-slash"> /</span> : null}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <style>{`
        .tt-svc {
          cursor: pointer;
          background-color: transparent;
          color: var(--fg);
          transition: background-color 0.3s ease, color 0.3s ease;
        }
        .tt-svc-inner {
          display: grid;
          grid-template-rows: 4rem 0fr;
          transition: grid-template-rows 0.3s ease;
        }
        .tt-svc-panelwrap { overflow: hidden; min-height: 0; }
        .tt-svc-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .tt-svc-title {
          display: flex; align-items: center; gap: clamp(0.6rem, 1.5vw, 1.1rem);
          background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
          color: inherit; font: inherit; text-align: left;
        }
        .tt-svc-title .tt-display { font-size: clamp(1.05rem, 2vw, 1.5rem); text-transform: uppercase; letter-spacing: 0.02em; }
        .tt-svc-title:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
        .tt-svc-count {
          color: var(--accent); font-variant-numeric: tabular-nums; letter-spacing: 0.08em;
          font-size: clamp(0.9rem, 1.6vw, 1.25rem);
          transition: opacity 0.25s ease;
        }
        .tt-svc-explore {
          display: none; opacity: 0; color: var(--bg); text-decoration: none;
          text-transform: uppercase; letter-spacing: 0.08em; font-size: clamp(0.85rem, 1.5vw, 1.1rem);
          transition: opacity 0.3s ease 0.1s;
        }
        .tt-svc-explore:hover { text-decoration: underline; text-underline-offset: 4px; }
        .tt-svc-panel {
          display: flex; gap: clamp(1.5rem, 4vw, 5rem); align-items: flex-start;
          opacity: 0; transition: opacity 0.2s ease 0.1s;
          padding-bottom: 1.5rem;
        }
        .tt-svc-bigcount { display: flex; flex-direction: column; line-height: 1.05; flex: none; }
        .tt-svc-bigcount > span:first-child { font-size: clamp(2.4rem, 6vw, 4.5rem); letter-spacing: 0.12em; font-variant-numeric: tabular-nums; }
        .tt-svc-bigcount-label { font-size: clamp(0.9rem, 1.8vw, 1.4rem); letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.9; }
        .tt-svc-tagline { font-size: clamp(1rem, 1.8vw, 1.4rem); text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 0.5em; }
        .tt-svc-desc { margin: 0 0 1em; font-size: clamp(0.9rem, 1.4vw, 1.05rem); line-height: 1.6; max-width: 64rem; opacity: 0.92; }
        .tt-svc-tags { display: flex; flex-wrap: wrap; gap: 0.4em 1.2em; text-transform: uppercase; letter-spacing: 0.05em; font-size: clamp(0.8rem, 1.3vw, 0.95rem); opacity: 0.8; }
        .tt-svc-slash { opacity: 0.45; }

        /* expanded state: hover (fine pointers), keyboard focus, or tap-toggled .tt-svc-open */
        @media (hover: hover) {
          .tt-svc:hover { background-color: var(--fg); color: var(--bg); }
          .tt-svc:hover .tt-svc-inner { grid-template-rows: 4rem 1fr; }
          .tt-svc:hover .tt-svc-count { opacity: 0; }
          .tt-svc:hover .tt-svc-explore { display: inline; opacity: 1; }
          .tt-svc:hover .tt-svc-panel { opacity: 1; }
        }
        /* Tap-toggled expansion is inline-styled from React (see JSX note);
           these selector rules cover pointer hover and keyboard focus only. */
        .tt-svc:focus-within { background-color: var(--fg); color: var(--bg); }
        .tt-svc:focus-within .tt-svc-inner { grid-template-rows: 4rem 1fr; }
        .tt-svc:focus-within .tt-svc-count { opacity: 0; }
        .tt-svc:focus-within .tt-svc-explore { display: inline; opacity: 1; }
        .tt-svc:focus-within .tt-svc-panel { opacity: 1; }

        @media (max-width: 639px) {
          .tt-svc-panel { flex-direction: column; gap: 1rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-svc, .tt-svc-inner, .tt-svc-count, .tt-svc-explore, .tt-svc-panel { transition: none; }
        }
      `}</style>
    </section>
  )
}
