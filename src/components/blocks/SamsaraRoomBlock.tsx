import { DEFAULT_SEQUENCE } from '../../lib/samsara/types'

/**
 * Section 2 — the dark room. Spec §6.7 (the DOM).
 *
 * ── What this component is, and is not ──────────────────────────────
 *
 * It is the SECTION: one `100svh` dark panel that gives the page somewhere to
 * scroll into.
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
 * ── The note, and why an empty section would be a bug ───────────────
 *
 * ⚠️ TEMPORARY (2026-09-03). The chatbox stub that used to live here was
 * removed at the owner's request; a holographic screen projected by two emitter
 * orbs replaces it, and that work will delete this note.
 *
 * The note is not decoration either. In the normal path nobody reads it — the
 * WebGL room covers the viewport and SAMSARA is the content. But the sequence
 * does not always run: reduced motion, an unavailable WebGL context, and
 * `sequenceEnabled: false` in the CMS all skip it entirely, and in every one of
 * those cases NO room is ever drawn. Without in-flow DOM this section is a
 * blank black panel a full viewport tall, on exactly the machines least able to
 * recover from it — the same shape as the defect Task 17 found.
 *
 * `samsara-reduced-motion.mjs` and `samsara-kill-switch.mjs` both assert this
 * note is on screen and in flow. Whatever replaces it must keep that promise.
 */
export function SamsaraRoomBlock({
  locale,
  bgColor = DEFAULT_SEQUENCE.ROOM.BG_COLOR,
}: {
  locale: string
  /**
   * `ROOM.BG_COLOR` from the resolved `samsara-sequence` global, so editing
   * the room's black in /admin moves the DOM behind the canvas with it.
   * Defaulted rather than required so the block still renders standalone.
   */
  bgColor?: string
}) {
  const isID = locale === 'id'
  // Hardcoded rather than a CMS field on purpose: this is scaffolding with a
  // known end date, and a throwaway should not grow admin surface the owner
  // then has to find and remove.
  const note = isID ? 'Ruang ini masih dibangun.' : 'This room is still being built.'
  const roomLabel = isID ? 'Ruang SAMSARA' : "SAMSARA's room"

  return (
    <section
      data-block="samsaraRoom"
      // The section used to be named by the chatbox's <h2>. With that gone an
      // `aria-labelledby` would dangle, so the name is inline — a <section>
      // with no accessible name is not exposed as a landmark at all.
      aria-label={roomLabel}
      style={{
        position: 'relative',
        // svh, not vh: on mobile browsers vh is the LARGEST viewport, so a
        // 100vh section sits partly behind the retracting URL bar and its
        // lower edge is cut off on first paint.
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
        // the same reason. The holographic screen will sit on this layer too —
        // do not add one then either.
        overflow: 'hidden',
      }}
    >
      <p className="tt-room-note">{note}</p>

      <style>{`
        /* Ordinary in-flow content, deliberately NOT fixed and NOT hidden.
           Nothing lifts or fades this — the sequence publishes no attribute for
           it — so it reads identically whether or not the cinematic runs. That
           is the point: see the fail-open note in the component doc above. */
        .tt-room-note {
          position: relative;
          z-index: 1;
          width: min(420px, calc(100% - var(--gutter) * 2));
          margin: clamp(72px, 12vh, 140px) 0 0 var(--gutter);
          color: rgba(246, 241, 231, 0.72);
          font-family: var(--font-body);
          font-size: var(--text-body);
          line-height: 1.4;
        }

        /* Portrait: SAMSARA parks at MOBILE_Y_FRAC 0.3 — upper-centre — and
           stands MOBILE_SIZE_FRAC 0.35 of the viewport tall, so its lower edge
           is near 47.5svh. 639px matches the engine's own split
           (window.innerWidth < 640); a different breakpoint here would put the
           note over the body on the widths in between. */
        @media (max-width: 639px) {
          .tt-room-note {
            width: calc(100% - var(--gutter) * 2);
            margin: 52svh var(--gutter) 0;
          }
        }
      `}</style>
    </section>
  )
}
