import { INK_HEX, KIND_MERIDIANS } from '../../lib/orbit/placement'
import type { BusinessKind, PlanetInk, PlanetPattern } from '../../lib/orbit/types'

/**
 * A planet drawn as a sketched globe (docs/CONCEPT-SEMESTA.md §3.2).
 *
 * CSS 3D, not WebGL — deliberately. The hero already has one component that
 * vanishes without a GPU; making forty more of them would mean an empty sky on
 * every machine with hardware acceleration switched off. Nested spans with
 * `transform-style: preserve-3d` need no context at all, and the planets stay
 * real DOM nodes, so hover, links and screen-reader names survive.
 *
 * No `perspective` on purpose. A circle rotated about Y with no perspective
 * projects to an ellipse of width cos(θ) — which IS the orthographic projection
 * of a meridian on a sphere. For a body twenty pixels across, orthographic is
 * both correct and cheaper than the alternative.
 *
 * The volume comes from pencil hatching with a fixed light source at the upper
 * left, masked to a crescent. That, and not the wireframe, is what makes it
 * read as a ball rather than a spinning hoop.
 *
 * All styling lives in OrbitField's stylesheet: forty copies of the same
 * <style> block is forty times the CSS for one drawing.
 */
export function PlanetSphere({
  kind,
  pattern,
  ink,
  sizePx,
  spinSeconds,
  tiltDeg,
}: {
  kind: BusinessKind
  pattern: PlanetPattern
  ink: PlanetInk
  sizePx: number
  spinSeconds: number
  tiltDeg: number
}) {
  const meridians = KIND_MERIDIANS[kind]
  return (
    <span
      className="tt-globe"
      style={
        {
          width: sizePx,
          height: sizePx,
          color: INK_HEX[ink],
          '--tt-spin': `${spinSeconds.toFixed(2)}s`,
          '--tt-tilt': `${tiltDeg.toFixed(1)}deg`,
        } as React.CSSProperties
      }
    >
      <span className="tt-globe-tilt">
        <span className="tt-globe-spin">
          {Array.from({ length: meridians }, (_, i) => (
            <span
              key={i}
              className="tt-globe-meridian"
              style={{ transform: `rotateY(${(i * 180) / meridians}deg)` }}
            />
          ))}
          <span className="tt-globe-parallel" />
          {/* The old `ringed` option: rings now belong to the logo, so on a
              planet it becomes an equatorial belt instead of a second Saturn. */}
          {pattern === 'ringed' ? <span className="tt-globe-belt" /> : null}
        </span>
      </span>
      <span className="tt-globe-edge" />
      {pattern === 'crosshatch' || pattern === 'stipple' ? (
        <span className={`tt-globe-shade tt-globe-shade--${pattern}`} />
      ) : null}
    </span>
  )
}
