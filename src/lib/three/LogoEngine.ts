import * as THREE from 'three'
import { CALIB, videoCoverScale, visibleHeight } from './calibration'
import { loadLogo } from './loadLogo'
import { makePencilMaterials, type LogoMaterials } from './materials'
import { partitionForShatter } from './shatter/partition'
import { makeShatterUniforms, patchForShatter } from './shatter/shatterMaterial'
import { ShatterController } from './shatter/ShatterController'
import { DEFAULT_SEPARATION, type SeparationConfig, type ShatterEvent, type ShatterUniforms } from './shatter/types'
import { buildEmbers, buildIgnitionCage } from './ignition/cage'
import { IgnitionController } from './ignition/IgnitionController'
import {
  makeCageMaterial,
  makeEmberMaterial,
  makeIgnitionUniforms,
  patchSkinForIgnition,
} from './ignition/ignitionMaterial'
import {
  DEFAULT_IGNITION,
  type IgnitionConfig,
  type IgnitionEvent,
  type IgnitionUniforms,
} from './ignition/types'

const DEG = Math.PI / 180
const IDLE_W = (Math.PI * 2) / 14 // one revolution ≈ 14 s, +Y = CCW from above (spec §7)

/**
 * Framework-agnostic three.js engine for the hero logo. Ported from the
 * owner-approved preview: idle counter-clockwise spin, cursor deflection with
 * spring return, 360° drag with inertia, keyboard rotation, pencil-matcap
 * materials. React just mounts/disposes it.
 */
export class LogoEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private group: THREE.Group | null = null
  private materials: LogoMaterials | null = null

  private hemi: THREE.HemisphereLight
  private dir: THREE.DirectionalLight

  private raf = 0
  private prev = performance.now()
  private disposed = false

  // interaction state
  private spinY = 0
  private vel = 0
  private dragging = false
  private lastX = 0
  private idleTimer = 0
  private tilt = { x: 0, z: 0, tx: 0, tz: 0 }
  private interactive = true

  // calibration inputs, kept so resize() can re-apply it (the cover correction
  // depends on the viewport aspect, which changes as the window changes)
  private baseSizeY = 0
  private heightFrac = CALIB.HEIGHT_FRAC
  private isMobileScale = false

  // hold-to-shatter
  private shatter: ShatterController | null = null
  private shatterUniforms: ShatterUniforms | null = null
  private bodyMaterials: THREE.Material[] = []
  private pointerActive = false
  private baseY = 0
  private wantArmed = false
  private downX = 0
  private downY = 0

  // cursor-over-the-mark, for the "click & hold" hint
  private raycaster = new THREE.Raycaster()
  private hoverNdc = new THREE.Vector2()
  private logoHover = false
  private hoverCheckedAt = 0
  private hoverX = 0
  private hoverY = 0
  /** no pointer has been seen yet — do not report hover from a phantom 0,0 */
  private hoverSeen = false
  private hoverListeners = new Set<(over: boolean) => void>()

  // electrical wireframe ignition
  private ignition: IgnitionController | null = null
  private ignitionUniforms: IgnitionUniforms | null = null
  private cage: THREE.LineSegments | null = null
  private cageMaterial: THREE.ShaderMaterial | null = null
  private embers: THREE.Points | null = null
  private emberMaterial: THREE.ShaderMaterial | null = null
  private bodyGroup: THREE.Group | null = null
  private bodySurfaceMats: THREE.Material[] = []
  private wantIgnition = false
  private wantOverlay = false
  /** See setExternalChargeSource. Returns 0 until something publishes one. */
  private externalChargeSource: () => number = () => 0
  /** counts down to the next hold pulse while the skin is shedding */
  private pulseTimer = 0
  /** true once the seed/cue/done sequence has completed by ANY path */
  private ignitionResolved = false
  private pendingIgnitionListeners = new Set<(e: IgnitionEvent) => void>()

  constructor(
    private canvas: HTMLCanvasElement,
    private config: SeparationConfig = DEFAULT_SEPARATION,
    private ignitionConfig: IgnitionConfig = DEFAULT_IGNITION,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(CALIB.CAMERA_FOV, 1, 0.1, 50)
    this.camera.position.set(0, 0, CALIB.CAMERA_Z)

    this.hemi = new THREE.HemisphereLight(0xfff8ec, 0xcfc5b2, 1.1)
    this.dir = new THREE.DirectionalLight(0xffffff, 1.6)
    this.dir.position.set(1.5, 2, 2.5)
    this.scene.add(this.hemi, this.dir)
  }

  async load() {
    const group = await loadLogo()
    if (this.disposed) return

    this.materials = makePencilMaterials()
    this.group = group

    // calibrate: scale so rendered height = HEIGHT_FRAC of viewport, offset for CENTER_Y
    // (narrow/portrait viewports use a smaller MOBILE_HEIGHT_FRAC — see calibration.ts)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
    const heightFrac = isMobile ? CALIB.MOBILE_HEIGHT_FRAC : CALIB.HEIGHT_FRAC
    const visH = visibleHeight()
    const box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    // Kept so the calibration can be re-applied on resize: once the group is
    // scaled, Box3.setFromObject would report the SCALED height and compound.
    this.baseSizeY = size.y
    this.heightFrac = heightFrac
    this.isMobileScale = isMobile
    this.applyCalibration()

    const set = this.materials
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh
        mesh.material = set[mesh.name as keyof LogoMaterials] || set['logo-black']
      }
    })

    this.baseY = group.position.y

    // Hold-to-shatter. Skipped entirely under reduced motion, which also avoids
    // generating the ~2.8 MB of per-vertex attributes.
    if (this.interactive) {
      // The intact translucent body that stays once the skin has fully shed.
      // Built from CLONED geometry BEFORE partitioning, because partition
      // replaces the originals and disposes them.
      const body = this.buildInnerBody(group)

      // Partition only when the interaction is on: it costs ~2.8 MB of vertex
      // attributes. uCenter/uSpread are read solely by the vertex patch, which
      // is skipped in the same case, so the zero fallbacks are never sampled.
      const part = this.config.ENABLED ? partitionForShatter(group, this.config) : null
      const u = makeShatterUniforms(
        part?.center ?? new THREE.Vector3(),
        part ? part.height * this.config.SPREAD_FRAC : 0,
        this.config,
      )

      Object.values(set).forEach((m) => {
        // The skin is glass: sheer, and both sides visible as panels turn.
        m.side = THREE.DoubleSide
        m.transparent = true
        m.opacity = this.config.SKIN_OPACITY
        m.depthWrite = false
        patchForShatter(m, u, this.config)
      })

      // skin draws over the body; body surfaces under their own edges
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.renderOrder = 2
      })
      // Ignition. Built HERE — before the inner body is parented — so the cage
      // traverses only the skin. Doing it after `group.add(body)` would also
      // wireframe the body's cloned geometry and double the segment count.
      // Skipped if the sequence has already been forced through (load raced a
      // reduced-motion or failure path) — building a controller now would
      // replay seed/cue/done a second time.
      if (this.ignitionConfig.ENABLED && !this.ignitionResolved) {
        group.updateMatrixWorld(true)
        const inv = new THREE.Matrix4().copy(group.matrixWorld).invert()
        const localBox = new THREE.Box3()
        group.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh || !mesh.geometry) return
          mesh.geometry.computeBoundingBox()
          const bb = mesh.geometry.boundingBox
          if (!bb) return
          localBox.union(
            bb.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)),
          )
        })
        const centre = localBox.getCenter(new THREE.Vector3())
        const logoHeight = heightFrac * visH

        const corners: THREE.Vector3[] = []
        for (let i = 0; i < 8; i++) {
          corners.push(
            new THREE.Vector3(
              i & 1 ? localBox.max.x : localBox.min.x,
              i & 2 ? localBox.max.y : localBox.min.y,
              i & 4 ? localBox.max.z : localBox.min.z,
            ),
          )
        }
        // The sphere is sized off the logo's own radius, so SPHERE_SCALE reads
        // as "this much bigger than the mark" regardless of viewport.
        const logoRadius =
          Math.max(...corners.map((c) => c.distanceTo(centre))) || logoHeight * 0.5

        const iu = makeIgnitionUniforms(this.ignitionConfig, logoHeight, centre, logoRadius)
        this.ignitionUniforms = iu

        // AFTER patchForShatter, and composing rather than assigning — three
        // exposes one onBeforeCompile per material, so the order matters and
        // the composition is what keeps the hatch, wash and displacement alive.
        Object.values(set).forEach((m) => patchSkinForIgnition(m, iu))

        const density = isMobile
          ? this.ignitionConfig.CAGE_DENSITY_MOBILE
          : this.ignitionConfig.CAGE_DENSITY
        this.cageMaterial = makeCageMaterial(iu)
        this.cage = buildIgnitionCage(group, this.ignitionConfig, density, this.cageMaterial)
        if (this.cage) group.add(this.cage)

        if (this.cage && this.ignitionConfig.EMBER_ENABLED) {
          this.emberMaterial = makeEmberMaterial(iu)
          this.embers = buildEmbers(this.cage, this.ignitionConfig, this.emberMaterial)
          if (this.embers) group.add(this.embers)
        }

        // Reach: furthest point the charge must travel to clear the cage. During
        // the overlay the cage is a bloomed polygon far larger than the logo, so
        // the bloomed extent — not the logo's — is what the front has to cross.
        const seed = iu.uSeed.value
        let reach = Math.max(...corners.map((c) => c.distanceTo(seed)))
        if (this.ignitionConfig.OVERLAY_ENABLED) {
          // uBloomR is the polygon's INRADIUS: makeIgnitionUniforms premultiplies
          // by cos(pi/N) so tt_polyR's corner peak of 1/cos(pi/N) lands exactly on
          // the requested total extent. Divide it back out to get the corner
          // distance the front actually has to cross, and measure it from the seed
          // like the logo term above, since SEED_OFFSET_* moves the origin.
          const cornerR = iu.uBloomR.value / Math.cos(Math.PI / this.ignitionConfig.POLY_SIDES)
          reach = Math.max(reach, cornerR + seed.distanceTo(iu.uCentre.value))
        }
        if (!(reach > 0)) reach = logoHeight

        this.ignition = new IgnitionController(iu, reach, this.ignitionConfig)
        this.pendingIgnitionListeners.forEach((cb) => this.ignition?.onIgnition(cb))
        this.pendingIgnitionListeners.clear()
        this.ignition.onIgnition((e) => {
          if (e === 'done') this.teardownIgnition()
        })
        // Calls that arrived before load() resolved are honoured here rather
        // than dropped — see startIgnition(). Overlay first, so a load that
        // finished between the two signals still plays them in order.
        if (this.wantOverlay) this.ignition.startOverlay()
        if (this.wantIgnition) this.ignition.start()
      }

      // parented to the group, so it inherits the idle spin, tilt and shake
      group.add(body)
      this.bodyGroup = body
      this.shatterUniforms = u

      // No controller when disabled (separationEnabled: false) or under reduced
      // motion — nothing can charge, so nothing can move.
      if (part) {
        this.shatter = new ShatterController(u, heightFrac * visH, this.config)
        this.shatter.setArmed(this.wantArmed)
      }
    }

    this.scene.add(group)
    this.resize()
    this.attach()
    this.prev = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  getMesh() {
    return this.group
  }

  /**
   * The complete translucent logo that sits inside the skin and never moves.
   * Once every face has separated this is all that remains — a ghost of the
   * mark, its surfaces faint and its silhouette drawn in.
   */
  private buildInnerBody(group: THREE.Group): THREE.Group {
    const bodyMats = makePencilMaterials()
    Object.values(bodyMats).forEach((m) => {
      m.transparent = true
      m.opacity = this.config.BODY_OPACITY
      m.depthWrite = false
      m.side = THREE.DoubleSide
      // These are unpatched matcaps with otherwise identical parameters to the
      // patched skin, so without a distinct key three can hand them the skin's
      // compiled program — hatch, light wash, displacement and all.
      m.customProgramCacheKey = () => 'tt-body-1'
    })
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x2b2a27,
      transparent: true,
      opacity: this.config.BODY_EDGE_OPACITY,
      depthWrite: false,
    })
    this.bodyMaterials = [...Object.values(bodyMats), edgeMat]
    // Kept separately: ignition animates ONLY the surfaces (the dark mass),
    // never the drawn edges.
    this.bodySurfaceMats = Object.values(bodyMats)

    const body = new THREE.Group()
    group.traverse((o) => {
      const src = o as THREE.Mesh
      if (!src.isMesh) return
      const geo = src.geometry.clone()

      // At BODY_OPACITY 0 the surfaces are fully invisible, so they would
      // normally be skipped rather than paying to draw nothing — what's left is
      // a pure wireframe of the mark.
      //
      // Ignition needs them anyway: it raises them to DARK_MASS_OPACITY for the
      // duration of the transition, because red on light paper reads as a red
      // line, not as glow, unless it has something dark to burn against
      // (spec §3.3). They are returned to BODY_OPACITY at `done`.
      const needSurfaces = this.config.BODY_OPACITY > 0 || this.ignitionConfig.ENABLED
      if (needSurfaces) {
        const surf = new THREE.Mesh(
          geo,
          bodyMats[src.name as keyof LogoMaterials] || bodyMats['logo-black'],
        )
        surf.position.copy(src.position)
        surf.quaternion.copy(src.quaternion)
        surf.scale.copy(src.scale)
        surf.renderOrder = 0
        body.add(surf)
      }

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, this.config.BODY_EDGE_ANGLE),
        edgeMat,
      )
      edges.position.copy(src.position)
      edges.quaternion.copy(src.quaternion)
      edges.scale.copy(src.scale)
      edges.renderOrder = 1
      body.add(edges)

      // EdgesGeometry has copied what it needs, so the clone is dead weight
      // once nothing else references it.
      if (!needSurfaces) geo.dispose()
    })
    return body
  }

  /**
   * Disable pointer/drag reactivity AND the idle spin (reduced motion).
   *
   * `prefers-reduced-motion` asks for no continuous animation at all, so the
   * mark is held at its frontal pose rather than left turning — a perpetually
   * rotating element is exactly what the preference exists to stop.
   *
   * resetPose() here is the belt to tick()'s braces: the reduced-motion path
   * reaches the mesh through finishIgnitionNow(), which — unlike
   * startIgnition() — does NOT reset the pose, so a caller that disables
   * interactivity after some spin has already accumulated would otherwise
   * freeze the mark at that arbitrary angle.
   */
  setInteractive(v: boolean) {
    this.interactive = v
    if (!v) this.resetPose()
  }

  /**
   * Arm hold-to-shatter. Called once the mesh is actually on screen so a press
   * during the sketch-draw video can't trigger it.
   *
   * Records the intent even if the mesh has not finished loading — `load()`
   * applies it when the controller is created. Without that, a slow load
   * (cold cache, Draco wasm) that finishes after the caller arms would
   * silently leave the interaction dead.
   */
  setShatterArmed(v: boolean) {
    this.wantArmed = v
    this.shatter?.setArmed(v)
  }

  /**
   * Publish a separation charge driven from outside the pointer gesture.
   *
   * Spec §4.4: during the SAMSARA freeze the mark shakes through its own
   * separation, driven by the scroll beats rather than by a held finger. The
   * satellites and the mascot already read a published number and jitter
   * themselves; this is the mark's equivalent input.
   *
   * A pull-based getter, not a value, for the reason `setChargeSource` on
   * MascotEngine is: it changes every frame, and pushing it through React at
   * 60Hz to carry one number the render loop can simply ask for is pure
   * overhead. Indirect through the caller's own ref so a source published after
   * this engine was built is still found — the same race the 2026-08-09 review
   * caught on setShatterArmed.
   */
  setExternalChargeSource(get: (() => number) | null) {
    this.externalChargeSource = get ?? (() => 0)
  }

  /**
   * Begin the electrical wireframe transition.
   *
   * Records the intent even if the mesh has not finished loading — `load()`
   * starts the controller when it creates one. Without that, a slow load (cold
   * cache, Draco wasm) finishing after the caller starts would leave the bridge
   * dead and, because `armed` and `onLive` both hang off its `done` event, the
   * hero permanently inert with no console error. This is the same shape as the
   * setShatterArmed bug the 2026-08-09 review found.
   */
  /**
   * Bring the cage up as a sphere over the still-playing sketch video.
   * Records the intent if the mesh has not loaded yet, exactly as
   * startIgnition() does.
   */
  startOverlay() {
    this.wantOverlay = true
    this.ignition?.startOverlay()
  }

  startIgnition() {
    this.wantIgnition = true
    this.resetPose()
    if (this.ignition) {
      this.ignition.start()
      return
    }
    // Turned off outright: consumers still need the full sequence.
    if (!this.ignitionConfig.ENABLED) this.finishIgnitionNow()
  }

  /**
   * Return the mark to frontal at the moment the bridge begins.
   *
   * The engine renders from load(), which is several seconds before the sketch
   * video ends, and the idle spin starts 1.2s after that — so by the handoff the
   * mesh has quietly turned ~150° behind an invisible canvas. The old 0.6s
   * crossfade hid it; the ignition does not, and an oblique cage appearing under
   * a frontal video frame is exactly the cut the bridge exists to avoid.
   *
   * Zeroing idleTimer also holds the mark still while the charge crosses it, so
   * the idle rotation resumes during settle rather than fighting the effect.
   */
  private resetPose() {
    this.spinY = 0
    this.vel = 0
    this.idleTimer = 0
  }

  /**
   * Force the sequence to completion. The caller uses this when no controller
   * will ever exist — reduced motion, or `load()` rejecting — so that `done`
   * still fires and the hero does not sit inert behind a transition that never
   * finishes.
   */
  finishIgnitionNow() {
    if (this.ignition) {
      this.ignition.finishNow()
      return
    }
    if (this.ignitionResolved) return
    this.ignitionResolved = true
    const cbs = [...this.pendingIgnitionListeners]
    this.pendingIgnitionListeners.clear()
    for (const e of ['seed', 'cue', 'done'] as const) cbs.forEach((cb) => this.safeCall(cb, e))
  }

  /**
   * Fire one charge-only pulse. Normally driven automatically from the hold in
   * tick(); exposed so the dev bench can tune PULSE_MS in isolation.
   */
  pulseIgnition() {
    // tick() only advances a pulse when PULSE_ENABLED, so firing one with the
    // flag off would raise uGlobalFade to 1 and then never bring it back down —
    // the cage would stay fully lit forever. Dev-bench only, but it would
    // mislead exactly the tuning the bench exists for.
    if (!this.ignitionConfig.PULSE_ENABLED) return
    this.ignition?.pulse()
  }

  /** Subscribe before or after load(); early subscriptions are replayed onto the controller. */
  onIgnition(cb: (e: IgnitionEvent) => void): () => void {
    if (this.ignition) return this.ignition.onIgnition(cb)
    // Already completed via the immediate path — replay, so a late subscriber
    // is not left waiting on an event that has been and gone.
    if (this.ignitionResolved) {
      for (const e of ['seed', 'cue', 'done'] as const) this.safeCall(cb, e)
      return () => {}
    }
    this.pendingIgnitionListeners.add(cb)
    // load() migrates pending listeners onto the controller and clears this set,
    // so an unsubscribe that only deleted from the set would silently stop
    // working the moment the mesh finished loading — the same "call quietly does
    // nothing" shape as the setShatterArmed bug. Re-target the controller if one
    // has appeared by the time the caller unsubscribes.
    return () => {
      this.pendingIgnitionListeners.delete(cb)
      this.ignition?.offIgnition(cb)
    }
  }

  private safeCall(cb: (e: IgnitionEvent) => void, e: IgnitionEvent) {
    try {
      cb(e)
    } catch (err) {
      console.error(`LogoEngine: ignition listener threw on "${e}"`, err)
    }
  }

  /**
   * Bridge is over — hand the skin back and put the cage away.
   *
   * The cage is HIDDEN, not disposed. Hold pulses reuse it for the rest of the
   * session, so freeing it here would mean rebuilding ~59k segments on the first
   * press. It costs nothing while hidden: tick() drops `visible` to false, so it
   * is not drawn at all. The geometry is released in dispose().
   */
  private teardownIgnition() {
    this.ignitionResolved = true
    if (this.ignitionUniforms) {
      this.ignitionUniforms.uWakeActive.value = 0
      this.ignitionUniforms.uGlobalFade.value = 0
    }
    // Dark mass off; the ghost body returns to whatever the CMS asked for.
    this.bodySurfaceMats.forEach((m) => {
      m.opacity = this.config.BODY_OPACITY
      m.visible = this.config.BODY_OPACITY > 0
    })
  }

  /** Discrete shatter transitions. Nothing subscribes yet — see spec §7.4. */
  onShatter(cb: (e: ShatterEvent) => void): () => void {
    return this.shatter?.onShatter(cb) ?? (() => {})
  }

  /** Continuous 0..1 charge, pulled rather than pushed to avoid per-frame allocation. */
  getCharge(): number {
    return this.shatter?.getCharge() ?? 0
  }

  private attach() {
    // deflect follows the cursor anywhere; drag only starts on the canvas so it
    // never hijacks clicks on the header / nav / switch elsewhere on the page
    window.addEventListener('pointermove', this.onMove)
    this.canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onCancel)
    window.addEventListener('blur', this.onCancel)
    this.canvas.addEventListener('keydown', this.onKey)
    this.canvas.tabIndex = 0
  }

  private onMove = (e: PointerEvent) => {
    if (!this.interactive) return
    const nx = (e.clientX / window.innerWidth) * 2 - 1
    const ny = (e.clientY / window.innerHeight) * 2 - 1
    this.tilt.tx = ny * (12 * DEG) // deflect up to ±12°
    this.tilt.tz = -nx * (12 * DEG) * 0.5

    // A press starts as a potential charge and only becomes a drag once the
    // pointer travels past the threshold (spec §7.1). With no controller
    // (reduced motion, or separationEnabled: false) the same threshold is
    // applied here instead, so drag-to-spin keeps its usual feel.
    if (this.pointerActive && !this.dragging) {
      const becameDrag = this.shatter
        ? this.shatter.pointerMove(e.clientX, e.clientY)
        : this.pastDragThreshold(e.clientX, e.clientY)
      if (becameDrag) {
        this.dragging = true
        this.lastX = e.clientX
      }
    }

    if (this.dragging) {
      const dx = e.clientX - this.lastX
      this.lastX = e.clientX
      this.spinY += dx * 0.01
      this.vel = dx * 0.01
      this.idleTimer = 0
    }

    this.hoverX = e.clientX
    this.hoverY = e.clientY
    this.hoverSeen = true
  }

  /**
   * Tracks whether the cursor is over the mark itself, so the hero can offer a
   * "click & hold" hint — the separation and ignition are undiscoverable
   * otherwise.
   *
   * Raycast rather than a bounding box: the mark is a knot with large holes, and
   * a box would fire over blank paper well away from any geometry.
   *
   * Driven from tick() against the LAST KNOWN pointer position, deliberately not
   * from the pointermove handler. Two reasons:
   *
   * 1. Throttling inside the event handler DROPS samples. A pointer that moves
   *    onto the mark and stops dead can have its final move swallowed, leaving
   *    hover false while the cursor sits right on the logo — which is exactly
   *    the case this hint exists for.
   * 2. The mark rotates. Whether the cursor is over it changes even when the
   *    pointer has not moved at all, and only a polled check catches that.
   *
   * Still rate-limited: a hit runs triangle tests against ~19.7k triangles, and
   * the consumer debounces by several hundred ms anyway.
   */
  private updateLogoHover() {
    if (!this.hoverSeen || this.hoverListeners.size === 0) return

    const now = performance.now()
    if (now - this.hoverCheckedAt < 100) return
    this.hoverCheckedAt = now

    const group = this.group
    if (!group) return

    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    this.hoverNdc.set(
      ((this.hoverX - rect.left) / rect.width) * 2 - 1,
      -((this.hoverY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.hoverNdc, this.camera)
    // Meshes only. The group also holds the ignition cage (LineSegments) and its
    // embers (Points), and three tests those against a distance threshold rather
    // than real geometry — they would report hits in empty space.
    const over = this.raycaster
      .intersectObject(group, true)
      .some((h) => (h.object as THREE.Mesh).isMesh)

    if (over === this.logoHover) return
    this.logoHover = over
    this.hoverListeners.forEach((cb) => {
      try {
        cb(over)
      } catch (err) {
        console.error('LogoEngine: logo-hover listener threw', err)
      }
    })
  }

  /** Fires with true when the cursor moves onto the mark, false when it leaves. */
  onLogoHover(cb: (over: boolean) => void): () => void {
    this.hoverListeners.add(cb)
    return () => {
      this.hoverListeners.delete(cb)
    }
  }

  /** Same squared-distance test as ShatterController.pointerMove, used when there is no controller to ask. */
  private pastDragThreshold(x: number, y: number): boolean {
    const dx = x - this.downX
    const dy = y - this.downY
    return dx * dx + dy * dy > this.config.DRAG_THRESHOLD_PX * this.config.DRAG_THRESHOLD_PX
  }

  private onDown = (e: PointerEvent) => {
    if (!this.interactive) return
    this.pointerActive = true
    this.dragging = false
    this.lastX = e.clientX
    this.downX = e.clientX
    this.downY = e.clientY
    this.shatter?.pointerDown(e.clientX, e.clientY)
  }

  private onUp = () => {
    this.dragging = false
    this.pointerActive = false
    this.shatter?.pointerUp()
  }

  /** pointercancel / window blur — never leave a blast stuck open. */
  private onCancel = () => {
    this.dragging = false
    this.pointerActive = false
    this.shatter?.cancel()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') this.spinY -= 15 * DEG
    else if (e.key === 'ArrowRight') this.spinY += 15 * DEG
    else return
    this.idleTimer = 0
    e.preventDefault()
  }

  private tick = (t: number) => {
    const dt = Math.min(0.05, (t - this.prev) / 1000)
    this.prev = t

    // `interactive` gates the entire rotation model, not just the pointer
    // handlers that read it elsewhere — under reduced motion the idle spin
    // below would otherwise keep turning the mark forever, against the
    // preference the visitor set at the OS level.
    if (!this.dragging && this.interactive) {
      if (Math.abs(this.vel) > 0.0004) {
        this.spinY += this.vel
        this.vel *= 0.94 // inertia
        this.idleTimer = 0
      } else {
        this.idleTimer += dt
        if (this.idleTimer > 1.2) this.spinY += IDLE_W * dt // resume CCW idle
      }
    }
    this.tilt.x += (this.tilt.tx - this.tilt.x) * 0.06 // spring
    this.tilt.z += (this.tilt.tz - this.tilt.z) * 0.06
    if (this.group) this.group.rotation.set(this.tilt.x, this.spinY, this.tilt.z)

    // the light wash sweeps continuously, blast or no blast
    if (this.shatterUniforms) this.shatterUniforms.uTime.value += dt

    // The cage writhes and sparks off its own clock, which must keep running
    // through the overlay, the charge and every pulse.
    if (this.ignitionUniforms) this.ignitionUniforms.uTime.value += dt

    // Hold pulses: the first fires the moment the skin starts shedding, then
    // every PULSE_MS for as long as the press is held (spec §2b.3).
    if (this.ignition?.isFinished() && this.shatter && this.ignitionConfig.PULSE_ENABLED) {
      const st = this.shatter.getState()
      const held = st === 'charging' || st === 'blasted'
      // getEffectiveCharge, not getCharge: the latter is the POINTER's charge
      // only (see its comment), so gating on it would leave the sequence-driven
      // separation silent — displaced panels with none of the electrical hold
      // pulses that make it read as an event rather than a glitch.
      const shedding = held && this.shatter.getEffectiveCharge() >= this.config.SEPARATE_START
      if (shedding) {
        this.pulseTimer -= dt * 1000
        if (this.pulseTimer <= 0) {
          this.ignition.pulse()
          this.pulseTimer = this.ignitionConfig.PULSE_MS
        }
      } else {
        // Reset while not shedding, so the next hold fires immediately rather
        // than waiting out a timer left over from the previous one.
        this.pulseTimer = 0
      }
      this.ignition.update(dt)
    }

    if (this.ignition && !this.ignition.isFinished()) {
      this.ignition.update(dt)
      // Dark mass rides the cage's own fade, so the red always has something to
      // burn against for exactly as long as the cage is on screen (spec §3.3).
      const fade = this.ignitionUniforms?.uGlobalFade.value ?? 0
      const target = this.ignitionConfig.DARK_MASS_OPACITY * fade
      this.bodySurfaceMats.forEach((m) => {
        m.opacity = Math.max(this.config.BODY_OPACITY, target)
        m.visible = m.opacity > 0
      })
    }

    if (this.shatter) {
      // Applied BEFORE update(), which is what writes uBlast — set it after and
      // the mark renders one frame behind the beat that caused it.
      this.shatter.setExternalCharge(this.externalChargeSource())
      this.shatter.update(dt)
      if (this.group) {
        const v = this.shatter.getVibrateOffset()
        this.group.position.x = v.x
        this.group.position.y = this.baseY + v.y
      }
    }

    // Polled rather than event-driven: the mark rotates, so whether the cursor
    // is over it changes even when the pointer is perfectly still.
    this.updateLogoHover()

    // The cage outlives the bridge so pulses can reuse it, but it must not cost
    // a draw call for the rest of the session while it is invisible.
    const cageLive = (this.ignitionUniforms?.uGlobalFade.value ?? 0) > 0.001
    if (this.cage) this.cage.visible = cageLive
    if (this.embers) this.embers.visible = cageLive

    // While the cage floats over the still-playing video, the logo's own ghost
    // wireframe must stay out of it — otherwise it draws on top of the video's
    // drawing of the same mark, in the same place, and reads as a doubling.
    if (this.bodyGroup) this.bodyGroup.visible = !this.ignition?.isOverlayActive()

    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.tick)
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    // The cover correction depends on the viewport's aspect, so it has to be
    // recomputed here and not only once at load.
    this.applyCalibration()
  }

  /**
   * Sizes and positions the mark to land exactly where the sketch video's logo
   * was, so the handoff does not jump.
   *
   * Scaling the GROUP is deliberately the only lever: the cage, the embers and
   * the inner body are all parented to it, and every effect shader works in
   * local `position` space, so a uniform group scale moves the whole assembly
   * together and leaves all the owner-tuned proportions untouched.
   */
  private applyCalibration() {
    const group = this.group
    if (!group || !(this.baseSizeY > 0)) return
    const visH = visibleHeight()
    const cover = this.isMobileScale
      ? 1
      : videoCoverScale(
          this.canvas.clientWidth || window.innerWidth,
          this.canvas.clientHeight || window.innerHeight,
        )
    group.scale.setScalar((this.heightFrac * visH * cover) / this.baseSizeY)
    group.position.y = (0.5 - CALIB.CENTER_Y) * visH * cover
    this.baseY = group.position.y
  }

  /**
   * @param releaseContext pass true ONLY when the canvas element is being
   *   discarded along with the engine. It frees the WebGL context immediately
   *   rather than at GC, at the cost of making that canvas permanently unusable.
   */
  dispose(releaseContext = false) {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.onMove)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onCancel)
    window.removeEventListener('blur', this.onCancel)
    this.canvas.removeEventListener('keydown', this.onKey)
    this.shatter?.dispose()
    this.shatter = null
    this.ignition?.dispose()
    this.ignition = null
    this.pendingIgnitionListeners.clear()
    this.hoverListeners.clear()
    this.cageMaterial?.dispose()
    this.cageMaterial = null
    this.cage?.geometry.dispose()
    this.cage = null
    this.emberMaterial?.dispose()
    this.emberMaterial = null
    this.embers?.geometry.dispose()
    this.embers = null
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry?.dispose()
    })
    if (this.materials) Object.values(this.materials).forEach((m) => m.dispose())
    this.bodyMaterials.forEach((m) => m.dispose())
    this.bodyMaterials = []
    // Same instances as bodyMaterials — disposed above, just drop the refs.
    this.bodySurfaceMats = []
    this.renderer.dispose()

    // renderer.dispose() frees GPU resources but does NOT release the WebGL
    // context itself; that lingers until GC, and browsers cap live contexts at
    // ~16. Releasing it explicitly is therefore tempting — but
    // forceContextLoss() PERMANENTLY POISONS THE CANVAS ELEMENT: no further
    // context can ever be created on it. It is only safe when the canvas is
    // being thrown away too, which the caller knows and this class does not.
    // Hence opt-in.
    if (releaseContext) this.renderer.forceContextLoss()
  }
}
