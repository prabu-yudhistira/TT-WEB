import { PlanetGlyph, PlanetGlyphDefs } from '../hero/PlanetGlyph'
import { INDONESIA_OUTLINE } from '../../lib/map/indonesiaOutline'
import { MAP_HEIGHT, MAP_VIEW, graticule, inView, project } from '../../lib/map/projection'
import { HERO_PLANET_LIMIT, SIZE_PX } from '../../lib/orbit/placement'
import { KIND_LABEL } from '../../lib/orbit/labels'
import type { Planet, PlanetInk } from '../../lib/orbit/types'

/**
 * The planets, put back on the ground (concept: docs/CONCEPT-SEMESTA.md §5.1).
 *
 * Drawn, not tiled: one SVG of coastline and graticule, no map service, no API
 * key, no request leaving the page. A photographic basemap would fight the
 * paper everywhere else on the site, and would cost a third-party dependency
 * for a picture that never moves.
 *
 * Pins are HTML positioned in percentages over the SVG rather than <text> and
 * <use> inside it. Inside the viewBox every label would scale with the map, so
 * a name legible on a laptop would be four pixels tall on a phone. In HTML the
 * mark scales and the type does not.
 *
 * The list underneath is not a courtesy: an SVG of dots cannot be read by a
 * screen reader, and it is also where the planets live that the hero cannot
 * carry (it shows a rotating 40).
 */

const PIN_SCALE = 0.75
/** Pixels a pin steps off centre when several businesses share one city. */
const DODGE_PX = 10

export function WorldMap({
  planets,
  locale,
  eyebrow,
  lead,
  empty,
  listHeading,
  overflow,
}: {
  planets: Planet[]
  locale: 'en' | 'id'
  eyebrow: string
  lead: string
  empty: string
  listHeading: string
  /** Shown only past the hero's capacity; contains a {{limit}} placeholder. */
  overflow: string
}) {
  const inks = Array.from(new Set(planets.map((p) => p.ink))) as PlanetInk[]
  const { meridians, parallels } = graticule()

  const plotted = planets.filter(
    (p): p is Planet & { lat: number; lng: number } =>
      p.lat != null && p.lng != null && inView(p.lat, p.lng),
  )

  // Two businesses in one city would otherwise stack into a single dot.
  const byCoord = new Map<string, (Planet & { lat: number; lng: number })[]>()
  for (const p of plotted) {
    const key = `${p.lat},${p.lng}`
    const list = byCoord.get(key)
    if (list) list.push(p)
    else byCoord.set(key, [p])
  }

  const byCity = new Map<string, Planet[]>()
  for (const p of planets) {
    const key = p.city || '—'
    const list = byCity.get(key)
    if (list) list.push(p)
    else byCity.set(key, [p])
  }
  const cities = [...byCity.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <section className="tt-container tt-map">
      <p className="tt-map-eyebrow">{eyebrow}</p>
      <p className="tt-display tt-map-lead">{lead}</p>

      {planets.length === 0 ? (
        <p className="tt-map-empty">{empty}</p>
      ) : (
        <>
          <div className="tt-map-frame">
            <svg
              viewBox={`0 0 ${MAP_VIEW.width} ${MAP_HEIGHT}`}
              className="tt-map-svg"
              aria-hidden
              preserveAspectRatio="xMidYMid meet"
            >
              <g className="tt-map-grid">
                {meridians.map((lon) => {
                  const a = project(MAP_VIEW.latMax, lon)
                  const b = project(MAP_VIEW.latMin, lon)
                  return <line key={`m${lon}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                })}
                {parallels.map((lat) => {
                  const a = project(lat, MAP_VIEW.lonMin)
                  const b = project(lat, MAP_VIEW.lonMax)
                  return (
                    <line
                      key={`p${lat}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      // The equator earns a slightly firmer line — it is the one
                      // parallel that means something here.
                      className={lat === 0 ? 'tt-map-equator' : undefined}
                    />
                  )
                })}
              </g>
              <g className="tt-map-coast">
                {INDONESIA_OUTLINE.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
            </svg>

            <PlanetGlyphDefs inks={inks} />

            {[...byCoord.values()].map((group) =>
              group.map((p, i) => {
                const point = project(p.lat, p.lng)
                const angle = (i / group.length) * Math.PI * 2
                const dx = group.length > 1 ? Math.cos(angle) * DODGE_PX : 0
                const dy = group.length > 1 ? Math.sin(angle) * DODGE_PX : 0
                const size = Math.round(SIZE_PX[p.size] * PIN_SCALE)
                return (
                  <span
                    key={p.id}
                    className="tt-pin"
                    style={{
                      left: `${(point.x / MAP_VIEW.width) * 100}%`,
                      top: `${(point.y / MAP_HEIGHT) * 100}%`,
                      transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
                    }}
                  >
                    <PlanetGlyph kind={p.kind} pattern={p.pattern} ink={p.ink} sizePx={size} />
                    <span className="tt-pin-label">
                      <span className="tt-pin-name">{p.name}</span>
                      <span className="tt-pin-meta">{p.city}</span>
                    </span>
                  </span>
                )
              }),
            )}
          </div>

          <h2 className="tt-map-list-heading">{listHeading}</h2>
          {planets.length > HERO_PLANET_LIMIT ? (
            <p className="tt-map-overflow">
              {overflow.replace('{{limit}}', String(HERO_PLANET_LIMIT))}
            </p>
          ) : null}
          <dl className="tt-map-list">
            {cities.map(([city, list]) => (
              <div key={city} className="tt-map-city">
                <dt className="tt-map-city-name">{city}</dt>
                <dd className="tt-map-city-businesses">
                  <ul>
                    {list.map((p) => (
                      <li key={p.id}>
                        <PlanetGlyph
                          kind={p.kind}
                          pattern={p.pattern}
                          ink={p.ink}
                          sizePx={14}
                        />
                        {p.website ? (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="nofollow ugc noopener noreferrer"
                          >
                            {p.name}
                          </a>
                        ) : (
                          <span>{p.name}</span>
                        )}
                        <span className="tt-map-kind">
                          {KIND_LABEL[p.kind][locale]}
                          {p.foundedYear ? ` · ${p.foundedYear}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <style>{`
        .tt-map { padding-block: clamp(56px, 9vw, 120px); }
        .tt-map-eyebrow {
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1.25em;
        }
        .tt-map-lead {
          margin: 0 0 1.2em;
          font-size: var(--text-manifesto);
          line-height: var(--leading-manifesto);
        }
        .tt-map-empty {
          margin: 0;
          max-width: 54ch;
          font-size: var(--text-body);
          line-height: var(--leading-body);
          color: var(--muted);
        }

        .tt-map-frame { position: relative; width: 100%; }
        .tt-map-svg { display: block; width: 100%; height: auto; overflow: visible; }
        .tt-map-grid line { stroke: var(--line); stroke-width: 0.6; vector-effect: non-scaling-stroke; }
        .tt-map-grid .tt-map-equator { stroke-width: 1; stroke-dasharray: 6 5; }
        .tt-map-coast path {
          fill: none;
          stroke: var(--muted);
          stroke-width: 1.1;
          stroke-linejoin: round;
          vector-effect: non-scaling-stroke;
        }

        .tt-pin {
          position: absolute;
          /* The mark is small; the hit area must not be. No negative margin to
             compensate: left/top place the MARGIN edge, so a -7px margin drags
             the pin 7px north-west of the coordinate it is meant to mark. The
             translate below does the centring on its own. */
          padding: 7px;
          line-height: 0;
        }
        .tt-pin-label {
          position: absolute;
          left: 50%;
          bottom: calc(100% - 2px);
          transform: translateX(-50%);
          display: grid;
          justify-items: center;
          gap: 1px;
          white-space: nowrap;
          line-height: 1.2;
          opacity: 0;
          transition: opacity 0.18s ease;
          pointer-events: none;
        }
        .tt-pin:hover .tt-pin-label,
        .tt-pin:focus-within .tt-pin-label { opacity: 1; }
        .tt-pin:hover { z-index: 2; }
        .tt-pin-name { font-size: 0.8125rem; font-style: italic; color: var(--fg); }
        .tt-pin-meta { font-size: 0.625rem; letter-spacing: 0.04em; color: var(--muted); }

        .tt-map-list-heading {
          margin: clamp(40px, 6vw, 72px) 0 0;
          font-size: 0.75rem;
          font-weight: inherit;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .tt-map-overflow {
          margin: 0.9em 0 0;
          max-width: 54ch;
          font-size: var(--text-body);
          line-height: var(--leading-body);
          color: var(--muted);
        }
        .tt-map-list { margin: 1.5em 0 0; display: grid; gap: 0; }
        .tt-map-city {
          display: grid;
          grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
          gap: clamp(16px, 4vw, 56px);
          padding-block: clamp(14px, 2vw, 22px);
          border-top: 1px solid var(--line);
        }
        .tt-map-city:last-child { border-bottom: 1px solid var(--line); }
        .tt-map-city-name { font-size: var(--text-body); color: var(--fg); }
        .tt-map-city-businesses { margin: 0; }
        .tt-map-city-businesses ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
        .tt-map-city-businesses li {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: var(--text-body);
        }
        .tt-map-city-businesses a { color: var(--fg); text-decoration: underline; text-underline-offset: 3px; }
        .tt-map-kind { color: var(--muted); font-size: 0.8125rem; }

        @media (max-width: 639px) {
          .tt-map-city { grid-template-columns: 1fr; gap: 8px; }
          .tt-pin-name { font-size: 0.75rem; }
          /* Java's cities are barely a degree apart, which on a 340px-wide map
             is about ten pixels. The pins are not moved apart to compensate —
             that would put businesses in the wrong place to make a picture
             tidier — they are drawn smaller, so a crowd still reads as several
             marks. The list below is where the crowd is actually resolved. */
          .tt-pin svg { transform: scale(0.7); }
        }
      `}</style>
    </section>
  )
}
