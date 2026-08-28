import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { logoScreenBox } from '../three/calibration'
import { projectOrbit, orbitGeometry } from '../satellites/project'
import { placeLabels, EDGE_FADE_PX, type LabelBox } from '../satellites/labels'
import type { SatelliteConfig } from '../satellites/types'
import { DEFAULT_MASCOT, type MascotConfig } from './types'
import { makeMotePool, TrailState } from './mascotTrail'
import {
  EXPRESSIONS,
  EYES_FRAGMENT_CHUNK,
  EYES_VERTEX_CHUNK,
  lerpEye,
  packEye,
  rightOf,
  type EyeShape,
} from './eyes'

/**
 * Hero orbiting mascot — simulation and rendering.
 *
 * Design: docs/superpowers/specs/2026-08-28-hero-mascot-design.md
 * Config: src/lib/mascot/types.ts (frozen DEFAULT_MASCOT). Pure particle
 * bookkeeping lives in ./mascotTrail.ts so it can be tested without a GL context.
 *
 * ── Why this is its own WebGL layer ──────────────────────────────────
 * The satellites are 2D canvas because occlusion and trails fall out of the
 * DOM stacking order for free. The mascot is a real PBR mesh and cannot join
 * that system, so it gets its own scene on its own canvas, and occlusion comes
 * from flipping that ONE canvas between z 0 (behind LogoStage, which paints
 * over it) and z 2 (in front). One canvas suffices because there is exactly one
 * mascot — this is not a general depth-sorting scheme and does not pretend to
 * be one.
 *
 * That flip is always invisible, and not by luck: the depth crossing happens
 * where sin(angle) = 0, which is the orbit's maximum horizontal excursion. The
 * mascot is at its furthest from the logo at the exact moment it changes layer.
 *
 * ── Why an orthographic camera ───────────────────────────────────────
 * The mascot is positioned by calling the SAME projectOrbit() the satellites
 * use, then placed at those screen coordinates directly. An orthographic camera
 * in CSS pixel units makes that placement exact and makes SIZE mean literal
 * on-screen pixels. The cost is no perspective foreshortening within the
 * mascot itself, which is invisible at ~100px. If the later fly-out wants a
 * dramatic rush toward camera, only this camera and place() change.
 */

/**
 * Fixed mote pool, allocated once and never resized mid-flight.
 * ceil(TRAIL_DENSITY max 400 * TRAIL_SECONDS max 5 * 1.3) — the CMS cannot ask
 * for more live motes than the pool holds.
 */
const MAX_MOTES = 2600

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export class MascotEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000)

  /** position + uniform scale — driven straight from projectOrbit() */
  private placer = new THREE.Group()
  /** tilts the spin axis away from vertical */
  private tilter = new THREE.Group()
  /** the spin itself */
  private spinner = new THREE.Group()
  private model: THREE.Object3D | null = null
  private materials: THREE.MeshStandardMaterial[] = []
  private envRT: THREE.WebGLRenderTarget | null = null

  private hemi: THREE.HemisphereLight
  private dir: THREE.DirectionalLight

  private dust!: THREE.Points
  private dustGeo!: THREE.BufferGeometry
  private dustMat!: THREE.ShaderMaterial
  private dustPos!: Float32Array
  private dustAlpha!: Float32Array
  private dustSize!: Float32Array
  /** Pure particle bookkeeping — emission carry, stall clamp, fade, ring buffer. */
  private trail!: TrailState

  private cfg: MascotConfig = { ...DEFAULT_MASCOT }
  private belt: SatelliteConfig | null = null

  private raf = 0
  private running = false
  private lastTime = 0
  private disposed = false

  private W = 0
  private H = 0
  private dpr = 1
  private cx = 0
  private cy = 0
  private orbitR = 300
  private innerR = 40

  private angle = 0
  private spin = 0
  private elapsed = 0
  private active = false
  private activeSince = 0
  private reduced = false
  private scrollAlpha = 1
  private shakePhase = 0
  private behind = true
  private depthCb: ((behind: boolean) => void) | null = null

  private chargeSource: () => number = () => 0

  private onScroll = () => {
    const span = this.cfg.SCROLL_FADE_VH * window.innerHeight
    this.scrollAlpha = span > 0 ? clamp01(1 - window.scrollY / span) : 1
  }

  /**
   * @param host the layer's own box. Measured rather than using window.inner*
   * so this matches SatelliteEngine exactly — the two must agree on the field
   * dimensions or they compute different orbital centres.
   */
  constructor(
    canvas: HTMLCanvasElement,
    private host: HTMLElement,
    /**
     * The mascot's word. A DOM node rather than canvas text for the same reason
     * the satellites use one: real font rendering and no per-frame text
     * measurement. Lives OUTSIDE the flipping canvas so the word stays readable
     * when the body passes behind the mark.
     */
    private labelEl: HTMLElement | null = null,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    // Capped at 1.5 to match the satellite canvases rather than LogoEngine's 2:
    // this layer is a single mid-size object, not the page's focal mark.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.setClearAlpha(0)
    // Same colour pipeline as LogoEngine, so the mascot is lit by what looks
    // like the same room as the mark it orbits.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera.position.set(0, 0, 1000)

    this.hemi = new THREE.HemisphereLight(0xfff8ec, 0xcfc5b2, 1.1)
    this.dir = new THREE.DirectionalLight(0xffffff, DEFAULT_MASCOT.LIGHT_INTENSITY)
    this.dir.position.set(1.5, 2, 2.5)
    this.scene.add(this.hemi, this.dir)

    // Brass is fully metallic and metals have no diffuse term — with no
    // environment to reflect, this model renders essentially black. A
    // procedural room costs no asset bytes and is the whole reason it reads as
    // metal at all.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envRT.texture
    pmrem.dispose()

    this.placer.add(this.tilter)
    this.tilter.add(this.spinner)
    this.scene.add(this.placer)
    this.placer.visible = false

    this.buildTrail()

    ;(window as unknown as Record<string, unknown>).__ttMascot = () => ({
      cx: this.cx,
      cy: this.cy,
      orbitR: this.orbitR,
      angle: this.angle,
      behind: this.behind,
      loaded: !!this.model,
      charge: this.chargeSource(),
      pos: this.lastScreen,
    })

    // Dev handle for the bench and for verification scripts: hold one
    // expression instead of waiting for the glance beat to pick it.
    ;(window as unknown as Record<string, unknown>).__ttMascotExpr = (name: string | null) => {
      this.forcedExpr = name
      if (name) this.setExpression(name)
      return Object.keys(EXPRESSIONS)
    }

    window.addEventListener('scroll', this.onScroll, { passive: true })
  }

  /** Set by the bench / verification to pin one expression. null = live. */
  private forcedExpr: string | null = null

  /**
   * Face-display uniforms. Shared across every material on the mesh, so one
   * write drives the whole display. uFaceRadius 0.50 is MEASURED — the smooth
   * front cap ends there and the bezel relief begins (see ./eyes.ts).
   */
  private eyeUniforms: Record<string, { value: unknown }> = {
    uEyesOn: { value: 1 },
    uFaceRadius: { value: 0.5 },
    // Amber, not the reference video's cyan: the owner asked for the display to
    // match the mascot's own painted eyes and the gold dust trail (#FDB721), so
    // the hero keeps ONE warm accent rather than gaining a second, cold one.
    uEyeColor: { value: new THREE.Color('#F2A81C') },
    uEyeCore: { value: new THREE.Color('#FFF0BE') },
    uSocketColor: { value: new THREE.Color('#06080B') },
    uEyeGlow: { value: 0.55 },
    uEyeGap: { value: 0.38 },
    uScanline: { value: 0 },
    uSocketSpan: { value: 1.34 },
    uEyeL: { value: new Float32Array(12) },
    uEyeR: { value: new Float32Array(12) },
    uObjCenter: { value: new THREE.Vector3() },
    uObjScale: { value: 1 },
  }
  /** Where the glance beat is in its arc, and what it plays. */
  private glanceT = 1
  private glanceExpr = 'blink'
  private wasFacing = false

  private lastScreen = { x: NaN, y: NaN, z: NaN, scale: 1 }
  private labelW = 0
  private labelH = 0
  private labelBox: LabelBox | null = null

  // ── trail ───────────────────────────────────────────────────────────

  /**
   * The wake is a field of glowing gold motes shed along the orbit, not a
   * ribbon — owner's call, 2026-08-28.
   *
   * "Glowing" here is carried by a hot core inside a saturated body, NOT by
   * additive blending. On this site's #F6F1E7 paper, additive has almost no
   * headroom left to add into and washes toward white instead of reading as
   * gold — the same trap that made trionn's sheer black skin disappear on our
   * background (see the 2026-08-08 rendering lessons in _HANDOFF/HANDOFF.md).
   * TRAIL_ADDITIVE exists so that claim can be checked on screen rather than
   * taken on trust.
   */
  private buildTrail() {
    this.dustPos = new Float32Array(MAX_MOTES * 3)
    this.dustAlpha = new Float32Array(MAX_MOTES)
    this.dustSize = new Float32Array(MAX_MOTES)
    this.trail = new TrailState(makeMotePool(MAX_MOTES))
    this.dustGeo = new THREE.BufferGeometry()
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3))
    this.dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.dustAlpha, 1))
    this.dustGeo.setAttribute('aSize', new THREE.BufferAttribute(this.dustSize, 1))

    this.dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(DEFAULT_MASCOT.TRAIL_COLOR) },
        uCore: { value: new THREE.Color(DEFAULT_MASCOT.TRAIL_CORE_COLOR) },
        uGlow: { value: DEFAULT_MASCOT.TRAIL_GLOW },
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // The camera is ORTHOGRAPHIC in CSS pixel units, so point size is
          // literally pixels. Do not "fix" this into the usual perspective
          // idiom (300.0 / -mv.z) — that assumes a far larger world scale and
          // is exactly what produced ~437px points and 5.9fps in the ignition's
          // first ember pass.
          gl_PointSize = aSize;
          // Cull dead motes in the VERTEX stage. A fragment discard would still
          // pay full rasterisation cost for every one of them.
          if (aAlpha <= 0.0) {
            gl_PointSize = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          }
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uCore;
        uniform float uGlow;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          // Soft round mote. A gentle exponent keeps a real body to the grain —
          // a steep one leaves a hard dot ringed by nothing, which reads as
          // speckle rather than as light.
          float a = pow(1.0 - r, 2.0);
          // The hot centre has to occupy a visible share of the mote, not one
          // pixel of it. This is what carries "glowing" on cream paper, where
          // there is almost no headroom left to brighten into.
          float core = pow(1.0 - r, 3.0) * uGlow;
          vec3 c = mix(uColor, uCore, clamp(core, 0.0, 1.0));
          gl_FragColor = vec4(c, a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
    })
    this.dust = new THREE.Points(this.dustGeo, this.dustMat)
    // Drawn before the mascot and writing no depth, so the mascot always sits
    // on top of its own wake.
    this.dust.renderOrder = -1
    this.dust.frustumCulled = false
    this.scene.add(this.dust)
  }

  private updateTrail(dtSec: number, alpha: number, emitX: number, emitY: number) {
    const c = this.cfg
    this.dustMat.uniforms.uColor.value.set(c.TRAIL_COLOR)
    this.dustMat.uniforms.uCore.value.set(c.TRAIL_CORE_COLOR)
    this.dustMat.uniforms.uGlow.value = c.TRAIL_GLOW
    const wantBlend = c.TRAIL_ADDITIVE ? THREE.AdditiveBlending : THREE.NormalBlending
    if (this.dustMat.blending !== wantBlend) {
      this.dustMat.blending = wantBlend
      this.dustMat.needsUpdate = true
    }

    this.trail.emit(c, emitX, emitY, dtSec, alpha, this.elapsed)
    for (const m of this.trail.sample(c, this.elapsed, alpha, dtSec)) {
      this.dustPos[m.i * 3] = m.x
      this.dustPos[m.i * 3 + 1] = m.y
      this.dustPos[m.i * 3 + 2] = -1
      this.dustAlpha[m.i] = m.alpha
      this.dustSize[m.i] = m.size * this.dpr
    }
    this.dustGeo.attributes.position.needsUpdate = true
    this.dustGeo.attributes.aAlpha.needsUpdate = true
    this.dustGeo.attributes.aSize.needsUpdate = true
  }

  // ── loading ─────────────────────────────────────────────────────────

  /**
   * Loads the mascot. Deliberately NOT awaited by anything on the hero's
   * critical path — the mark must never wait on this, and a failure here must
   * leave the hero exactly as it was.
   */
  async load(url: string) {
    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)
    try {
      const gltf = await loader.loadAsync(url)
      if (this.disposed) return
      const model = gltf.scene

      // Normalise to unit size about its own centre, so placer.scale is
      // literally the on-screen diameter in px under the ortho camera.
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const centre = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      model.position.sub(centre)
      const norm = new THREE.Group()
      norm.add(model)
      norm.scale.setScalar(1 / maxDim)

      this.materials = []
      model.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = m.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
        for (const mm of Array.isArray(mat) ? mat : [mat]) {
          if ((mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            this.materials.push(mm as THREE.MeshStandardMaterial)
          }
        }
      })

      this.spinner.add(norm)
      this.model = norm
      this.patchEyes()
      this.applyLook()
    } catch (err) {
      // No mascot is an acceptable outcome; a broken hero is not.
      console.error('MascotEngine: model failed to load', err)
    } finally {
      draco.dispose()
    }
  }

  // ── configuration ───────────────────────────────────────────────────

  setConfig(cfg: MascotConfig) {
    this.cfg = cfg
    this.applyLook()
    this.layout()
    if (this.reduced) this.drawStatic()
  }

  /** The belt this mascot orbits in — supplies the shared plane and radii. */
  setBelt(belt: SatelliteConfig) {
    this.belt = belt
    this.layout()
    if (this.reduced) this.drawStatic()
  }

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

  /** Fires when the mascot crosses behind/in front of the mark. */
  onDepth(cb: ((behind: boolean) => void) | null) {
    this.depthCb = cb
    cb?.(this.behind)
  }

  /**
   * Styles and re-measures the label. Measured here, never per frame — and the
   * height must come from offsetHeight, not from LABEL_SIZE: a div's box is its
   * line-height, ~1.35x the font size, and assuming otherwise is one of the two
   * bugs that hid in the satellites' own label code.
   */
  private styleLabel() {
    const el = this.labelEl
    if (!el) return
    const c = this.cfg
    if (el.textContent !== c.LABEL_TEXT) el.textContent = c.LABEL_TEXT
    el.style.fontSize = `${c.LABEL_SIZE}px`
    el.style.color = c.LABEL_COLOR
    el.style.letterSpacing = '0.04em'
    // Paper-coloured, so it reads as the word sitting on the sheet rather than
    // as a glow. Four stacked shadows rather than one: a single blurred shadow
    // is too weak to lift text off the logo's dark red at this size.
    const halo = c.LABEL_HALO
    el.style.textShadow =
      halo > 0
        ? [0, 90, 180, 270]
            .map((deg) => {
              const rad = (deg * Math.PI) / 180
              const dx = (Math.cos(rad) * halo).toFixed(1)
              const dy = (Math.sin(rad) * halo).toFixed(1)
              return `${dx}px ${dy}px ${halo.toFixed(1)}px var(--bg, #F6F1E7)`
            })
            .join(', ')
        : 'none'
    this.labelW = el.offsetWidth || c.LABEL_SIZE * 4
    this.labelH = el.offsetHeight || c.LABEL_SIZE * 1.35
  }

  private applyLook() {
    const c = this.cfg
    this.styleLabel()
    this.dir.intensity = c.LIGHT_INTENSITY
    this.scene.environmentIntensity = c.ENV_INTENSITY
    const opaque = c.OPACITY >= 0.999
    for (const m of this.materials) {
      // Only flip transparency when it is actually needed — a transparent PBR
      // material sorts differently and can self-occlude wrongly on a concave
      // model like this one.
      m.transparent = !opaque
      m.opacity = c.OPACITY
      m.depthWrite = opaque
      m.needsUpdate = true
    }
  }

  private sizePx() {
    // window.innerWidth, not this.W: SatelliteEngine keys its own mobile split
    // off the window, and the two must agree or the belts diverge on a
    // viewport where the hero box and the window differ.
    const mobile = window.innerWidth < 640
    return mobile ? this.cfg.MOBILE_SIZE : this.cfg.SIZE
  }

  // ── layout ──────────────────────────────────────────────────────────

  resize() {
    const rect = this.host.getBoundingClientRect()
    const W = Math.max(1, Math.round(rect.width))
    const H = Math.max(1, Math.round(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    this.W = W
    this.H = H
    this.dpr = dpr
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(W, H, false)
    this.camera.left = -W / 2
    this.camera.right = W / 2
    this.camera.top = H / 2
    this.camera.bottom = -H / 2
    this.camera.updateProjectionMatrix()
    this.layout()
    if (this.reduced) this.drawStatic()
  }

  private layout() {
    if (!this.W || !this.H || !this.belt) return
    // window.innerWidth, not this.W: SatelliteEngine keys its own mobile split
    // off the window, and the two must agree or the belts diverge on a
    // viewport where the hero box and the window differ.
    const mobile = window.innerWidth < 640
    const geo = orbitGeometry(this.belt, this.W, this.H, logoScreenBox(this.W, this.H, mobile), mobile)
    this.cx = geo.cx
    this.cy = geo.cy
    this.innerR = geo.innerR
    const frac = mobile ? this.cfg.MOBILE_RADIUS : this.cfg.RADIUS
    // Expressed against the satellites' own outer radius, so the mascot stays
    // outside the bead band no matter how that band is retuned.
    this.orbitR = geo.outerR * frac
  }

  // ── loop ────────────────────────────────────────────────────────────

  start() {
    if (this.running || this.reduced || this.disposed) return
    this.running = true
    this.lastTime = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private frame = (now: number) => {
    if (!this.running) return
    const dt = Math.min((now - this.lastTime) / 16.667, 3)
    this.lastTime = now
    this.step(dt, now)
    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.frame)
  }

  private step(dt: number, now: number) {
    const c = this.cfg
    const belt = this.belt
    if (!belt) return

    this.elapsed += dt / 60

    const entrance = this.active
      ? clamp01((now - this.activeSince) / Math.max(1, c.ENTRANCE_MS))
      : 0
    const alpha = entrance * this.scrollAlpha * (c.ENABLED ? 1 : 0)

    const charge = clamp01(this.chargeSource())
    if (charge > 0) this.shakePhase += c.HOLD_SHAKE_SPEED * dt

    // Same easing the satellites use: a full stop by half charge, so the belt
    // reads as halting decisively rather than still creeping when the mark
    // blows apart.
    const motion = c.HOLD_FREEZE ? Math.max(0, 1 - charge * 2) : 1
    const dir = belt.ORBIT_DIR < 0 ? -1 : 1
    // Keplerian falloff, matching the satellites — without it a wider orbit
    // would sweep at the same angular rate and read as a rigid turntable.
    const speedFactor = Math.sqrt(
      Math.max(8, this.orbitR) > 0 ? this.beltInnerR() / Math.max(this.orbitR, 10) : 1,
    )
    this.angle +=
      dir * motion * belt.ORBIT_SPEED * c.SPEED_SCALE * speedFactor * 0.012 * dt
    this.spin += ((c.SPIN_SPEED * Math.PI) / 180) * (dt / 60)

    this.place(alpha, charge, dt / 60)
  }

  /** Cached by layout() — recomputing the geometry every frame is pure waste. */
  private beltInnerR() {
    return this.innerR
  }

  private place(alpha: number, charge: number, dtSec: number) {
    const c = this.cfg
    const belt = this.belt
    if (!belt || !this.model) {
      this.placer.visible = false
      // The word must not hang in space while the body it names is still
      // loading — that reads as a label with nothing attached to it.
      if (this.labelEl) this.labelEl.style.opacity = '0'
      this.labelBox = null
      return
    }

    const tiltRad = ((belt.TILT + c.TILT_OFFSET) * Math.PI) / 180
    const bob = c.BOB_PX
      ? Math.sin((this.elapsed / Math.max(0.1, c.BOB_SECONDS)) * Math.PI * 2) * c.BOB_PX
      : 0
    const q = projectOrbit(
      belt,
      this.cx,
      this.cy,
      this.orbitR,
      this.angle + (c.PHASE * Math.PI) / 180,
      c.HEIGHT + bob,
      tiltRad,
    )

    if (charge > 0.01 && c.HOLD_SHAKE_PX > 0) {
      const amp = charge * c.HOLD_SHAKE_PX
      q.x += Math.sin(this.shakePhase) * amp
      q.y += Math.cos(this.shakePhase * 1.31) * amp
    }

    this.lastScreen = { x: q.x, y: q.y, z: q.z, scale: q.scale }

    const visible = alpha > 0.001
    this.placer.visible = visible

    // Screen px (y down, origin top-left) -> the ortho camera's centred space.
    const X = q.x - this.W / 2
    const Y = this.H / 2 - q.y
    this.placer.position.set(X, Y, 0)

    // Beyond the perspective divide, matching SAT_DEPTH_SCALE so the mascot
    // and the beads share one depth cue rather than two different ones.
    const depthScale = 1 + (q.scale - 1) * (1 + c.DEPTH_SCALE * 4)
    const diameterPx = this.sizePx() * Math.max(0.15, depthScale)
    const radiusPx = diameterPx / 2
    this.placer.scale.setScalar(diameterPx)

    this.tilter.rotation.z = (c.SPIN_TILT * Math.PI) / 180
    this.spinner.rotation.y = this.spin

    // Motes are shed at the mascot's own position, so the wake traces the real
    // orbit rather than an idealised one — the hold-shake jitter above is
    // included on purpose.
    this.updateTrail(dtSec, alpha, X, Y)
    this.updateEyes(dtSec, charge, diameterPx, alpha)
    this.placeLabel(q, radiusPx, alpha)

    const behind = q.z >= 0
    if (behind !== this.behind) {
      this.behind = behind
      this.depthCb?.(behind)
    }
  }

  /**
   * The mascot's word, positioned exactly as a satellite's is.
   *
   * Reuses placeLabels() from the satellites rather than reimplementing the
   * edge fade — a word sliced by the frame edge reads as a rendering bug, and
   * that rule already exists and is already tested. Passing a single candidate
   * gets the fade with no collision handling, which is correct here: there is
   * only one mascot label.
   *
   * ⚠️ It cannot collide-suppress against the SATELLITES' labels, though —
   * those are placed by a different engine, in a different pass. See the
   * measured overlap figure in the spec before assuming this is fine at other
   * geometries.
   */
  private placeLabel(q: { x: number; y: number; z: number }, radiusPx: number, alpha: number) {
    const el = this.labelEl
    if (!el) return
    const c = this.cfg
    let a = c.LABEL_ENABLED ? alpha : 0

    // A mascot on the far side, currently behind the mark, must not have its
    // word floating over the logo's face. Same rule, same numbers, as the
    // satellites use.
    if (q.z >= 0 && Math.abs(q.x - this.cx) < this.W * 0.09 && Math.abs(q.y - this.cy) < this.H * 0.16) {
      a *= 0.15
    }

    // Offset from the body's EDGE, not its centre: unlike a 4px bead, the
    // mascot has real on-screen size that changes with depth, and a fixed
    // centre offset would bury the word inside it at closest approach.
    const lx = q.x + radiusPx + c.LABEL_OFFSET
    const ly = q.y - c.LABEL_SIZE / 2

    const [p] = placeLabels(
      [{ index: 0, x: lx, y: ly, w: this.labelW, h: this.labelH, z: q.z, alpha: a }],
      this.W,
      this.H,
      EDGE_FADE_PX,
    )
    el.style.opacity = p.opacity.toFixed(3)
    el.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`

    // Published for SatelliteEngine to treat as occupied space. Null while
    // effectively invisible, so a faded-out word does not silently suppress a
    // satellite's — the same rule placeLabels applies to its own candidates.
    this.labelBox =
      p.opacity > 0.05
        ? { l: lx, r: lx + this.labelW, t: ly, b: ly + this.labelH }
        : null
  }

  /** The mascot's current label box, for another layer's collision pass. */
  getLabelBox(): LabelBox | null {
    return this.labelBox
  }

  // ── face display ────────────────────────────────────────────────────

  /**
   * Injects the LED face display into the mascot's own material.
   *
   * Same idiom as shatterMaterial.ts's tt_hatchify/tt_shine on the logo:
   * onBeforeCompile, a helper block prepended to the fragment shader, and one
   * hook line replacing a stock chunk. See ./eyes.ts for why this draws in the
   * material rather than on a quad (the faceplate is a dome, not a plane).
   */
  private patchEyes() {
    // Normalisation for the quantized attribute space — see EYES_VERTEX_CHUNK.
    const box = new THREE.Box3()
    this.spinner.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox
      if (bb) box.union(bb)
    })
    const c = box.getCenter(new THREE.Vector3())
    const s = box.getSize(new THREE.Vector3())
    ;(this.eyeUniforms.uObjCenter.value as THREE.Vector3).copy(c)
    this.eyeUniforms.uObjScale.value = Math.max(s.x, s.y, s.z) / 2 || 1

    for (const m of this.materials) {
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.eyeUniforms)

        // Publish object-space position. `position` is pre-transform, which is
        // exactly what the display mask wants — it is stable under the spin.
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${EYES_VERTEX_CHUNK}`)
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n  vTtObjPos = (position - uObjCenter) / uObjScale;',
          )

        const HOOK = '#include <dithering_fragment>'
        // A .replace() whose needle is absent is a SILENT no-op — it compiles
        // clean, throws nothing, and the feature just never appears. That is
        // exactly how this shader failed the first time. Assert instead.
        if (!shader.fragmentShader.includes(HOOK)) {
          console.error('MascotEngine: eye-display hook not found in the fragment shader')
          return
        }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${EYES_FRAGMENT_CHUNK}`)
          // After lighting and tone mapping: the display is emissive and must
          // not be shaded by the scene.
          .replace(
            HOOK,
            `float ttCov = 0.0;
  gl_FragColor.rgb = tt_eyes(gl_FragColor.rgb, ttCov);
  ${HOOK}`,
          )
        m.userData.ttEyeShader = shader
      }
      m.needsUpdate = true
    }
  }

  /** Expressions the glance beat picks from, in rough order of how often. */
  private static readonly GLANCE_POOL = [
    'blink', 'blink', 'happy', 'wink', 'squint',
    'lookLeft', 'lookRight', 'lookUpLeft', 'lookUpRight', 'happy',
  ]

  /**
   * One frame of the face display.
   *
   * The owner kept SPIN_SPEED 113 (a full turn every 3.2s) knowing expressions
   * would only flash past — so the sweep IS the beat: each time the face turns
   * toward the viewer the mascot plays ONE expression and returns to neutral as
   * it turns away. Firing on a timer instead would spend most expressions
   * pointing at the back of the hero.
   */
  private updateEyes(dtSec: number, charge: number, diameterPx: number, alpha: number) {
    const u = this.eyeUniforms
    u.uEyesOn.value = alpha

    // Scanlines are moire below ~40px of body: 7 lines over an 18px-tall eye.
    // Faded in with size rather than switched, so it cannot pop.
    u.uScanline.value = diameterPx > 40 ? Math.min(9, (diameterPx - 40) / 12) : 0

    // The face is +Z in model space and only the spin turns it, so cos(spin) is
    // the facing term. > 0 means the display is toward the viewer at all.
    const facing = Math.cos(this.spin)
    const isFacing = facing > 0.30
    if (isFacing && !this.wasFacing) {
      this.glanceT = 0
      this.glanceExpr =
        MascotEngine.GLANCE_POOL[Math.floor(Math.random() * MascotEngine.GLANCE_POOL.length)]
    }
    this.wasFacing = isFacing
    // The beat runs a little shorter than the face-forward window so it lands
    // and resolves while it can actually be seen.
    if (this.glanceT < 1) this.glanceT = Math.min(1, this.glanceT + dtSec / 0.62)

    if (this.forcedExpr) {
      this.setExpression(this.forcedExpr)
      return
    }

    if (charge > 0.02) {
      // Press-and-hold: eyes widen as the charge builds, then squeeze shut at
      // the peak — riding the same gesture the body already reacts to.
      if (charge < 0.7) this.setExpression('neutral', 'wide', charge / 0.7)
      else this.setExpression('wide', 'blink', (charge - 0.7) / 0.3)
      return
    }

    // Triangle: neutral -> expression -> neutral across the beat.
    const t = this.glanceT
    const k = t >= 1 ? 0 : t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55
    this.setExpression('neutral', this.glanceExpr, k)
  }

  /** Drive the display: set the expression, optionally blended toward another. */
  setExpression(name: string, blendTo?: string, t = 0) {
    const a = EXPRESSIONS[name] ?? EXPRESSIONS.neutral
    const b = blendTo ? (EXPRESSIONS[blendTo] ?? a) : a
    const k = blendTo ? Math.min(1, Math.max(0, t)) : 0
    this.writeEyes(lerpEye(a.left, b.left, k), lerpEye(rightOf(a), rightOf(b), k))
  }

  private writeEyes(l: EyeShape, r: EyeShape) {
    packEye(l, this.eyeUniforms.uEyeL.value as Float32Array, 0)
    packEye(r, this.eyeUniforms.uEyeR.value as Float32Array, 0)
  }

  /**
   * Reduced motion: one frame, no loop. The site honours this preference in 19
   * places; a visitor who asked for stillness must not get an orbiting mascot.
   * The frame must also be genuinely non-empty — an earlier effect on this
   * project shipped a "static frame" that was very nearly blank.
   */
  private drawStatic() {
    if (!this.W || !this.H || !this.belt) return
    this.angle = 0
    this.spin = 0
    // dtSec 0: nothing is shed and nothing drifts. A motion wake on a frame
    // that is deliberately motionless would be a lie about what is happening.
    this.place(1, 0, 0)
    this.renderer.render(this.scene, this.camera)
  }

  // ── teardown ────────────────────────────────────────────────────────

  /**
   * @param releaseContext only the caller knows whether the canvas element is
   * being thrown away too. forceContextLoss() PERMANENTLY poisons a canvas —
   * calling it on one that gets reused makes the next rebuild crash outright
   * rather than leak slowly (see the 2026-08-10 note in _HANDOFF/HANDOFF.md).
   */
  dispose(releaseContext = false) {
    this.disposed = true
    this.stop()
    window.removeEventListener('scroll', this.onScroll)
    this.depthCb = null
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[]
      for (const mm of Array.isArray(mat) ? mat : [mat]) {
        const std = mm as THREE.MeshStandardMaterial
        std.map?.dispose()
        std.normalMap?.dispose()
        std.roughnessMap?.dispose()
        std.metalnessMap?.dispose()
        mm.dispose()
      }
    })
    this.envRT?.dispose()
    this.scene.environment = null
    this.renderer.dispose()
    if (releaseContext) this.renderer.forceContextLoss()
  }
}
