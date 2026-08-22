/**
 * The studio's vocabulary band (docs/CONCEPT-SEMESTA.md §3.8).
 *
 * These words used to drift around the hero logo on pencil strings. Planets
 * took that space, and mixing the studio's own words with other people's
 * business names would have muddied both — so the words moved here, to the
 * page where the studio is the one talking.
 *
 * A band rather than scattered absolute positions: it wraps, so nothing is
 * truncated on a phone, and it survives a locale swap where an absolute layout
 * tuned to English word widths would not. No client JS — the drift is a CSS
 * keyframe with a deterministic per-word delay.
 */
export function MarginNotes({ words, eyebrow }: { words: string[]; eyebrow: string }) {
  if (words.length === 0) return null

  return (
    <section className="tt-container tt-notes">
      <p className="tt-notes-eyebrow">{eyebrow}</p>
      <ul className="tt-notes-list">
        {words.map((word, i) => (
          <li
            key={`${i}-${word}`}
            className="tt-notes-word"
            // Deterministic offsets: the band should look scattered, not
            // animated in unison, and it must render the same on every load.
            style={{ animationDelay: `${(i % 7) * 0.9}s`, animationDuration: `${7 + (i % 5)}s` }}
          >
            {word}
          </li>
        ))}
      </ul>

      <style>{`
        .tt-notes { padding-block: clamp(56px, 9vw, 120px); }
        .tt-notes-eyebrow {
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1.25em;
        }
        .tt-notes-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: clamp(14px, 2.4vw, 34px);
          border-top: 1px solid var(--line);
          padding-top: clamp(24px, 3.5vw, 44px);
        }
        .tt-notes-word {
          font-style: italic;
          font-size: clamp(1rem, 1.8vw, 1.5rem);
          color: var(--muted);
          animation-name: ttNoteDrift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          animation-direction: alternate;
        }
        .tt-notes-word + .tt-notes-word::before {
          content: '·';
          margin-right: clamp(14px, 2.4vw, 34px);
          color: var(--line);
        }
        @keyframes ttNoteDrift {
          from { transform: translateY(-2px); }
          to { transform: translateY(3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-notes-word { animation: none; }
        }
      `}</style>
    </section>
  )
}
