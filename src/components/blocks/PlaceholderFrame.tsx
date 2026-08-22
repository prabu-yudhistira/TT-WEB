import { WorkMark } from '../work/WorkMark'

// Paper card for work covers, still standing in for real project photography
// (H4). Pass `slug` and `title` and it carries that project's own mark instead
// of the studio watermark — see components/work/WorkMark.tsx. Without them it
// falls back to the watermark, which is what the decorative frames want.
export function PlaceholderFrame({
  aspectRatio = '3 / 2',
  label,
  slug,
  title,
}: {
  aspectRatio?: string
  label?: string
  slug?: string
  title?: string
}) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio,
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {slug ? (
        <WorkMark slug={slug} title={title ?? ''} />
      ) : (
        <span
          aria-hidden
          className="tt-logo"
          style={{ width: '22%', aspectRatio: '1532 / 1427', opacity: 0.14 }}
        />
      )}
      {label ? (
        <span
          style={{
            position: 'absolute',
            bottom: 12,
            left: 14,
            fontSize: '0.6875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  )
}
