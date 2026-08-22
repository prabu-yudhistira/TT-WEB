/**
 * Per-project mark for work cards.
 *
 * Every card used to carry the same TAMPA TARUNO watermark, so five different
 * projects were indistinguishable. Each work now shows its own mark:
 *
 * - Homeslice is a real client with a real identity, so its actual wordmark is
 *   used, desaturated to graphite the way a portfolio sheet would print it. We
 *   do not invent marks for other people's brands.
 * - The rest are our own products and had no mark at all, so these are drawn
 *   here: one continuous graphite line, one red-pencil accent carrying the
 *   thing that project is actually about, struck over the faint construction
 *   circle an empu would lay down first. Same grid, same weight, same hand —
 *   sheets out of one sketchbook.
 *
 * Unknown slugs fall back to the studio watermark, which is the old behaviour.
 */

const VB = 100
const STROKE = 3.2

type MarkProps = { title: string }

/** Faint layout circle under every drawn mark — the first line of the sketch. */
function Construction() {
  return <circle cx="50" cy="50" r="34" fill="none" stroke="var(--line)" strokeWidth="1" />
}

const DRAWN: Record<string, (p: MarkProps) => React.ReactElement> = {
  // Multi-tenant data layer: stacked plates, one struck in red — a single
  // business's database, walled off from the others by row-level security.
  'business-os': () => (
    <>
      <Construction />
      <g fill="none" stroke="var(--fg)" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="50" cy="30" rx="26" ry="9" />
        <path d="M24 30v12c0 5 11.6 9 26 9s26-4 26-9V30" />
        <path d="M24 51v12c0 5 11.6 9 26 9s26-4 26-9V51" />
      </g>
      <g fill="none" stroke="var(--accent)" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 63v7c0 5 11.6 9 26 9s26-4 26-9v-7" />
      </g>
    </>
  ),

  // Their own favicon mark redrawn in pencil: the samsara loop, one unbroken
  // line. The red dot is a node on the map — each one runs an agent.
  'samsara-atelier': () => (
    <>
      <Construction />
      <path
        d="M32 34c-9 0-15 7-15 16s6 16 15 16c8 0 12-6 18-16s10-16 18-16 15 7 15 16-6 16-15 16c-8 0-12-6-18-16"
        fill="none"
        stroke="var(--fg)"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <circle cx="68" cy="34" r="4.6" fill="var(--accent)" />
    </>
  ),

  // Same loop, boxed: this one runs on one machine and asks before it acts.
  // The red gate sits on the way out of the box.
  'samsara-second-brain': () => (
    <>
      <Construction />
      <g fill="none" stroke="var(--fg)" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <rect x="17" y="21" width="66" height="58" rx="8" />
        <path d="M38 43c-5.5 0-9 4-9 9s3.5 9 9 9c5 0 7.5-3.5 11.5-9s6.5-9 11.5-9 9 4 9 9-3.5 9-9 9c-5 0-7.5-3.5-11.5-9" />
      </g>
      <path d="M50 79v9" fill="none" stroke="var(--accent)" strokeWidth={STROKE} strokeLinecap="round" />
      <circle cx="50" cy="92" r="4.2" fill="none" stroke="var(--accent)" strokeWidth={STROKE} />
    </>
  ),

  // Ingest funnel: many sources converge into one backend. The red rule across
  // the throat is the architecture boundary CI refuses to let anything cross.
  agencyai: () => (
    <>
      <Construction />
      <g fill="none" stroke="var(--fg)" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20h64L57 50v26l-14 8V50z" />
        <path d="M18 20h64" />
      </g>
      <path d="M30 44h40" fill="none" stroke="var(--accent)" strokeWidth={STROKE} strokeLinecap="round" />
    </>
  ),
}

/** Real client identities, used as-is rather than reinvented. */
const CLIENT_LOGO: Record<string, { src: string; alt: string }> = {
  homeslice: { src: '/media/work/homeslice.png', alt: 'Homeslice' },
}

export function WorkMark({ slug, title }: { slug: string; title: string }) {
  const client = CLIENT_LOGO[slug]
  if (client) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={client.src}
        alt=""
        aria-hidden
        style={{
          width: '62%',
          height: 'auto',
          objectFit: 'contain',
          // graphite-plate treatment, so a client's own colours don't fight the
          // drawn marks sitting next to them on the same row
          filter: 'grayscale(1) contrast(0.85) brightness(0.75)',
          opacity: 0.62,
        }}
      />
    )
  }

  const Drawn = DRAWN[slug]
  if (!Drawn) {
    // Unknown work — studio watermark, same as before this component existed.
    return (
      <span aria-hidden className="tt-logo" style={{ width: '22%', aspectRatio: '1532 / 1427', opacity: 0.14 }} />
    )
  }

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VB} ${VB}`}
      style={{ width: '44%', height: 'auto', opacity: 0.72, overflow: 'visible' }}
    >
      <title>{title}</title>
      <Drawn title={title} />
    </svg>
  )
}
