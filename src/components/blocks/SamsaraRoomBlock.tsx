import { DEFAULT_SEQUENCE } from '../../lib/samsara/types'

/**
 * Section 2 — the dark room. Spec §6.6 (chatbox stub) and §6.7 (the DOM).
 *
 * ── What this component is, and is not ──────────────────────────────
 *
 * It is the SECTION: one `100svh` dark panel that gives the page somewhere to
 * scroll into, and the chatbox stub as real DOM sitting on top of it.
 *
 * It is NOT the room. The room is WebGL — floor, walls, key light, fog and
 * SAMSARA itself — drawn by `MascotEngine` on the hero's canvas, which promotes
 * to `position: fixed` and covers the viewport once the sequence commits. That
 * canvas is `pointer-events: none` precisely so this section stays clickable
 * through it (see the window-level listener note in MascotEngine).
 *
 * So the background colour here is not decoration: it is what the visitor sees
 * BEHIND the WebGL layer, and a mismatch reads as a seam along the edges of the
 * canvas. It comes from the RESOLVED `samsara-sequence` global via RenderBlocks
 * — the same `ROOM.BG_COLOR` the 3D room is built from — rather than being
 * written as a hex here, because a literal would be a second copy of a value
 * the owner can edit. That is the failure mode that cost this project two
 * stale duplicates on 2026-09-01 alone.
 *
 * ⚠️ The chatbox is a STUB. Styled, positioned, labelled and reachable by
 * keyboard; the input is DISABLED and there is nothing behind it. Spec §6.6
 * builds it as real DOM now, rather than drawing it on the canvas, because it
 * will eventually carry a live-region message list and focus management and
 * none of that can be retrofitted onto WebGL later.
 */
export function SamsaraRoomBlock({
  chatHeading,
  chatPlaceholder,
  locale,
  bgColor = DEFAULT_SEQUENCE.ROOM.BG_COLOR,
}: {
  chatHeading?: string | null
  chatPlaceholder?: string | null
  locale: string
  /**
   * `ROOM.BG_COLOR` from the resolved `samsara-sequence` global, so editing
   * the room's black in /admin moves the DOM behind the canvas with it.
   * Defaulted rather than required so the block still renders standalone.
   */
  bgColor?: string
}) {
  const id = 'samsara-chat'
  const heading = chatHeading || (locale === 'id' ? 'Tanya SAMSARA' : 'Ask SAMSARA')
  // Short on purpose: the input is 358px wide in portrait, and the longer
  // sentence this replaced was cut mid-word there — which reads as a broken
  // field rather than as a promise. The owner's own text comes from the CMS.
  const placeholder = chatPlaceholder || (locale === 'id' ? 'Segera hadir…' : 'Coming soon…')

  return (
    <section
      data-block="samsaraRoom"
      aria-labelledby={`${id}-heading`}
      style={{
        position: 'relative',
        // svh, not vh: on mobile browsers vh is the LARGEST viewport, so a
        // 100vh section sits partly behind the retracting URL bar and the
        // chatbox's lower edge is cut off on first paint.
        minHeight: '100svh',
        background: bgColor,
        display: 'flex',
        alignItems: 'flex-start',
        // ⚠️ NO z-index here, and that is load-bearing rather than an omission.
        //
        // A positioned element with a numeric z-index creates a STACKING
        // CONTEXT, and every descendant is then painted inside it. This section
        // briefly carried `zIndex: 1`; the chatbox's own z-index 41 was resolved
        // within that context, so the whole thing stacked at 1 and was painted
        // UNDER the promoted canvas at 40. The box reported `position: fixed`,
        // `opacity: 1` and correct coordinates the entire time, and was simply
        // not on screen. `MascotEngine`'s demote() carries the same warning for
        // the same reason.
        overflow: 'hidden',
      }}
    >
      <div className="tt-room-chat">
        <h2 id={`${id}-heading`} className="tt-room-chat-heading">
          {heading}
        </h2>

        {/*
          ⚠️ When the message list arrives, it goes HERE and it needs
          `data-lenis-prevent`. The room is pinned with `lenis.stop()`, which
          prevents wheel events at the WINDOW — so it blocks nested overflow
          scrolling as well as the page. A list that silently refuses to scroll
          while the room is pinned is exactly the shape of bug that survives
          casual testing. Task 12 already paid for this lesson once.
        */}

        {/*
          Deliberately NOT wrapped in a <form>. There is nothing behind this
          yet, and a form with no handler submits to the current URL on Enter —
          which reloads the page and drops the visitor out of the room, reading
          as the site breaking. The form arrives with the send handler.
        */}
        <label className="tt-visually-hidden" htmlFor={`${id}-input`}>
          {heading}
        </label>
        <input
          id={`${id}-input`}
          className="tt-room-chat-input"
          type="text"
          disabled
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>

      <style>{`
        /* ── the default: ordinary content ────────────────────────────
           Deliberately NOT fixed and NOT hidden. If no sequence ever runs —
           disabled in the CMS, reduced motion, WebGL unavailable — this is a
           section the visitor scrolls to and reads. Starting from hidden would
           make every one of those cases a blank black panel. */
        .tt-room-chat {
          position: relative;
          z-index: 1;
          width: min(420px, calc(100% - var(--gutter) * 2));
          margin: clamp(72px, 12vh, 140px) 0 0 var(--gutter);
          color: #F6F1E7;
          font-family: var(--font-body);
        }

        /* ── the sequence is running ──────────────────────────────────
           The room is WebGL on a canvas promoted to position:fixed at
           z-index 40, so the box has to leave the document flow and sit above
           it or it stays a viewport below the fold for the whole cinematic —
           which is exactly what it did before this rule existed.

           The PRESENCE of the attribute lifts it; the VALUE fades it in. See
           the contract note in SamsaraSequence. */
        :root[data-tt-chatbox] .tt-room-chat {
          position: fixed;
          z-index: 41;
          top: clamp(72px, 12vh, 140px);
          left: var(--gutter);
          margin: 0;
          opacity: 0;
          transform: translateY(12px);
          /* Not clickable while invisible, and never in front of SAMSARA's own
             drag target when it is. */
          pointer-events: none;
          transition:
            opacity var(--tt-chatbox-enter, 400ms) var(--ease-out),
            transform var(--tt-chatbox-enter, 400ms) var(--ease-out);
        }
        :root[data-tt-chatbox='in'] .tt-room-chat {
          opacity: 1;
          transform: none;
          pointer-events: auto;
        }
        @media (prefers-reduced-motion: reduce) {
          :root[data-tt-chatbox] .tt-room-chat {
            transition-duration: 0.01s;
            transform: none;
          }
        }
        .tt-room-chat-heading {
          margin: 0 0 0.75em;
          font-family: var(--font-display);
          font-size: clamp(1.25rem, 2.2vw, 1.75rem);
          font-weight: 500;
          line-height: 1.15;
          letter-spacing: -0.01em;
        }
        .tt-room-chat-form { margin: 0; }
        .tt-room-chat-input {
          width: 100%;
          box-sizing: border-box;
          padding: 0.85em 1em;
          font: inherit;
          font-size: var(--text-body);
          color: #F6F1E7;
          background: rgba(246, 241, 231, 0.05);
          border: 1px solid rgba(246, 241, 231, 0.22);
          border-radius: 2px;
        }
        /* A disabled input is dimmed by the UA on top of whatever we set. At
           0.05 background on near-black that lands below 3:1 against the
           placeholder, so the opacity is pinned rather than left to default. */
        .tt-room-chat-input:disabled {
          opacity: 1;
          cursor: not-allowed;
        }
        .tt-room-chat-input::placeholder {
          color: rgba(246, 241, 231, 0.55);
          opacity: 1;
        }
        .tt-visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }

        /* Portrait: SAMSARA parks at MOBILE_Y_FRAC 0.3 — upper-centre — so the
           chatbox goes BELOW it rather than top-left. 639px matches the
           engine's own split (window.innerWidth < 640); a different breakpoint
           here would put the box over the body on the widths in between. */
        @media (max-width: 639px) {
          .tt-room-chat {
            width: calc(100% - var(--gutter) * 2);
            margin: 52svh var(--gutter) 0;
          }
          /* SAMSARA parks at MOBILE_Y_FRAC 0.3 and stands MOBILE_SIZE_FRAC 0.35
             of the viewport tall, so its lower edge is near 47.5svh. 52svh is
             that plus a margin; the gate asserts the real gap rather than
             trusting this arithmetic. */
          :root[data-tt-chatbox] .tt-room-chat {
            top: 52svh;
            right: var(--gutter);
            width: auto;
          }
        }
      `}</style>
    </section>
  )
}
