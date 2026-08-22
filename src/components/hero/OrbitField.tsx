'use client'

import { useEffect, useRef, useState } from 'react'
import { CALIB, videoCoverScale } from '../../lib/three/calibration'
import {
  MOBILE_PLANES,
  PLANES,
  RING_ARC,
  RING_BANDS,
  orbitPoint,
  phaseAt,
  type OrbitPlane,
} from '../../lib/orbit/planes'
import {
  HERO_PLANET_LIMIT,
  HERO_PLANET_LIMIT_MOBILE,
  INK_HEX,
  SIZE_PX,
  TRAIL_SAMPLES,
  axialTilt,
  dailySubset,
  depthAlpha,
  depthScale,
  hash32,
  phaseFor,
  planeFor,
  radiusFactor,
  spinSeconds,
} from '../../lib/orbit/placement'
import type { Planet } from '../../lib/orbit/types'
import { PlanetSphere } from './PlanetSphere'

/**
 * The hero's orbit system (concept: docs/CONCEPT-SEMESTA.md §3).
 *
 * Replaces the constellation word field. The mechanics it inherits are
 * deliberate, not accidental: ONE requestAnimationFrame loop, one 2D canvas,
 * and DOM nodes moved by writing `transform` imperatively — React renders the
 * planets once and never again.
 *
 * What is new is the split of duties. Planets are real DOM elements (<a> when
 * the business has a site, <button> when it does not) so hover, tap, keyboard
 * focus and screen-reader naming all come free — a canvas-drawn planet would
 * need every one of those rebuilt by hand. Trails and the orbit guide ellipses
 * are canvas, because they are thousands of faint segments and nothing needs to
 * interact with them.
 */

const LOGO_ASPECT = 1532 / 1427 // from _ASSETS/logo/logo-bbox.json
const LOGO_PAD = 8

/** Trail sample cadence. Sampling every frame makes even a "long" trail short. */
const SAMPLE_MS = 45
const ENTRANCE_MS = 1400
/**
 * Ink weights. The first pass drew these at 0.13/0.5 alpha and sub-pixel widths
 * on the theory that a pencil guide should whisper — on warm paper at a real
 * viewing distance the owner could not see them at all. Graphite on paper has
 * more bite than that.
 */
const GUIDE_ALPHA = 0.3
const GUIDE_WIDTH = 0.9
const TRAIL_ALPHA = 0.85
const TRAIL_WIDTH = 1.1
/** Everything but the hovered planet keeps moving, at this fraction of speed. */
const HOVER_SLOW = 0.45
const TRAIL_CHUNKS = 8

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

type PlanetState = {
  el: HTMLElement
  planet: Planet
  planeDesktop: OrbitPlane
  planeMobile: OrbitPlane
  plane: OrbitPlane
  phase0: number
  rf: number
  /** Ring buffer of past positions — the trail. `sd` is each sample's depth, so
   *  a trail crossing the logo can be split between the two canvases. */
  sx: Float32Array
  sy: Float32Array
  sd: Float32Array
  cap: number
  head: number
  count: number
  /** Orbit time in ms. Frozen while this planet is held, hence not `now`. */
  clock: number
  lastSampleAt: number
  visible: boolean
}

export function OrbitField({
  planets,
  enabled,
  active,
  label,
}: {
  planets: Planet[]
  enabled: boolean
  /** Turns true at the ignition cue, same handoff the words used to wait for. */
  active: boolean
  /** Accessible name for the whole field. */
  label: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  // Two canvases, not one: the ring bands and the trails have to pass BEHIND
  // the logo on the far half of every orbit and IN FRONT on the near half. A
  // single layer can only ever do one of those, and a ring that never crosses
  // in front is not a ring — it is a line drawn around something.
  const farRef = useRef<HTMLCanvasElement>(null)
  const nearRef = useRef<HTMLCanvasElement>(null)
  const planetRefs = useRef<(HTMLElement | null)[]>([])
  const activeRef = useRef(active)
  const [reduced, setReduced] = useState(false)

  const ids = planets.map((p) => p.id).join(',')

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    if (!enabled || planets.length === 0) return
    const root = rootRef.current
    const farCanvas = farRef.current
    const nearCanvas = nearRef.current
    const section = root?.parentElement
    if (!root || !farCanvas || !nearCanvas || !section) return
    const far = farCanvas.getContext('2d')
    const near = nearCanvas.getContext('2d')
    if (!far || !near) return
    const layers = [far, near]

    let W = 0
    let H = 0
    let R = 0
    let cx = 0
    let cy = 0
    let mobile = false

    // Relative age only means something across the whole set, so the band is
    // computed once from every planet that declared a year.
    const years = planets
      .map((p) => p.foundedYear)
      .filter((y): y is number => typeof y === 'number')
    const minYear = years.length ? Math.min(...years) : 0
    const maxYear = years.length ? Math.max(...years) : 0

    const states: PlanetState[] = []
    planets.forEach((planet, i) => {
      const el = planetRefs.current[i]
      if (!el) return
      const desktopId = planeFor(planet.id, planet.orbit)
      // Plane C is wider than a phone screen, so its planets are re-seated on a
      // narrower plane there rather than dropped — a business that submitted a
      // planet should not vanish on mobile.
      const mobileId =
        desktopId === 'c' ? MOBILE_PLANES[hash32(planet.id) % MOBILE_PLANES.length] : desktopId
      const cap = TRAIL_SAMPLES[planet.trailLength]
      states.push({
        el,
        planet,
        planeDesktop: PLANES[desktopId],
        planeMobile: PLANES[mobileId],
        plane: PLANES[desktopId],
        phase0: phaseFor(planet.id),
        rf: radiusFactor(planet.id, planet.foundedYear, minYear, maxYear),
        sx: new Float32Array(cap),
        sy: new Float32Array(cap),
        sd: new Float32Array(cap),
        cap,
        head: 0,
        count: 0,
        clock: 0,
        lastSampleAt: 0,
        visible: true,
      })
    })
    if (states.length === 0) return

    // Stable for the whole day: the hero should be the same picture on a
    // reload, and still give every planet its turn over a week.
    const dayKey = new Date().toISOString().slice(0, 10)
    const desktopShown = new Set(dailySubset(planets, HERO_PLANET_LIMIT, dayKey).map((p) => p.id))
    const mobileShown = new Set(
      dailySubset(planets, HERO_PLANET_LIMIT_MOBILE, dayKey).map((p) => p.id),
    )

    const measure = () => {
      W = section.clientWidth
      H = section.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      for (const c of [farCanvas, nearCanvas]) {
        c.width = W * dpr
        c.height = H * dpr
        c.style.width = `${W}px`
        c.style.height = `${H}px`
      }
      for (const ctx of layers) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      mobile = window.innerWidth < 640
      // Mirror LogoEngine's own sizing so the orbits are anchored to the logo
      // as it ACTUALLY renders: the mesh is scaled by the video's
      // object-fit:cover factor on desktop, which is >1 on anything wider than
      // 16:9. Getting this wrong puts the whole system off-centre.
      const heightFrac = mobile ? CALIB.MOBILE_HEIGHT_FRAC : CALIB.HEIGHT_FRAC
      const cover = mobile ? 1 : videoCoverScale(W, H)
      const lh = heightFrac * H * cover
      cx = CALIB.CENTER_X * W
      cy = H / 2 + (CALIB.CENTER_Y - 0.5) * H * cover
      R = Math.max((lh * LOGO_ASPECT) / 2, lh / 2) + LOGO_PAD

      const shown = mobile ? mobileShown : desktopShown
      states.forEach((s) => {
        s.plane = mobile ? s.planeMobile : s.planeDesktop
        s.visible = shown.has(s.planet.id)
        s.el.style.display = s.visible ? '' : 'none'
        // A resize can move a planet a long way; a trail drawn between the two
        // positions would be a straight line across the hero.
        s.count = 0
        s.head = 0
      })
    }

    measure()

    const activePlanes = () => {
      const used = new Set(states.filter((s) => s.visible).map((s) => s.plane.id))
      return [...used].map((id) => PLANES[id])
    }

    /**
     * The logo's rings (docs/CONCEPT-SEMESTA.md §3.1).
     *
     * Each orbital plane is drawn as a band of concentric arcs rather than one
     * hairline, with a gap standing in for Saturn's Cassini division. The band
     * is centred on the exact ellipse the planets ride, so a planet always sits
     * inside its own ring rather than beside it.
     *
     * The half of every ring with sin(t) < 0 goes on the far canvas and the
     * other half on the near one — the ellipse parameter maps straight onto
     * canvas `ellipse()` start/end angles, so this costs one extra call per
     * band and nothing else.
     */
    const drawRings = (alphaMul: number) => {
      for (const plane of activePlanes()) {
        for (const band of RING_BANDS) {
          for (const [ctx, [from, to]] of [
            [far, RING_ARC.far],
            [near, RING_ARC.near],
          ] as const) {
            ctx.save()
            ctx.globalAlpha = GUIDE_ALPHA * band.alpha * alphaMul
            ctx.strokeStyle = INK_HEX.graphite
            ctx.lineWidth = GUIDE_WIDTH * band.width
            ctx.beginPath()
            ctx.ellipse(
              cx,
              cy,
              plane.rx * R * band.k,
              plane.ry * R * band.k,
              plane.tilt,
              from,
              to,
            )
            ctx.stroke()
            ctx.restore()
          }
        }
      }
    }

    /**
     * One planet's trail, drawn onto whichever layer each sample belongs to.
     * `wantNear` picks the half: a trail that crosses behind the logo is broken
     * at the crossing and continues on the other canvas, so the mark disappears
     * behind the logo exactly where the planet does.
     */
    const drawTrail = (s: PlanetState, alphaMul: number, ctx: CanvasRenderingContext2D, wantNear: boolean) => {
      const style = s.planet.trailStyle
      if (style === 'none' || s.count < 3) return
      const color = INK_HEX[s.planet.ink]
      const n = s.count
      // oldest sample first, so alpha can ramp toward the planet
      const at = (k: number) => (s.head - n + k + s.cap) % s.cap
      const onLayer = (k: number) => s.sd[at(k)] >= 0 === wantNear

      ctx.save()
      ctx.strokeStyle = color
      ctx.fillStyle = color

      if (style === 'line') {
        // Drawn in a few chunks rather than per-segment: a per-segment alpha
        // ramp is one stroke() call per sample, and forty planets × 160 samples
        // is a frame budget spent on nothing anyone can see.
        ctx.lineWidth = TRAIL_WIDTH
        for (let c = 0; c < TRAIL_CHUNKS; c++) {
          const from = Math.floor((c * (n - 1)) / TRAIL_CHUNKS)
          const to = Math.floor(((c + 1) * (n - 1)) / TRAIL_CHUNKS)
          if (to <= from) continue
          ctx.globalAlpha = ((c + 1) / TRAIL_CHUNKS) * TRAIL_ALPHA * alphaMul
          ctx.beginPath()
          let penDown = false
          for (let k = from; k <= to; k++) {
            if (!onLayer(k)) {
              penDown = false
              continue
            }
            const j = at(k)
            if (!penDown) {
              ctx.moveTo(s.sx[j], s.sy[j])
              penDown = true
            } else ctx.lineTo(s.sx[j], s.sy[j])
          }
          ctx.stroke()
        }
      } else if (style === 'dots') {
        for (let k = 0; k < n; k += 5) {
          if (!onLayer(k)) continue
          const j = at(k)
          ctx.globalAlpha = (k / (n - 1)) * TRAIL_ALPHA * alphaMul
          ctx.beginPath()
          ctx.arc(s.sx[j], s.sy[j], 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        // ticks: short strokes across the path, like hatching a motion line
        ctx.lineWidth = TRAIL_WIDTH
        for (let k = 1; k < n; k += 7) {
          if (!onLayer(k)) continue
          const j = at(k)
          const p = at(k - 1)
          const dx = s.sx[j] - s.sx[p]
          const dy = s.sy[j] - s.sy[p]
          const d = Math.hypot(dx, dy) || 1
          const nx = (-dy / d) * 3.2
          const ny = (dx / d) * 3.2
          ctx.globalAlpha = (k / (n - 1)) * TRAIL_ALPHA * alphaMul
          ctx.beginPath()
          ctx.moveTo(s.sx[j] - nx, s.sy[j] - ny)
          ctx.lineTo(s.sx[j] + nx, s.sy[j] + ny)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    const applyTransform = (s: PlanetState, x: number, y: number, depth: number, alpha: number) => {
      s.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${depthScale(depth).toFixed(3)})`
      s.el.style.opacity = String(alpha * depthAlpha(depth))
      // The far half of every orbit passes BEHIND the logo. This one line is
      // the whole 3D illusion; the root deliberately has no z-index so these
      // values are not trapped in a stacking context of their own.
      s.el.style.zIndex = depth >= 0 ? '2' : '-1'
    }

    // ---------- static mode ----------
    const drawStatic = () => {
      for (const ctx of layers) ctx.clearRect(0, 0, W, H)
      drawRings(1)
      states.forEach((s) => {
        if (!s.visible) return
        const pt = orbitPoint(s.plane, R, s.rf, s.phase0)
        applyTransform(s, cx + pt.x, cy + pt.y, pt.depth, 1)
      })
    }

    if (reduced) {
      drawStatic()
      const onResize = () => {
        measure()
        drawStatic()
      }
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }

    // ---------- interaction ----------
    let hoverId: string | null = null
    let entranceStart: number | null = null
    let last = performance.now()
    let raf = 0

    const coarse = window.matchMedia('(pointer: coarse)').matches

    const clearRevealed = (except?: HTMLElement) => {
      states.forEach((s) => {
        if (s.el !== except) delete s.el.dataset.revealed
      })
    }

    states.forEach((s) => {
      const el = s.el
      el.addEventListener('pointerenter', () => {
        hoverId = s.planet.id
      })
      el.addEventListener('pointerleave', () => {
        if (hoverId === s.planet.id) hoverId = null
      })
      el.addEventListener('focus', () => {
        hoverId = s.planet.id
      })
      el.addEventListener('blur', () => {
        if (hoverId === s.planet.id) hoverId = null
      })
      // Touch has no hover, so a tap on a link would open it before its label
      // was ever read. First tap reveals and holds the planet still, second
      // tap follows the link.
      el.addEventListener('click', (e) => {
        if (!coarse) return
        if (el.dataset.revealed !== '1') {
          e.preventDefault()
          clearRevealed(el)
          el.dataset.revealed = '1'
          hoverId = s.planet.id
        }
      })
    })

    const onWindowPointerDown = (e: PointerEvent) => {
      if (!coarse) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-planet]')) return
      clearRevealed()
      hoverId = null
    }

    // ---------- live mode ----------
    const renderFrame = (now: number, dt: number) => {
      if (entranceStart === null && activeRef.current) entranceStart = now
      const enter = entranceStart === null ? 0 : clamp01((now - entranceStart) / ENTRANCE_MS)
      const fade = 1 - clamp01(window.scrollY / (H * 0.6))
      const alpha = enter * fade

      for (const ctx of layers) ctx.clearRect(0, 0, W, H)
      if (alpha > 0.001) drawRings(alpha)

      for (const s of states) {
        if (!s.visible) continue
        const speed = hoverId === null ? 1 : hoverId === s.planet.id ? 0 : HOVER_SLOW
        s.clock += dt * speed
        const t = phaseAt(s.plane, s.phase0, s.clock)
        const pt = orbitPoint(s.plane, R, s.rf, t)
        const x = cx + pt.x
        const y = cy + pt.y

        if (speed > 0 && now - s.lastSampleAt >= SAMPLE_MS) {
          s.sx[s.head] = x
          s.sy[s.head] = y
          s.sd[s.head] = pt.depth
          s.head = (s.head + 1) % s.cap
          if (s.count < s.cap) s.count++
          s.lastSampleAt = now
        }

        if (alpha > 0.001) {
          drawTrail(s, alpha, far, false)
          drawTrail(s, alpha, near, true)
        }
        applyTransform(s, x, y, pt.depth, alpha)
      }
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(now - last, 64) // a backgrounded tab must not teleport
      last = now
      renderFrame(now, dt)
      raf = requestAnimationFrame(tick)
    }

    const onResize = () => {
      measure()
      renderFrame(performance.now(), 0)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('pointerdown', onWindowPointerDown, { passive: true })
    // One frame up front. A tab opened in the background never receives a rAF
    // callback, and without this its planets would stay unplaced — stacked at
    // the hero's origin — until the tab is first looked at.
    last = performance.now()
    renderFrame(last, 0)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerdown', onWindowPointerDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, enabled, reduced])

  if (!enabled || planets.length === 0) return null

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className="tt-orbit-root"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* Behind the logo: the far half of every ring and trail. */}
      <canvas
        ref={farRef}
        aria-hidden
        style={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' }}
      />
      {/* In front of it: the near half. Together they wrap the logo. */}
      <canvas
        ref={nearRef}
        aria-hidden
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
      />
      {planets.map((p, i) => {
        const size = SIZE_PX[p.size]
        const body = (
          <>
            <PlanetSphere
              kind={p.kind}
              pattern={p.pattern}
              ink={p.ink}
              sizePx={size}
              spinSeconds={spinSeconds(p.id)}
              tiltDeg={axialTilt(p.id)}
            />
            <span className="tt-planet-label" aria-hidden>
              <span className="tt-planet-name">{p.name}</span>
              <span className="tt-planet-meta">{p.city}</span>
            </span>
            <span className="tt-sr-only">
              {p.name} — {p.city}
            </span>
          </>
        )
        const common = {
          ref: (el: HTMLElement | null) => {
            planetRefs.current[i] = el
          },
          'data-planet': p.id,
          className: 'tt-planet',
          style: { width: size, height: size },
        }
        return p.website ? (
          <a
            key={p.id}
            {...common}
            href={p.website}
            target="_blank"
            // nofollow ugc is the whole reason a stranger's link is survivable
            // here: the planet is worth having, the SEO value is not for sale.
            rel="nofollow ugc noopener noreferrer"
          >
            {body}
          </a>
        ) : (
          <button key={p.id} {...common} type="button">
            {body}
          </button>
        )
      })}

      <style>{`
        .tt-planet {
          position: absolute;
          top: 0;
          left: 0;
          display: block;
          padding: 0;
          border: 0;
          background: none;
          opacity: 0;
          cursor: pointer;
          pointer-events: auto;
          will-change: transform, opacity;
        }
        .tt-planet:focus-visible { outline: 1px solid var(--accent); outline-offset: 6px; }

        /* ---- the sketched globe (PlanetSphere) ---- */
        .tt-globe { position: relative; display: block; }
        .tt-globe-tilt,
        .tt-globe-spin { position: absolute; inset: 0; transform-style: preserve-3d; }
        /* Axial tilt is applied outside the spin so the planet leans and turns
           at once, the way a globe on a stand does — spinning first and tilting
           after would wobble instead. */
        .tt-globe-tilt { transform: rotateZ(var(--tt-tilt)) rotateX(-14deg); }
        .tt-globe-spin { animation: ttGlobeSpin var(--tt-spin) linear infinite; }
        @keyframes ttGlobeSpin {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(360deg); }
        }

        .tt-globe-meridian,
        .tt-globe-parallel,
        .tt-globe-belt,
        .tt-globe-edge {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid currentColor;
        }
        .tt-globe-meridian { opacity: 0.5; }
        /* A circle laid flat is the equator. */
        .tt-globe-parallel { opacity: 0.4; transform: rotateX(90deg); }
        .tt-globe-belt { inset: -16%; opacity: 0.65; transform: rotateX(82deg); border-width: 1.2px; }
        /* Drawn outside the 3D group, so the silhouette never turns to an edge. */
        .tt-globe-edge { border-width: 1.2px; }

        /* Volume. The wireframe alone reads as a hoop; the hatching is what
           makes it a ball. Light fixed at the upper left, hatch masked to the
           crescent away from it. */
        .tt-globe-shade {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          opacity: 0.7;
          -webkit-mask-image: radial-gradient(circle at 32% 28%, transparent 36%, #000 94%);
          mask-image: radial-gradient(circle at 32% 28%, transparent 36%, #000 94%);
        }
        .tt-globe-shade--crosshatch {
          background:
            repeating-linear-gradient(45deg, currentColor 0 0.6px, transparent 0.6px 3px),
            repeating-linear-gradient(-45deg, currentColor 0 0.6px, transparent 0.6px 3px);
        }
        .tt-globe-shade--stipple {
          background: radial-gradient(currentColor 0.6px, transparent 0.7px);
          background-size: 3px 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          .tt-globe-spin { animation: none; }
        }

        .tt-planet-label {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 8px);
          transform: translateX(-50%);
          display: grid;
          justify-items: center;
          gap: 1px;
          white-space: nowrap;
          opacity: 0;
          transition: opacity 0.18s ease;
          pointer-events: none;
        }
        .tt-planet-name {
          font-size: 0.875rem;
          font-style: italic;
          color: var(--fg);
        }
        .tt-planet-meta {
          font-size: 0.6875rem;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        .tt-planet:hover .tt-planet-label,
        .tt-planet:focus-visible .tt-planet-label,
        .tt-planet[data-revealed='1'] .tt-planet-label { opacity: 1; }

        .tt-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          padding: 0;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}
