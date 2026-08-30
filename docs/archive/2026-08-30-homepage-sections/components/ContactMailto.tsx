'use client'

import { useEffect, useRef, useState } from 'react'
import { useMagneticHover } from '../../lib/useMagneticHover'

// Oversized "Email Us" mailto with magnetic hover + a live local-time readout
// (spec base §1.2/§3.10). Confidence through simplicity — no form circus.
export function ContactMailto({
  heading,
  email,
  locationLine,
  timezone,
}: {
  heading?: string | null
  email?: string | null
  locationLine?: string | null
  timezone?: string | null
}) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [time, setTime] = useState('')

  useEffect(() => {
    if (!timezone) return
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
    const update = () => setTime(fmt.format(new Date()))
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [timezone])

  useMagneticHover(linkRef)

  if (!email) return null

  return (
    <section data-block="contactMailto" style={{ paddingBlock: 'var(--section-gap)' }}>
      <div className="tt-container" style={{ textAlign: 'center' }}>
        {heading ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--muted)', marginBottom: '0.75em' }}>{heading}</p>
        ) : null}
        <a
          ref={linkRef}
          href={`mailto:${email}`}
          className="tt-display"
          style={{
            display: 'inline-block',
            fontSize: 'clamp(2rem, 6.5vw, 5.5rem)',
            color: 'var(--fg)',
            textDecoration: 'underline',
            textDecorationColor: 'var(--accent)',
            textUnderlineOffset: '0.12em',
          }}
        >
          Email Us
        </a>
        {(locationLine || time) && (
          <p style={{ marginTop: '1.5em', fontSize: '0.875rem', color: 'var(--muted)' }}>
            {locationLine}
            {locationLine && time ? ' · ' : ''}
            {time}
          </p>
        )}
      </div>
    </section>
  )
}
