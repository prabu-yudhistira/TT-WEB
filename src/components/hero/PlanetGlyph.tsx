import { INK_HEX, KIND_SHAPE, type PlanetShape } from '../../lib/orbit/placement'
import type { BusinessKind, PlanetInk, PlanetPattern } from '../../lib/orbit/types'

/**
 * The drawn body of a planet (concept: docs/CONCEPT-SEMESTA.md §3.5).
 *
 * Deliberately a drawing, not a render: outline only, ink on paper, no gradient
 * and no glow. Shape comes from the kind of business, fill pattern and ink come
 * from the submitter's own choices — 4 inks × 4 patterns × 7 shapes, all of
 * which still look like they came out of the same sketchbook.
 *
 * The hatch and stipple fills live in one shared <defs> at the field root
 * (`PlanetGlyphDefs`) rather than inside each glyph: forty planets each
 * carrying their own <pattern> would be forty duplicate definitions and forty
 * generated ids.
 */

const C = 12 // viewBox centre
const R = 9 // nominal body radius

const hexPoints = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 2
  return `${(C + Math.cos(a) * R).toFixed(2)},${(C + Math.sin(a) * R).toFixed(2)}`
}).join(' ')

export const PATTERN_IDS: Record<Exclude<PlanetPattern, 'plain' | 'ringed'>, string> = {
  crosshatch: 'tt-planet-hatch',
  stipple: 'tt-planet-stipple',
}

/** Render once per orbit field. Every glyph's fill points at these. */
export function PlanetGlyphDefs({ inks }: { inks: PlanetInk[] }) {
  return (
    <svg width={0} height={0} aria-hidden style={{ position: 'absolute' }}>
      <defs>
        {inks.map((ink) => (
          <pattern
            key={`hatch-${ink}`}
            id={`${PATTERN_IDS.crosshatch}-${ink}`}
            width={4}
            height={4}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line x1={0} y1={0} x2={0} y2={4} stroke={INK_HEX[ink]} strokeWidth={0.8} />
            <line x1={0} y1={0} x2={4} y2={0} stroke={INK_HEX[ink]} strokeWidth={0.8} />
          </pattern>
        ))}
        {inks.map((ink) => (
          <pattern
            key={`stipple-${ink}`}
            id={`${PATTERN_IDS.stipple}-${ink}`}
            width={3.5}
            height={3.5}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1.75} cy={1.75} r={0.7} fill={INK_HEX[ink]} />
          </pattern>
        ))}
      </defs>
    </svg>
  )
}

// A pencil line is a pencil line at any size: `non-scaling-stroke` keeps the
// outline at a constant screen weight whether the mark is a 12px planet in the
// hero or a pin scaled down inside the map's 1000-unit viewBox.
const STROKE = { vectorEffect: 'non-scaling-stroke' } as const

function Body({ shape, fill }: { shape: PlanetShape; fill: string }) {
  switch (shape) {
    case 'core':
      return (
        <>
          <circle cx={C} cy={C} r={R} fill={fill} {...STROKE} />
          <circle cx={C} cy={C} r={3} fill="currentColor" stroke="none" />
        </>
      )
    case 'diamond':
      return <polygon points={`${C},${C - R} ${C + R},${C} ${C},${C + R} ${C - R},${C}`} fill={fill} {...STROKE} />
    case 'square':
      return <rect x={C - R * 0.8} y={C - R * 0.8} width={R * 1.6} height={R * 1.6} fill={fill} {...STROKE} />
    case 'hex':
      return <polygon points={hexPoints} fill={fill} {...STROKE} />
    case 'triangle':
      return (
        <polygon
          points={`${C},${C - R} ${C + R * 0.92},${C + R * 0.72} ${C - R * 0.92},${C + R * 0.72}`}
          fill={fill}
          {...STROKE}
        />
      )
    case 'oval':
      return <ellipse cx={C} cy={C} rx={R * 1.1} ry={R * 0.72} fill={fill} {...STROKE} />
    case 'circle':
    default:
      return <circle cx={C} cy={C} r={R} fill={fill} {...STROKE} />
  }
}

/**
 * The mark itself, drawn in a 24×24 box with its centre at (12,12).
 *
 * Split out from `PlanetGlyph` so the manifesto map can drop the same mark into
 * its own <svg> as a pin. A planet and its pin being literally the same drawing
 * is the whole point — it is what ties the sky to the ground.
 */
export function PlanetMark({
  kind,
  pattern,
  ink,
}: {
  kind: BusinessKind
  pattern: PlanetPattern
  ink: PlanetInk
}) {
  const shape = KIND_SHAPE[kind]
  const color = INK_HEX[ink]
  const fill =
    pattern === 'crosshatch'
      ? `url(#${PATTERN_IDS.crosshatch}-${ink})`
      : pattern === 'stipple'
        ? `url(#${PATTERN_IDS.stipple}-${ink})`
        : 'none'

  return (
    <g style={{ color, stroke: color, strokeWidth: 1.2 }}>
      <Body shape={shape} fill={fill} />
      {/* The ring is drawn wider than the body on purpose — it is the one
          element allowed to break the silhouette, which is what makes it
          readable at 12px. */}
      {pattern === 'ringed' ? (
        <ellipse
          cx={C}
          cy={C}
          rx={R * 1.55}
          ry={R * 0.42}
          fill="none"
          transform={`rotate(-18 ${C} ${C})`}
          {...STROKE}
        />
      ) : null}
    </g>
  )
}

/** Standalone mark at a pixel size — what the hero's planets render. */
export function PlanetGlyph({
  kind,
  pattern,
  ink,
  sizePx,
}: {
  kind: BusinessKind
  pattern: PlanetPattern
  ink: PlanetInk
  sizePx: number
}) {
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ display: 'block', overflow: 'visible' }}
    >
      <PlanetMark kind={kind} pattern={pattern} ink={ink} />
    </svg>
  )
}
