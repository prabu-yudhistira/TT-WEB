'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(ScrambleTextPlugin)

// Giant link, char-scramble on hover, to the drag-canvas archive (spec base
// §1.2/§3.6). Count line template comes from CMS, e.g. "{{count}} projects...".
export function ArchiveTeaser({
  countTemplate,
  count,
  locale,
}: {
  countTemplate?: string | null
  count: number
  locale: string
}) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const original = 'Archive →'

  const scramble = (to: string) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (linkRef.current) linkRef.current.textContent = to
      return
    }
    gsap.to(linkRef.current, { duration: 0.5, scrambleText: { text: to, chars: 'upperAndLowerCase', speed: 0.6 } })
  }

  const countLine = (countTemplate || '{{count}} projects in the archive').replace('{{count}}', String(count))

  return (
    <section data-block="archiveTeaser" style={{ paddingBlock: 'var(--section-gap)' }}>
      <div className="tt-container" style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '0.75em' }}>{countLine}</p>
        <Link
          ref={linkRef}
          href={`/${locale}/archive`}
          className="tt-display"
          onMouseEnter={() => scramble('Explore all →')}
          onMouseLeave={() => scramble(original)}
          style={{
            display: 'inline-block',
            fontSize: 'clamp(2.5rem, 7vw, 6rem)',
            color: 'var(--fg)',
            textDecoration: 'none',
          }}
        >
          {original}
        </Link>
      </div>
    </section>
  )
}
