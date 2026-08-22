import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getManifesto, getPlanets, getSettings } from '../../../../lib/cms'
import { isLocale } from '../../../../lib/i18n'
import { getAlternates } from '../../../../lib/i18n'
import { ManifestoStrip } from '../../../../components/blocks/ManifestoStrip'
import { MarginNotes } from '../../../../components/blocks/MarginNotes'
import { WorldMap } from '../../../../components/blocks/WorldMap'
import { manifesto } from '../../../../lib/manifestoContent'

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: getAlternates('/manifesto'), title: 'Manifesto' }
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: '0.75rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
        marginBottom: '1.25em',
      }}
    >
      {children}
    </p>
  )
}

// 002 Manifesto (spec base §1.1): the poetic statement sequence gets its own
// destination, then the page answers the three questions the sequence raises —
// what the name means, how the work is actually done, and who does it.
export default async function ManifestoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const l = locale as 'en' | 'id'

  const [statements, settings, planets] = await Promise.all([
    getManifesto(locale),
    getSettings(locale),
    getPlanets(),
  ])

  const facts = [
    { label: l === 'id' ? 'Didirikan' : 'Founded', value: '2026' },
    { label: l === 'id' ? 'Berbasis di' : 'Based in', value: settings.locationLine || 'Surakarta, ID' },
    { label: l === 'id' ? 'Fokus' : 'Focus', value: l === 'id' ? 'Klinik & UKM' : 'Clinics & SMEs' },
  ]

  return (
    <div>
      <ManifestoStrip statements={statements.map((s) => s.text)} />

      {/* The name — the brand's whole argument is inside its own two words, so
          they get the page's largest type and the gloss sits in the margin. */}
      <section className="tt-container tt-mf-section">
        <Eyebrow>{manifesto.name.eyebrow[l]}</Eyebrow>
        <dl className="tt-mf-name">
          {manifesto.name.parts.map((p) => (
            <div key={p.word} className="tt-mf-name-row">
              <dt className="tt-display tt-mf-word">{p.word}</dt>
              <dd className="tt-mf-gloss">{p.gloss[l]}</dd>
            </div>
          ))}
        </dl>
        <p className="tt-mf-body">{manifesto.name.body[l]}</p>
      </section>

      <section className="tt-container tt-mf-section">
        <Eyebrow>{manifesto.philosophy.eyebrow[l]}</Eyebrow>
        <p className="tt-display tt-mf-lead">{manifesto.philosophy.lead[l]}</p>
        <p className="tt-mf-body">{manifesto.philosophy.body[l]}</p>
      </section>

      {/* Values are a set, not a sequence — no numbering, just term and what it
          costs us in practice. */}
      <section className="tt-container tt-mf-section">
        <Eyebrow>{manifesto.values.eyebrow[l]}</Eyebrow>
        <dl className="tt-mf-values">
          {manifesto.values.items.map((v) => (
            <div key={v.term.en} className="tt-mf-value">
              <dt className="tt-display tt-mf-term">{v.term[l]}</dt>
              <dd className="tt-mf-meaning">{v.meaning[l]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Answers the question the hero now raises: what are those planets? */}
      <section className="tt-container tt-mf-section">
        <Eyebrow>{manifesto.semesta.eyebrow[l]}</Eyebrow>
        <p className="tt-display tt-mf-lead">{manifesto.semesta.lead[l]}</p>
        <p className="tt-mf-body">{manifesto.semesta.body[l]}</p>
      </section>

      {/* Same planets as the hero, put back where they actually are. */}
      <WorldMap
        planets={planets}
        locale={l}
        eyebrow={manifesto.map.eyebrow[l]}
        lead={manifesto.map.lead[l]}
        empty={manifesto.map.empty[l]}
        listHeading={manifesto.map.listHeading[l]}
        overflow={manifesto.map.overflow[l]}
      />

      {/* The hero's old margin notes live here now — see the component. */}
      <MarginNotes
        words={(settings.marginNotes || [])
          .map((w) => w.word)
          .filter((w): w is string => Boolean(w))}
        eyebrow={l === 'id' ? 'Kosakata' : 'Vocabulary'}
      />

      <section className="tt-container tt-mf-section">
        <Eyebrow>{manifesto.founders.eyebrow[l]}</Eyebrow>
        <p className="tt-mf-body tt-mf-body-wide">{manifesto.founders.body[l]}</p>
      </section>

      <section className="tt-container" style={{ paddingBottom: 'var(--section-gap)' }}>
        <div className="tt-mf-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <p
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}
              >
                {f.label}
              </p>
              <p className="tt-display" style={{ fontSize: 'clamp(1.25rem, 2.4vw, 1.75rem)', marginTop: '0.3em' }}>
                {f.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .tt-mf-section { padding-block: clamp(56px, 9vw, 120px); }
        .tt-mf-section + .tt-mf-section { padding-top: 0; }

        /* Both glosses hang off one line. The word column measures itself to the
           longest word via subgrid, so it survives a locale swap — a fixed width
           here collides with "Taruno" in Indonesian. Without subgrid support the
           rows collapse to the stacked mobile layout, which is fine. */
        .tt-mf-name {
          margin: 0;
          display: grid;
          grid-template-columns: max-content minmax(0, 1fr);
          column-gap: clamp(16px, 3vw, 40px);
        }
        .tt-mf-name-row {
          display: grid;
          grid-column: 1 / -1;
          grid-template-columns: subgrid;
          align-items: baseline;
          padding-block: clamp(6px, 1vw, 14px);
          border-bottom: 1px solid var(--line);
        }
        .tt-mf-word {
          margin: 0;
          font-size: clamp(2.5rem, 9vw, 6.5rem);
          line-height: var(--leading-display);
        }
        .tt-mf-gloss {
          margin: 0;
          color: var(--accent);
          font-size: clamp(0.9375rem, 1.6vw, 1.25rem);
          font-style: italic;
        }

        .tt-mf-lead {
          margin: 0 0 0.6em;
          font-size: var(--text-manifesto);
          line-height: var(--leading-manifesto);
        }
        .tt-mf-body {
          margin: 1.4em 0 0;
          max-width: 62ch;
          font-size: var(--text-body);
          line-height: var(--leading-body);
          color: var(--fg);
        }
        .tt-mf-body-wide { max-width: 52ch; }

        .tt-mf-values { margin: 0; display: grid; gap: 0; }
        .tt-mf-value {
          display: grid;
          grid-template-columns: minmax(0, 10rem) minmax(0, 1fr);
          gap: clamp(16px, 4vw, 56px);
          padding-block: clamp(18px, 2.4vw, 30px);
          border-top: 1px solid var(--line);
        }
        .tt-mf-value:last-child { border-bottom: 1px solid var(--line); }
        .tt-mf-term { margin: 0; font-size: clamp(1.125rem, 2vw, 1.5rem); }
        .tt-mf-meaning {
          margin: 0;
          max-width: 54ch;
          font-size: var(--text-body);
          line-height: var(--leading-body);
          color: var(--muted);
        }

        .tt-mf-facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: clamp(24px, 4vw, 56px);
          border-top: 1px solid var(--line);
          padding-top: clamp(32px, 5vw, 64px);
        }

        @media (max-width: 639px) {
          .tt-mf-name-row { grid-template-columns: 1fr; row-gap: 2px; }
          .tt-mf-value { grid-template-columns: 1fr; gap: 8px; }
        }
      `}</style>
    </div>
  )
}
