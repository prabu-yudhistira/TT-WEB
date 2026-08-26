import { mulberry32 } from '../three/shatter/types'
import { logoScreenBox } from '../three/calibration'
import { DEFAULT_SATELLITES, type SatelliteConfig } from './types'
import { placeLabels, EDGE_FADE_PX, type LabelCandidate } from './labels'

/**
 * Hero orbiting satellites — simulation and rendering.
 *
 * Two stacked canvases with the logo's own WebGL canvas sandwiched between
 * them. Particles with z >= 0 (behind the orbital centre) draw on the back
 * canvas and are therefore painted over by the logo; particles with z < 0 draw
 * on the front canvas and pass in front of it.
 *
 * That is the whole reason this is 2D canvas rather than three.js geometry:
 * occlusion falls out of the DOM stacking order for free. Putting orbs in the
 * logo's own scene needed a bespoke depth-only pass, because every logo
 * material sets depthWrite:false (see the 2026-08-10 orbs post-mortem in
 * _HANDOFF/HANDOFF.md). Trails are free here too — one destination-out fill
 * per frame, versus a render target in WebGL.
 *
 * Runs one rAF loop writing DOM styles imperatively, matching
 * ConstellationField's established pattern: React renders the labels once and
 * never again.
 */

type Dust = {
  angle: number
  radius: number
  height: number
  speedOffset: number
  /** Last projected position, for streak rendering. NaN until first drawn. */
  px: number
  py: number
}

type Sat = Dust & {
  /** Own inclination offset from the disk plane, radians. */
  tiltOffset: number
  el: HTMLDivElement | null
  /** Cached label box. Measured when styled, never per frame. */
  labelW: number
  labelH: number
}

type Projected = { x: number; y: number; z: number; scale: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

type Rgb = { r: number; g: number; b: number }

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    }
  }
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  }
}

/** Mix toward white (t > 0) or black (t < 0). */
function shift({ r, g, b }: Rgb, t: number): string {
  const to = t >= 0 ? 255 : 0
  const k = Math.abs(t)
  return `rgb(${Math.round(r + (to - r) * k)},${Math.round(g + (to - g) * k)},${Math.round(b + (to - b) * k)})`
}

export class SatelliteEngine {
  private back: HTMLCanvasElement
  private front: HTMLCanvasElement
  private labelHost: HTMLElement
  private bctx: CanvasRenderingContext2D
  private fctx: CanvasRenderingContext2D

  private cfg: SatelliteConfig = { ...DEFAULT_SATELLITES }
  private words: string[] = []

  private dust: Dust[] = []
  private sats: Sat[] = []

  private raf = 0
  private running = false
  private lastTime = 0

  private W = 0
  private H = 0
  private dpr = 1
  private cx = 0
  private cy = 0
  private innerR = 40
  private outerR = 300

  private active = false
  private activeSince = 0
  private reduced = false
  private scrollAlpha = 1
  private pointer = { x: 0, y: 0, inside: false }

  /**
   * Pulled from LogoEngine.getCharge() every frame: 0 at rest, rising to 1 over
   * the separation's CHARGE_MS while the mark is held, easing back on release.
   * Pull rather than push because the charge is a continuous value the logo
   * already maintains — mirroring it into React state would just add lag and a
   * re-render per frame.
   */
  private chargeSource: () => number = () => 0
  private shakePhase = 0

  private onScroll = () => {
    const span = this.cfg.SCROLL_FADE_VH * window.innerHeight
    this.scrollAlpha = span > 0 ? clamp01(1 - window.scrollY / span) : 1
  }

  private onPointerMove = (e: PointerEvent) => {
    const r = this.labelHost.getBoundingClientRect()
    this.pointer.x = e.clientX - r.left
    this.pointer.y = e.clientY - r.top
    this.pointer.inside = true
  }

  private onPointerLeave = () => {
    this.pointer.inside = false
  }

  constructor(back: HTMLCanvasElement, front: HTMLCanvasElement, labelHost: HTMLElement) {
    this.back = back
    this.front = front
    this.labelHost = labelHost
    const b = back.getContext('2d')
    const f = front.getContext('2d')
    if (!b || !f) throw new Error('SatelliteEngine: 2D context unavailable')
    this.bctx = b
    this.fctx = f

    // Dev handle, mirroring the shatter bench's window.__ttShatter. Lets a
    // verification script read real screen positions instead of inferring
    // rotation direction from screenshots.
    ;(window as unknown as Record<string, unknown>).__ttSatellites = () => ({
      cx: this.cx,
      cy: this.cy,
      charge: this.chargeSource(),
      sats: this.sats.map((s) => ({ x: s.px, y: s.py })),
    })

    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true })
  }

  // ── configuration ───────────────────────────────────────────────────

  setConfig(cfg: SatelliteConfig) {
    const countChanged =
      cfg.DUST_COUNT !== this.cfg.DUST_COUNT ||
      cfg.DUST_CLUSTER !== this.cfg.DUST_CLUSTER ||
      cfg.DUST_THICKNESS !== this.cfg.DUST_THICKNESS ||
      cfg.SAT_RADIUS_MIN !== this.cfg.SAT_RADIUS_MIN ||
      cfg.SAT_RADIUS_MAX !== this.cfg.SAT_RADIUS_MAX ||
      cfg.SAT_TILT_SPREAD !== this.cfg.SAT_TILT_SPREAD ||
      cfg.SEED !== this.cfg.SEED
    this.cfg = cfg
    if (countChanged) this.seed()
    this.styleLabels()
    if (this.reduced) this.drawStatic()
  }

  setWords(words: string[]) {
    const same = words.length === this.words.length && words.every((w, i) => w === this.words[i])
    if (same) return
    this.words = words
    this.buildLabels()
    this.seed()
    if (this.reduced) this.drawStatic()
  }

  /** Hand the engine a way to read the logo's separation charge each frame. */
  setChargeSource(get: (() => number) | null) {
    this.chargeSource = get ?? (() => 0)
  }

  setActive(v: boolean) {
    if (v === this.active) return
    this.active = v
    if (v) this.activeSince = performance.now()
  }

  setReduced(v: boolean) {
    this.reduced = v
    if (v) {
      this.stop()
      this.drawStatic()
    }
  }

  // ── layout ──────────────────────────────────────────────────────────

  resize() {
    const rect = this.labelHost.getBoundingClientRect()
    const W = Math.max(1, Math.round(rect.width))
    const H = Math.max(1, Math.round(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const changed = W !== this.W || H !== this.H || dpr !== this.dpr
    this.W = W
    this.H = H
    this.dpr = dpr

    for (const c of [this.back, this.front]) {
      c.width = Math.round(W * dpr)
      c.height = Math.round(H * dpr)
      c.style.width = `${W}px`
      c.style.height = `${H}px`
    }

    // The orbital centre IS the 3D mark, so it has to track the mark's real
    // on-screen box — including the object-fit:cover correction that only
    // matters on windows wider than 16:9.
    const mobile = window.innerWidth < 640
    const box = logoScreenBox(W, H, mobile)
    this.cx = box.cx
    this.cy = box.cy
    const innerFrac = mobile ? this.cfg.MOBILE_INNER_RADIUS : this.cfg.INNER_RADIUS
    const outerFrac = mobile ? this.cfg.MOBILE_OUTER_RADIUS : this.cfg.OUTER_RADIUS
    this.innerR = Math.max(8, box.hh * innerFrac)
    // Floor keeps outerR strictly above innerR: dust seeds across
    // innerR..outerR, and an inverted span would place particles inside the
    // orbit floor. Reachable on a tall narrow window, where INNER_RADIUS 3 of a
    // tall mark can exceed a radius measured off the short side.
    this.outerR = Math.max(this.innerR + 12, (Math.min(W, H) / 2) * outerFrac)

    if (changed || this.dust.length === 0) this.seed()
    if (this.reduced) this.drawStatic()
  }

  // ── seeding ─────────────────────────────────────────────────────────

  private seed() {
    const c = this.cfg
    const rand = mulberry32(c.SEED)

    this.dust = new Array(Math.max(0, Math.round(c.DUST_COUNT)))
    for (let i = 0; i < this.dust.length; i++) {
      // Power distribution biases density toward the inner edge, exactly as
      // the reference does — that inner crowding is most of what makes the
      // field read as a disk rather than a scatter.
      const t = Math.pow(rand(), Math.max(1, c.DUST_CLUSTER))
      this.dust[i] = {
        angle: rand() * Math.PI * 2,
        radius: this.innerR + t * (this.outerR - this.innerR),
        height: (rand() - 0.5) * c.DUST_THICKNESS,
        speedOffset: 0.75 + rand() * 0.5,
        px: NaN,
        py: NaN,
      }
    }

    const n = this.words.length
    const prev = this.sats
    this.sats = new Array(n)
    const band = this.outerR * (c.SAT_RADIUS_MAX - c.SAT_RADIUS_MIN)
    for (let i = 0; i < n; i++) {
      this.sats[i] = {
        // Evenly phased rather than random: a handful of objects at random
        // angles clumps visibly, and clumping is what made the 2026-08-10
        // build read as sparse.
        angle: (i / Math.max(1, n)) * Math.PI * 2 + rand() * 0.25,
        radius: this.outerR * c.SAT_RADIUS_MIN + (n <= 1 ? band / 2 : (i / (n - 1)) * band),
        height: (rand() - 0.5) * c.DUST_THICKNESS * 0.5,
        speedOffset: 0.9 + rand() * 0.2,
        tiltOffset: ((rand() - 0.5) * c.SAT_TILT_SPREAD * Math.PI) / 180,
        px: NaN,
        py: NaN,
        el: prev[i]?.el ?? null,
        labelW: prev[i]?.labelW ?? 0,
        labelH: prev[i]?.labelH ?? 0,
      }
    }
    this.bindLabelElements()
    // Re-measure AFTER rebinding. Fresh satellites inherit labelW from the
    // previous array, so any satellite past the old list length would carry a
    // width of 0 — a zero-width collision box, which never collides, which
    // silently defeats the overlap suppression below.
    this.styleLabels()
  }

  // ── labels ──────────────────────────────────────────────────────────

  private buildLabels() {
    this.labelHost.textContent = ''
    for (const w of this.words) {
      const el = document.createElement('div')
      el.textContent = w
      el.style.position = 'absolute'
      el.style.left = '0'
      el.style.top = '0'
      el.style.whiteSpace = 'nowrap'
      el.style.pointerEvents = 'none'
      el.style.willChange = 'transform, opacity'
      el.style.opacity = '0'
      this.labelHost.appendChild(el)
    }
    this.bindLabelElements()
    this.styleLabels()
  }

  private bindLabelElements() {
    const els = this.labelHost.children
    for (let i = 0; i < this.sats.length; i++) {
      this.sats[i].el = (els[i] as HTMLDivElement) ?? null
    }
  }

  private styleLabels() {
    const c = this.cfg
    for (const s of this.sats) {
      if (!s.el) continue
      s.el.style.fontSize = `${c.LABEL_SIZE}px`
      s.el.style.color = c.LABEL_COLOR
      s.el.style.letterSpacing = '0.04em'
      // One layout read here rather than one per label per frame. Height must
      // be measured too, not assumed to equal LABEL_SIZE: a div's box is its
      // line-height, ~1.3x the font size, and the shorter guess let labels one
      // line apart pass the overlap test while visibly colliding.
      s.labelW = s.el.offsetWidth || c.LABEL_SIZE * 4
      s.labelH = s.el.offsetHeight || c.LABEL_SIZE * 1.35
    }
  }

  // ── projection ──────────────────────────────────────────────────────

  private project(radius: number, angle: number, height: number, tiltRad: number): Projected {
    const c = this.cfg
    const sw = (c.TILT_SIDEWAY * Math.PI) / 180
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)

    const xb = radius * cosA
    const yb = height
    const zb = radius * sinA

    // inclination around X
    const y1 = yb * Math.cos(tiltRad) + zb * Math.sin(tiltRad)
    const z1 = -yb * Math.sin(tiltRad) + zb * Math.cos(tiltRad)

    // roll around the view axis
    const x3 = xb * Math.cos(sw) - y1 * Math.sin(sw)
    const y3 = xb * Math.sin(sw) + y1 * Math.cos(sw)

    const scale = c.PERSPECTIVE / (c.PERSPECTIVE + z1)
    return { x: this.cx + x3 * scale, y: this.cy + y3 * scale, z: z1, scale }
  }

  // ── loop ────────────────────────────────────────────────────────────

  start() {
    if (this.running || this.reduced) return
    this.running = true
    this.lastTime = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  destroy() {
    this.stop()
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerleave', this.onPointerLeave)
  }

  private fade(ctx: CanvasRenderingContext2D, alpha: number) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalAlpha = 1
    // destination-out rather than a solid fill: the canvas has to stay
    // transparent, because the paper (and on mobile a paper photo) is behind it.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = `rgba(0,0,0,${alpha})`
    ctx.fillRect(0, 0, this.W, this.H)
    ctx.globalCompositeOperation = 'source-over'
  }

  private frame = (now: number) => {
    if (!this.running) return
    const c = this.cfg
    const dt = Math.min((now - this.lastTime) / 16.667, 3)
    this.lastTime = now

    // 0 → clear outright, 50 → long streaks
    const trailAlpha = Math.max(0.02, 1 - (Math.max(0, c.TRAIL) / 50) * 0.98)
    this.fade(this.bctx, trailAlpha)
    this.fade(this.fctx, trailAlpha)

    const entrance = this.active
      ? clamp01((now - this.activeSince) / Math.max(1, c.ENTRANCE_MS))
      : 0
    const globalAlpha = entrance * this.scrollAlpha

    const charge = clamp01(this.chargeSource())
    if (charge > 0) this.shakePhase += c.HOLD_SHAKE_SPEED * dt

    if (globalAlpha > 0.001) {
      this.step(dt, charge)
      this.draw(globalAlpha, charge)
    } else {
      this.step(dt, charge)
      this.hideLabels()
    }

    this.raf = requestAnimationFrame(this.frame)
  }

  private step(dt: number, charge: number) {
    const c = this.cfg
    const tiltRad = (c.TILT * Math.PI) / 180

    // Orbits ease to a standstill as the charge builds, reaching a full stop at
    // half charge (~475ms into a hold) so it reads as a decisive halt rather
    // than a gradual slowdown that is still creeping when the blast fires.
    const motion = c.HOLD_FREEZE ? Math.max(0, 1 - charge * 2) : 1
    const dir = c.ORBIT_DIR < 0 ? -1 : 1

    for (const p of this.dust) {
      // v ~ 1/sqrt(r): the Keplerian falloff from the reference. Without it the
      // field rotates rigidly and reads as a spinning texture, not an orbit.
      const speedFactor = Math.sqrt(this.innerR / Math.max(p.radius, 10))
      p.angle += dir * motion * c.ORBIT_SPEED * speedFactor * p.speedOffset * 0.012 * dt
      if (c.PULL_SPEED > 0) {
        p.radius -= (c.PULL_SPEED / 2) * speedFactor * p.speedOffset * dt
        if (p.radius < this.innerR) {
          const span = this.outerR - this.innerR
          p.radius = this.innerR + 0.7 * span + Math.random() * 0.3 * span
          p.angle = Math.random() * Math.PI * 2
          p.height = (Math.random() - 0.5) * c.DUST_THICKNESS
        }
      }
    }

    for (const s of this.sats) {
      const speedFactor = Math.sqrt(this.innerR / Math.max(s.radius, 10))
      s.angle +=
        dir * motion * c.ORBIT_SPEED * c.SAT_SPEED_SCALE * speedFactor * s.speedOffset * 0.012 * dt
    }
    void tiltRad
  }

  private draw(globalAlpha: number, charge = 0) {
    const c = this.cfg
    const tiltRad = (c.TILT * Math.PI) / 180
    const bctx = this.bctx
    const fctx = this.fctx
    bctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    fctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    // ── dust ──
    bctx.fillStyle = c.DUST_COLOR
    fctx.fillStyle = c.DUST_COLOR
    bctx.strokeStyle = c.DUST_COLOR
    fctx.strokeStyle = c.DUST_COLOR
    bctx.lineCap = 'round'
    fctx.lineCap = 'round'
    for (const p of this.dust) {
      const q = this.project(p.radius, p.angle, p.height, tiltRad)
      const prevX = p.px
      const prevY = p.py
      p.px = q.x
      p.py = q.y
      if (q.x < -30 || q.x > this.W + 30 || q.y < -30 || q.y > this.H + 30) continue
      // Depth dim, matching the reference's balance: never below 0.35 of full,
      // so the far side of the disk stays legible rather than vanishing.
      const depth = Math.max(0.35, 1 - ((q.z + this.outerR) / (2 * this.outerR)) * 0.45)
      const ctx = q.z >= 0 ? bctx : fctx
      const r = Math.max(0.3, c.DUST_SIZE * q.scale)
      ctx.globalAlpha = c.DUST_ALPHA * depth * globalAlpha

      // Joining each frame to the last turns a row of stamped dots into a
      // continuous streak. Skipped on the first frame after a re-seed (px is
      // NaN) and whenever the jump is implausibly long, which happens when a
      // particle respawns or the field is resized mid-flight.
      const dx = q.x - prevX
      const dy = q.y - prevY
      if (c.DUST_STREAK > 0 && prevX === prevX && dx * dx + dy * dy < 40000) {
        ctx.lineWidth = r * 2
        ctx.beginPath()
        ctx.moveTo(q.x - dx * c.DUST_STREAK, q.y - dy * c.DUST_STREAK)
        ctx.lineTo(q.x, q.y)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    bctx.globalAlpha = 1
    fctx.globalAlpha = 1

    // ── satellites ──
    if (!c.SAT_ENABLED) {
      this.hideLabels()
      return
    }

    let nearest = -1
    let nearestD2 = c.LABEL_HOVER_RADIUS * c.LABEL_HOVER_RADIUS
    const placed: { i: number; q: Projected; alpha: number }[] = []

    const shakeAmp = charge * c.HOLD_SHAKE_PX

    for (let i = 0; i < this.sats.length; i++) {
      const s = this.sats[i]
      const satColor = c.SAT_COLORS?.[i] || c.SAT_COLOR
      const satRgb = hexToRgb(satColor)
      const q = this.project(s.radius, s.angle, s.height, tiltRad + s.tiltOffset)

      // Held: each satellite trembles about its frozen position. The phase
      // offset is the golden angle so twelve of them never march in step.
      if (shakeAmp > 0.01) {
        const ph = this.shakePhase + i * 2.399
        q.x += Math.sin(ph) * shakeAmp
        q.y += Math.cos(ph * 1.31) * shakeAmp
      }

      const depth = Math.max(0.4, 1 - ((q.z + this.outerR) / (2 * this.outerR)) * 0.45)
      const a = c.SAT_ALPHA * depth * globalAlpha
      const ctx = q.z >= 0 ? bctx : fctx

      // Beyond the perspective divide: with no dust left, exaggerated near/far
      // sizing is what tells the eye these are orbiting in depth rather than
      // sliding around a flat ellipse.
      const depthScale = 1 + (q.scale - 1) * (1 + c.SAT_DEPTH_SCALE * 4)
      const r = Math.max(0.5, c.SAT_SIZE * Math.max(0.15, depthScale))

      const prevX = s.px
      const prevY = s.py
      s.px = q.x
      s.py = q.y

      // Trail first, so the sphere sits on top of its own wake.
      const dx = q.x - prevX
      const dy = q.y - prevY
      // Suppressed while shaking: joining a jitter to the last jitter draws a
      // scribble, not a wake.
      if (c.SAT_STREAK > 0 && shakeAmp <= 0.01 && prevX === prevX && dx * dx + dy * dy < 40000) {
        ctx.globalAlpha = a * 0.55
        ctx.strokeStyle = satColor
        ctx.lineCap = 'round'
        ctx.lineWidth = r * 1.15
        ctx.beginPath()
        ctx.moveTo(q.x - dx * c.SAT_STREAK, q.y - dy * c.SAT_STREAK)
        ctx.lineTo(q.x, q.y)
        ctx.stroke()
      }

      ctx.globalAlpha = a
      this.drawSphere(ctx, q.x, q.y, r, satRgb, c.SAT_SHADE)

      if (c.SAT_RING > 0) {
        ctx.globalAlpha = a * 0.45
        ctx.strokeStyle = satColor
        ctx.lineWidth = Math.max(0.6, 1 * q.scale)
        ctx.beginPath()
        ctx.arc(q.x, q.y, r * c.SAT_RING, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      if (this.pointer.inside) {
        const dx = this.pointer.x - q.x
        const dy = this.pointer.y - q.y
        const d2 = dx * dx + dy * dy
        if (d2 < nearestD2) {
          nearestD2 = d2
          nearest = i
        }
      }
      placed.push({ i, q, alpha: globalAlpha * depth })
    }

    // ── labels ──
    // Edge fade and overlap suppression live in ./labels.ts as pure geometry —
    // two bugs hid in them while they were tangled with canvas calls here.
    const candidates: LabelCandidate[] = []
    for (const { i, q, alpha } of placed) {
      const s = this.sats[i]
      if (!s.el) continue
      let a =
        c.LABEL_MODE === 'always' ? alpha : c.LABEL_MODE === 'hover' && i === nearest ? alpha : 0
      // A satellite on the far side, currently behind the mark, should not have
      // its word floating over the logo's face.
      if (
        q.z >= 0 &&
        Math.abs(q.x - this.cx) < this.W * 0.09 &&
        Math.abs(q.y - this.cy) < this.H * 0.16
      ) {
        a *= 0.15
      }
      candidates.push({
        index: i,
        x: q.x + c.LABEL_OFFSET,
        y: q.y - c.LABEL_SIZE / 2,
        w: s.labelW,
        h: s.labelH,
        z: q.z,
        alpha: a,
      })
    }

    for (const p of placeLabels(candidates, this.W, this.H, EDGE_FADE_PX)) {
      const s = this.sats[p.index]
      const cand = candidates.find((k) => k.index === p.index)
      if (!s.el || !cand) continue
      s.el.style.opacity = p.opacity.toFixed(3)
      s.el.style.transform = `translate3d(${cand.x.toFixed(1)}px, ${cand.y.toFixed(1)}px, 0)`
    }
  }

  /**
   * A satellite as a lit sphere rather than a flat disc.
   *
   * Same construction the reference uses for its event horizon: a radial
   * gradient whose focus is offset toward the light (upper-left, matching the
   * hero's own key light), a darkened terminator at the far edge, a rim light
   * just inside the silhouette, and a small specular. On cream paper the
   * highlight has to stay well short of white or the sphere reads as a hole
   * punched in the page.
   */
  private drawSphere(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    rgb: Rgb,
    shade: number,
  ) {
    if (shade <= 0.001 || r < 1.2) {
      ctx.fillStyle = shift(rgb, 0)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      return
    }

    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.04, x, y, r)
    g.addColorStop(0, shift(rgb, 0.62 * shade))
    g.addColorStop(0.42, shift(rgb, 0.12 * shade))
    g.addColorStop(0.82, shift(rgb, -0.3 * shade))
    g.addColorStop(1, shift(rgb, -0.5 * shade))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()

    // Rim light along the shadowed edge — what separates a sphere from a
    // gradient-filled circle at small sizes.
    if (r > 2.5) {
      const rim = ctx.createRadialGradient(x, y, r * 0.86, x, y, r)
      rim.addColorStop(0, 'rgba(255,255,255,0)')
      rim.addColorStop(1, `rgba(255,255,255,${0.3 * shade})`)
      ctx.fillStyle = rim
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      const prev = ctx.globalAlpha
      ctx.globalAlpha = prev * 0.75 * shade
      ctx.fillStyle = shift(rgb, 0.85)
      ctx.beginPath()
      ctx.arc(x - r * 0.36, y - r * 0.4, Math.max(0.5, r * 0.16), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = prev
    }
  }

  private hideLabels() {
    for (const s of this.sats) if (s.el) s.el.style.opacity = '0'
  }

  /**
   * Reduced motion: one frame, no loop, no trails. The site honours this
   * preference in 19 places and a visitor who asked for stillness must not get
   * an orbiting field — see the 2026-08-22 entry in _HANDOFF/HANDOFF.md, where
   * an idle spin that ignored it read as "the site is broken".
   */
  private drawStatic() {
    if (!this.W || !this.H) return
    for (const ctx of [this.bctx, this.fctx]) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.clearRect(0, 0, this.W, this.H)
    }
    this.draw(1)
  }
}
