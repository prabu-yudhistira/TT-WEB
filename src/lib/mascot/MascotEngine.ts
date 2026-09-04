import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { logoScreenBox } from '../three/calibration'
import { projectOrbit, orbitGeometry } from '../satellites/project'
import { placeLabels, EDGE_FADE_PX, type LabelBox } from '../satellites/labels'
import { screenToWorld, worldSizeFor } from '../samsara/cameraHandoff'
import type { SatelliteConfig } from '../satellites/types'
import { DEFAULT_MASCOT, type MascotConfig } from './types'
import { makeMotePool, TrailState } from './mascotTrail'
import { BurstState, makeBurstPool } from '../samsara/roomBurst'
import {
  EXPRESSIONS,
  EYES_FRAGMENT_CHUNK,
  EYES_VERTEX_CHUNK,
  lerpEye,
  packEye,
  pickWeighted,
  rightOf,
  type Expression,
  type EyeShape,
} from './eyes'
import { DEFAULT_MASCOT_EYES, type MascotEyesConfig } from './eyeTypes'
import { buildRoom, roomCameraFor, type Room } from '../samsara/room'
import { createEmitterScene, type EmitterScene, type EmitterUpdateArgs } from '../samsara/emitterScene'
import { projectQuad, type Rect, type Vec3 } from '../samsara/hologramGeometry'
import {
  DEFAULT_SEQUENCE,
  type BurstConfig,
  type DragConfig,
  type IdleEyesConfig,
  type RoomConfig,
  type SequenceConfig,
} from '../samsara/types'

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

/**
 * Burst pool. Sized so the CMS ceiling (COUNT 400) can be in flight for the
 * longest life (SECONDS 5 x the 1.3 per-mote spread) across two overlapping
 * bursts, since a short INTERVAL_MS can fire again before the previous drains.
 * `fire()` clamps to the pool anyway, so the worst case is a shortened burst
 * rather than an overrun.
 */
const MAX_BURST = 1024

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
  /** High-detail room model state. Loaded at most once, lazily. */
  private detailLoaded = false
  private detailLoading = false
  private materials: THREE.MeshStandardMaterial[] = []
  /**
   * Captured once per model load, parallel to `materials`. What
   * `applyMascotTint` lerps FROM — without this a repeated call would lerp
   * from whatever the last call left behind, and a strength of 1 held for two
   * calls would not be the same colour as strength 1 held for one.
   */
  private materialBase: { color: THREE.Color; roughness: number }[] = []
  /** Scratch object for applyMascotTint, reused so it allocates nothing per call. */
  private scratchTintColor = new THREE.Color()

  // ── the room's timed expression loop (spec §6.5) ────────────────────
  private idleEyes: IdleEyesConfig = DEFAULT_SEQUENCE.IDLE_EYES
  /** ms since the last idle expression was picked. */
  private idleMs = 0
  /** Seconds into the DECAYING smile bob. -1 when not smiling. */
  private smileShakeT = -1
  /** True while a visitor is pressing SAMSARA — see IdleEyesConfig.HOLD_EXPRESSION. */
  private holdingSmile = false
  /** Seconds into the CONTINUOUS bob that runs while held. */
  private holdSmileT = 0
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

  // ── the parked mascot's golden-smoke bursts (owner 2026-09-02) ──
  //
  // A SECOND particle system, deliberately. The trail above lives in screen
  // pixels under the ORTHOGRAPHIC camera; the room is PERSPECTIVE, where those
  // coordinates land hundreds of units off-frustum and that point sizing means
  // nothing. See ../samsara/roomBurst.ts.
  private burst!: BurstState
  private burstGeo!: THREE.BufferGeometry
  private burstMat!: THREE.ShaderMaterial
  private burstPos!: Float32Array
  private burstAlpha!: Float32Array
  private burstSize!: Float32Array
  private burstSeed!: Float32Array
  private burstPoints!: THREE.Points
  private burstCfg: BurstConfig = DEFAULT_SEQUENCE.BURST

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
  /** Set by the SAMSARA sequence to sweep the orbit to the far point. */
  private angleOverride: number | null = null
  /** See setSpinParked. Eases the face to the viewer instead of spinning. */
  private spinParked = false

  // ── the room's orientation, and turning it by hand ──────────────────
  /** Parked orientation, radians. Pitch, yaw, roll. See LandingConfig. */
  private roomPose = { x: 0, y: 0, z: 0 }
  /** What is actually drawn, easing toward roomPose so a park never snaps. */
  private posed = { x: 0, y: 0, z: 0 }
  private dragCfg: DragConfig = DEFAULT_SEQUENCE.DRAG
  private dragging = false
  private dragPointerId = -1
  private dragLastX = 0
  private dragLastY = 0
  /** Offsets ADDED to the parked pose, so a drag never destroys the tuning. */
  private dragYaw = 0
  private dragPitch = 0
  private dragVelYaw = 0
  private dragVelPitch = 0
  /** ms since the drag ended, for RETURN_DELAY_MS. -1 while held. */
  private dragIdleMs = -1
  /** Last pointer position seen, for the polled hover test. */
  private ptrX = 0
  private ptrY = 0
  private ptrSeen = false
  private overMascot = false
  private overListeners = new Set<(over: boolean) => void>()
  /**
   * World Z the scripted pose sits on while the perspective camera is live.
   * 0 is the plane through the room's origin; negative is deeper into it.
   */
  private transitZ = 0
  /**
   * One snapshot per RENDERED frame, for verification. See recordProjection().
   *
   * ⚠️ `camera` and `mode` are in here rather than read live off their fields,
   * and that is the whole point of the record. Both are mutated from OUTSIDE the
   * engine's frame — the sequence swaps the camera in its own rAF, which runs
   * after this one — so a script reading them live gets this frame's projection
   * labelled with the next frame's camera. That mislabelling reported the seam
   * as a 6px jump on a build whose placement check simultaneously read 0.000px.
   */
  private lastRendered = {
    x: 0,
    y: 0,
    diameterPx: 0,
    orbitAngle: 0,
    camera: 'ortho' as 'ortho' | 'perspective',
    mode: 'orbit' as 'orbit' | 'transit' | 'room',
    /**
     * The holographic screen's projected rect in CSS px, or null when no
     * screen exists.
     *
     * Lives in THIS snapshot, beside the pose, for the same reason the pose
     * does: three rAF callbacks run per browser frame, so a rect read from a
     * later callback is this frame's render labelled with next frame's state.
     */
    holoRect: null as Rect | null,
  }
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

  // ── SAMSARA transition (spec 2026-08-30) ──────────────────────────
  // Additive. `orbit` is the shipped behaviour, unchanged; the other two modes
  // take SAMSARA's pose from an external script instead of from projectOrbit.
  // Guarded by docs/superpowers/verification/samsara-orbit-unchanged.mjs, which
  // was baselined before any of this existed.
  private mode: 'orbit' | 'transit' | 'room' = 'orbit'
  /** Pose supplied by transitScript while mode !== 'orbit'. Screen px. */
  private transform: { x: number; y: number; sizePx: number; z?: number } | null = null
  /**
   * The room's camera. Built alongside the orthographic one rather than
   * replacing it: the orbit's ortho camera in CSS-pixel units is what makes
   * SIZE mean literal pixels and what keeps the mascot provably inside the
   * belt, so it is not touched.
   */
  private persp = new THREE.PerspectiveCamera(45, 1, 0.1, 5000)
  private cameraMode: 'ortho' | 'perspective' = 'ortho'
  /**
   * Built lazily on first show, so a visitor who never scrolls into the room
   * pays nothing — no geometry, no shadow map, no extra draw calls.
   */
  private room: Room | null = null
  private emitters: EmitterScene | null = null
  private orbModel: THREE.Object3D | null = null
  private orbLoading = false
  private holoArgs: EmitterUpdateArgs | null = null
  /**
   * Identity of the last config pushed into the emitter scene.
   *
   * The engine holds `roomCfg`, not the whole SequenceConfig, so the emitter
   * colours arrive with the per-frame args. Pushing them every frame would
   * call `Color.set()` five times a frame for values that change when an
   * editor moves a slider; comparing the reference is enough.
   */
  private holoCfgApplied: SequenceConfig | null = null
  private roomCfg: RoomConfig = DEFAULT_SEQUENCE.ROOM
  /** The room's warm environment, and the config it was built from. */
  private roomEnvRT: THREE.WebGLRenderTarget | null = null
  private roomEnvKey = ''

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
    // The room's own, warmer environment is built lazily on first entry — see
    // buildRoomEnvironment(). The neutral one above stays the orbit's.

    this.placer.add(this.tilter)
    this.tilter.add(this.spinner)
    this.scene.add(this.placer)
    this.placer.visible = false

    this.buildTrail()
    this.buildBurst()

    ;(window as unknown as Record<string, unknown>).__ttMascot = () => ({
      cx: this.cx,
      cy: this.cy,
      orbitR: this.orbitR,
      angle: this.angle,
      behind: this.behind,
      loaded: !!this.model,
      charge: this.chargeSource(),
      pos: this.lastScreen,
      // On-screen body diameter in CSS px. Published because it is the number
      // the eye work is judged against — 12.6px on the far side of the orbit,
      // 70px at closest approach — and because a verification script otherwise
      // has to infer the size path rather than read it.
      diameterPx: this.lastDiameterPx,
      spin: this.spin,
      inspect: this.inspect.on,
      /** LIVE fields. For the seam, use `rendered` — see lastRendered. */
      camera: this.cameraMode,
      mode: this.mode,
      // ⚠️ The MEASURED pose: the placer's real world transform pushed back
      // through whichever camera is live, rather than the pose the script asked
      // for. The two agree only if the placement is right, which is the whole
      // question at the ortho→perspective seam — `pos` above would report a
      // perfectly continuous handoff while the room rendered empty, because it
      // is the input to the placement, not its result.
      rendered: this.lastRendered,
      /** The expression the current beat is playing. Verification instrument. */
      expr: this.glanceExpr,
      /** True while a visitor is pressing SAMSARA. Verification instrument. */
      holding: this.holdingSmile,
    })

    // Dev handle for the room, so frame rate can be measured against the real
    // shadow-casting scene rather than deferred until the bench exists.
    ;(window as unknown as Record<string, unknown>).__ttSamsaraRoom = (on: boolean) => {
      this.setRoomVisible(on)
      // Swaps the camera as well, which it deliberately did NOT do between Task
      // 8 and Task 11.
      //
      // The reason it could not: place() positions the mascot in ORTHOGRAPHIC
      // screen-pixel space — X and Y in the hundreds, scale in pixels — and
      // switching cameras without converting that into world units puts the
      // body far outside the frustum and renders an empty room, which is what
      // happened the first time this handle tried. place() now does that
      // conversion, so the handle can finally show the real thing: perspective
      // camera, shadows, the landed pose. Measuring frame rate against anything
      // less would measure a scene that never ships.
      if (on) {
        this.setMode('room')
        this.setCameraMode('perspective', roomCameraFor(this.roomCfg, this.H))
        this.setTransform({ x: this.W * 0.72, y: this.H * 0.52, sizePx: this.H * 0.4, z: 0 })
      } else {
        this.setCameraMode('ortho')
        this.setMode('orbit')
      }
      return { room: !!this.room, mode: this.mode, camera: this.cameraMode }
    }

    /**
     * Park the body at a given on-screen size, for LOD and detail work.
     *
     * Off-centre on purpose: the logo sits at the centre of the hero, so
     * parking here photographs the MARK rather than the mascot.
     */
    ;(window as unknown as Record<string, unknown>).__ttSamsaraBig = (px: number) => {
      this.setMode('room')
      this.setTransform({ x: this.W * 0.5, y: this.H * 0.5, sizePx: px })
      return { sizePx: px, mode: this.mode, x: this.W * 0.5, y: this.H * 0.5 }
    }

    /** Load the high-detail room model on demand, for verification. */
    ;(window as unknown as Record<string, unknown>).__ttSamsaraDetail = async (
      url = '/models/mascot.room.draco.glb',
    ) => {
      const ok = await this.loadDetail(url)
      return { ok, detail: this.detailLoaded }
    }

    /**
     * Dev handle: sweep the socket's vertical span live.
     *
     * Kept rather than deleted after the 2026-09-01 fix, because the value is a
     * property of the MESH — where the monogram plaque and the chin band sit —
     * and the source GLB has already been replaced once. If it is replaced
     * again this is how the number gets re-measured instead of re-guessed.
     */
    ;(window as unknown as Record<string, unknown>).__ttMascotSock = (v: number) => {
      this.eyeUniforms.uSocketSpanY.value = v
      return v
    }

    /**
     * Dev handle for the burst: its live count, its config, and a way to fire
     * one now. Verification needs the live count specifically — screenshotting
     * against a wall-clock timer races the schedule and compares two frames
     * that both happen to have dust in them.
     */
    ;(window as unknown as Record<string, unknown>).__ttBurst = () => ({
      alive: this.burst.aliveCount(this.elapsed),
      // The engine's OWN clock, which is what the burst schedule runs on.
      // Wall-clock drifts from it whenever frames are slow, so verification
      // must time the interval here or it measures the frame rate instead.
      elapsed: this.elapsed,
      cfg: this.burstCfg,
      fire: () => this.fireBurst(),
    })

    // Dev handle for the bench and for verification scripts: hold one
    // expression instead of waiting for the glance beat to pick it.
    ;(window as unknown as Record<string, unknown>).__ttMascotExpr = (name: string | null) => {
      this.forcedExpr = name
      if (name) this.setExpression(name)
      return Object.keys(EXPRESSIONS)
    }

    window.addEventListener('scroll', this.onScroll, { passive: true })

    // ⚠️ On WINDOW, not on the canvas, and that is not laziness.
    //
    // The mascot layer is `pointer-events: none` so the room stays clickable
    // through it — Section 2's DOM lands on top of this canvas. A `pointerdown`
    // bound to the canvas would therefore never fire at all. Listening on the
    // window and hit-testing the circle ourselves keeps the layer transparent
    // to every pointer that is not actually on SAMSARA, which is the behaviour
    // both halves need.
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('blur', this.onBlur)
  }

  /** Set by the bench / verification to pin one expression. null = live. */
  private forcedExpr: string | null = null

  /**
   * Face-display uniforms. Shared across every material on the mesh, so one
   * write drives the whole display. uFaceRadius 0.50 is MEASURED — the smooth
   * front cap ends there and the bezel relief begins (see ./eyes.ts).
   *
   * ⚠️ DERIVED from DEFAULT_MASCOT_EYES, never restated. These are only what
   * a material compiled BEFORE the first setEyeConfig() renders with, so a
   * stale copy is invisible on the bench (which pushes a config on mount) and
   * shows on the real page as a flash of the wrong socket while the model
   * loads. Seven of these were hand-maintained duplicates of approved numbers
   * until the fifth socket pass moved four at once and left the copy behind.
   * Deriving them means a freeze gate cannot forget this file again.
   */
  private eyeUniforms: Record<string, { value: unknown }> = {
    /** See the roughnessmap_fragment injection. 0 = the map exactly as authored. */
    uTtRough: { value: 0 },
    uEyesOn: { value: DEFAULT_MASCOT_EYES.ENABLED ? 1 : 0 },
    uFaceRadius: { value: DEFAULT_MASCOT_EYES.FACE_RADIUS },
    // Amber, not the reference video's cyan: the owner asked for the display to
    // match the mascot's own painted eyes and the gold dust trail (#FDB721), so
    // the hero keeps ONE warm accent rather than gaining a second, cold one.
    uEyeColor: { value: new THREE.Color(DEFAULT_MASCOT_EYES.COLOR) },
    uEyeCore: { value: new THREE.Color(DEFAULT_MASCOT_EYES.CORE) },
    uSocketColor: { value: new THREE.Color(DEFAULT_MASCOT_EYES.SOCKET) },
    uEyeGlow: { value: DEFAULT_MASCOT_EYES.GLOW },
    uEyeGap: { value: DEFAULT_MASCOT_EYES.GAP },
    uScanline: { value: 0 },
    uSocketSpan: { value: DEFAULT_MASCOT_EYES.SOCKET_SPAN },
    uSocketSpanY: { value: DEFAULT_MASCOT_EYES.SOCKET_SPAN_Y },
    uSocketFeather: { value: DEFAULT_MASCOT_EYES.SOCKET_FEATHER },
    uEyeL: { value: new Float32Array(12) },
    uEyeR: { value: new Float32Array(12) },
    uObjCenter: { value: new THREE.Vector3() },
    uObjScale: { value: 1 },
  }
  /** Where the glance beat is in its arc, and what it plays. */
  private glanceT = 1
  private glanceExpr: string | null = 'blink'
  private wasFacing = false
  /** Previous pass's expression, for NO_REPEAT. */
  private lastGlance: string | null = null

  /**
   * The CMS-editable eye surface (see ./eyeTypes.ts). The SHAPES are not here —
   * they are frozen in ./eyes.ts. Defaults are the owner-approved values, so an
   * engine that never receives a config renders exactly what shipped.
   */
  private eyes: MascotEyesConfig = DEFAULT_MASCOT_EYES

  /**
   * Bench-only viewing mode. Shaping an eye needs the face big, still and
   * pointed at the viewer; the shipped mascot is 12.6-70px, spinning at 113°/s
   * and facing the viewer about a quarter of the time. Tuning in the
   * comfortable view alone is how subtlety that is invisible at real size gets
   * approved, so the bench can flip between the two and neither is the default.
   */
  private inspect: { on: boolean; angleDeg: number; sizePx: number } = {
    on: false,
    angleDeg: 0,
    sizePx: 320,
  }

  private lastScreen = { x: NaN, y: NaN, z: NaN, scale: 1 }
  private lastDiameterPx = 0
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

    // Inspect mode parks the mascot, so a live emitter would pile 130 motes/sec
    // onto one point and bury the face being tuned. Emission stops; ageing does
    // not, so the existing wake drains away instead of freezing in mid-air.
    this.trail.emit(c, emitX, emitY, this.inspect.on ? 0 : dtSec, alpha, this.elapsed)
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

  // ── the parked mascot's golden-smoke burst ──────────────────────────

  private buildBurst() {
    this.burstPos = new Float32Array(MAX_BURST * 3)
    this.burstAlpha = new Float32Array(MAX_BURST)
    this.burstSize = new Float32Array(MAX_BURST)
    this.burstSeed = new Float32Array(MAX_BURST)
    this.burst = new BurstState(makeBurstPool(MAX_BURST))
    this.burstGeo = new THREE.BufferGeometry()
    this.burstGeo.setAttribute('position', new THREE.BufferAttribute(this.burstPos, 3))
    this.burstGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.burstAlpha, 1))
    this.burstGeo.setAttribute('aSize', new THREE.BufferAttribute(this.burstSize, 1))
    this.burstGeo.setAttribute('aSeed', new THREE.BufferAttribute(this.burstSeed, 1))

    this.burstMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(DEFAULT_SEQUENCE.BURST.COLOR) },
        uCore: { value: new THREE.Color(DEFAULT_SEQUENCE.BURST.CORE_COLOR) },
        uGlow: { value: DEFAULT_SEQUENCE.BURST.GLOW },
        // Device pixels per world unit at one unit of depth. The engine
        // recomputes it on resize and on any FOV change.
        uPxPerWorld: { value: 1 },
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        attribute float aSeed;
        uniform float uPxPerWorld;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vAlpha = aAlpha;
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // ⚠️ This IS the perspective idiom the trail's shader warns against,
          // and here it is correct: aSize is in WORLD units and the camera is
          // a real perspective camera in room-scale units. The trail's warning
          // is about the ORTHOGRAPHIC camera, whose units are already pixels.
          gl_PointSize = aSize * uPxPerWorld / max(0.001, -mv.z);
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
        varying float vSeed;

        // ⚠️ EXPLICIT precision. The noise below hashes with fract() of products,
        // which is meaningless at mediump: the mantissa runs out and every pixel
        // gets an independent value instead of a smooth field. three.js prefixes
        // highp by default, but this shader's correctness depends on it.
        precision highp float;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 3; i++) {
            v += amp * vnoise(p);
            p *= 2.03;
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 d = gl_PointCoord - 0.5;

          // ⛔ THE THING THAT DECIDES SMOKE VERSUS DUST, and it is the SHAPE,
          // not the colour and not the count.
          //
          // A sprite whose alpha is a smooth function of radius is, precisely,
          // what an out-of-focus point light looks like. That is the definition
          // of bokeh. Every earlier pass here drew exactly that and then tried
          // to rescue it with opacity, count and size — which cannot work,
          // because a hundred faint circles is still a hundred circles.
          //
          // Smoke has no clean silhouette: it is eroded, wispy and different
          // every time. So the radial body below is only a MASK, and what is
          // actually drawn is fbm noise cut out of it.

          // Rotate per puff, or 78 sprites all show the same noise field and
          // the repetition reads as a texture bug.
          float ang = vSeed * 6.2831853;
          float cs = cos(ang);
          float sn = sin(ang);
          vec2 rd = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);

          float r = length(d) * 2.0;
          if (r > 1.0) discard;

          // Soft containing mask. Meets zero tangentially so the puff has no rim.
          float body = max(0.0, 1.0 - r * r);

          // Offset by the seed so no two puffs sample the same region.
          //
          // ⚠️ The offset is SMALL, and that is not cosmetic. This read
          // vSeed * 37.0, which put the hash's inputs in the thousands after
          // its internal multiply, where floating point has no bits left for
          // fract() to mean anything — so vnoise degenerated into per-pixel
          // randomness. Rendered, that is not a texture: it is a scatter of
          // isolated bright pixels, i.e. precisely the dust the noise was added
          // to get rid of. Variety comes from the ROTATION above; the offset
          // only has to break the tie.
          //
          // LOW frequency too: at 3.4 the lobes were finer than the puff itself.
          float n = fbm(rd * 2.3 + vec2(vSeed * 5.0, vSeed * 3.0));

          // ⚠️ MODULATE, do not threshold.
          //
          // The first attempt at this cut everything below a density threshold
          // away — smoothstep(0.06, 0.55, body * noise) — which kept only each
          // sprite's dense core and collapsed a 90px puff into a speck. It turned
          // the bokeh into literal dust, which was further from smoke, not closer.
          //
          // Multiplying instead keeps the puff its full size and gives it uneven
          // internal density and a wobbling outline, which is what a wisp is. The
          // multiplier straddles 1.0 so the mean brightness is unchanged and only
          // its DISTRIBUTION becomes irregular.
          float wisp = 0.45 + 1.15 * n;
          float a = pow(body, 1.25) * wisp;
          // Soften only the outermost rim, so the sprite's own circular boundary
          // never shows even where the noise happens to be bright there.
          a *= smoothstep(0.0, 0.22, body);
          a = clamp(a, 0.0, 1.0);
          if (a <= 0.002) discard;

          // Warmth in the denser parts rather than a hot centre: a bright middle
          // is the ember look returning, and it is centred, which is the one
          // place smoke never has structure.
          float core = clamp(a * uGlow, 0.0, 1.0);
          vec3 c = mix(uColor, uCore, core);
          gl_FragColor = vec4(c, a * vAlpha);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      // ⚠️ depthTest ON, depthWrite OFF, and both matter.
      //
      // TEST on is what makes this read as coming from BEHIND: the body writes
      // depth, so motes still behind it are hidden and only those that have
      // travelled past the silhouette appear. Turning it off would draw the
      // whole burst over SAMSARA's face, which is the opposite of the effect.
      //
      // WRITE off so motes do not occlude each other — additive grains that
      // z-fight against their own siblings sparkle in a way that reads as a bug.
      depthTest: true,
      depthWrite: false,
    })
    this.burstPoints = new THREE.Points(this.burstGeo, this.burstMat)
    this.burstPoints.frustumCulled = false
    this.burstPoints.visible = false
    this.scene.add(this.burstPoints)
  }

  /**
   * The burst only exists in the room, and only once SAMSARA has parked.
   *
   * `active` is the caller's judgement (landed and still), not something this
   * method infers: the sequence owns what 'parked' means and the bench needs to
   * be able to force it.
   */
  private updateBurst(dtSec: number, alpha: number, active: boolean) {
    const c = this.burstCfg
    const live = active && c.ENABLED && this.cameraMode === 'perspective'

    this.burst.update(c, this.elapsed, live)

    // Motes outlive the moment they were fired, so the object stays visible
    // while the last burst drains rather than being cut off mid-air.
    const samples = this.burst.sample(c, this.elapsed, alpha, dtSec)
    let anyLit = false

    // Body centre and radius in WORLD units. Radius comes off scale.Z because
    // Z is the one axis MASCOT_STRETCH never touches — the same reason
    // recordProjection() measures there. Reading X or Y would make the dust
    // cloud inherit the body's 1.12 vertical stretch and read as an ellipse.
    const cx = this.placer.position.x
    const cy = this.placer.position.y
    const cz = this.placer.position.z
    const radius = this.placer.scale.z / 2

    const pxPerWorld = this.burstMat.uniforms.uPxPerWorld.value as number
    const bodyDist = Math.max(0.001, this.persp.position.z - cz)
    // A mote's configured SIZE is pixels AT THE BODY'S depth; convert once so
    // the shader's divide by -mv.z does the rest. Without this the burst is a
    // fixed world size and grows into a wall of gold as the camera nears.
    const worldPerPx = pxPerWorld > 0 ? bodyDist / pxPerWorld : 0

    for (const m of samples) {
      this.burstPos[m.i * 3] = cx + m.x * radius
      this.burstPos[m.i * 3 + 1] = cy + m.y * radius
      this.burstPos[m.i * 3 + 2] = cz + m.z * radius
      this.burstAlpha[m.i] = m.alpha
      this.burstSize[m.i] = m.size * this.dpr * worldPerPx
      this.burstSeed[m.i] = m.seed
      if (m.alpha > 0) anyLit = true
    }

    this.burstPoints.visible = anyLit
    if (!anyLit) return

    ;(this.burstMat.uniforms.uColor.value as THREE.Color).set(c.COLOR)
    ;(this.burstMat.uniforms.uCore.value as THREE.Color).set(c.CORE_COLOR)
    this.burstMat.uniforms.uGlow.value = c.GLOW
    this.burstGeo.attributes.position.needsUpdate = true
    this.burstGeo.attributes.aAlpha.needsUpdate = true
    this.burstGeo.attributes.aSize.needsUpdate = true
    this.burstGeo.attributes.aSeed.needsUpdate = true
  }

  /** Recomputed on resize and whenever the room's FOV changes. */
  private syncBurstProjection() {
    if (!this.burstMat) return
    const hDevice = this.H * this.dpr
    const fovRad = (this.persp.fov * Math.PI) / 180
    this.burstMat.uniforms.uPxPerWorld.value = hDevice / (2 * Math.tan(fovRad / 2))
  }

  setBurstConfig(cfg: BurstConfig) {
    this.burstCfg = cfg
  }

  /** Bench / verification: fire one now, without waiting out the interval. */
  fireBurst() {
    this.burst.fire(this.burstCfg, this.elapsed)
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
      this.materialBase = []
      model.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = m.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
        for (const mm of Array.isArray(mat) ? mat : [mat]) {
          if ((mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const std = mm as THREE.MeshStandardMaterial
            this.materials.push(std)
            this.materialBase.push({ color: std.color.clone(), roughness: std.roughness })
          }
        }
      })

      this.spinner.add(norm)
      this.model = norm
      this.patchEyes()
      this.applyLook()
      this.applyTextureQuality()
      this.applyMascotTint()
    } catch (err) {
      // No mascot is an acceptable outcome; a broken hero is not.
      console.error('MascotEngine: model failed to load', err)
    } finally {
      draco.dispose()
    }
  }

  /**
   * Swap in a higher-detail model for the room. Owner requirement, spec §6.3b.
   *
   * The hero's 20k build is correct at 12.6–70px and would be pure cost there.
   * But the room shows SAMSARA at ~360px, five times past anything the
   * decimation ladder validated, where the silhouette facets and the forehead
   * monogram — which is modelled GEOMETRY, not texture, because the skin texture
   * tiles 16x and cannot carry a unique mark — stops being readable.
   *
   * ⚠️ THE HAZARD, and the whole reason this is not just `load()` again:
   * the eye shader is injected through onBeforeCompile on the MATERIALS. Swap
   * the model without re-running patchEyes() and SAMSARA arrives in the room
   * with no eyes at all — the socket mask and every expression uniform belong to
   * the material that was just thrown away. patchEyes() and applyLook() are
   * therefore re-run here, in that order, exactly as load() does.
   *
   * Resolves false rather than throwing when the fetch fails: a missing
   * high-detail asset must degrade to the 20k model, never to a broken room.
   */
  async loadDetail(url: string): Promise<boolean> {
    if (this.disposed || this.detailLoaded || this.detailLoading) return false
    this.detailLoading = true

    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)

    try {
      const gltf = await loader.loadAsync(url)
      if (this.disposed) return false

      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const centre = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      model.position.sub(centre)
      const norm = new THREE.Group()
      norm.add(model)
      norm.scale.setScalar(1 / maxDim)

      // Retire the old body before adopting the new one, or the 530 KB model's
      // geometry and textures stay resident for the rest of the session.
      const old = this.model
      if (old) {
        this.spinner.remove(old)
        old.traverse((o) => {
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
      }

      this.materials = []
      this.materialBase = []
      model.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = m.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
        for (const mm of Array.isArray(mat) ? mat : [mat]) {
          if ((mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const std = mm as THREE.MeshStandardMaterial
            this.materials.push(std)
            this.materialBase.push({ color: std.color.clone(), roughness: std.roughness })
          }
        }
      })

      this.spinner.add(norm)
      this.model = norm

      // ⚠️ Order matters and mirrors load(): the eye chunks must be injected
      // before the look is applied, or the first frame renders an unpatched
      // material and the socket flashes as plain brass.
      this.patchEyes()
      this.applyLook()
      this.applyTextureQuality()
      // The high-detail swap happens mid-fall, already in the room — reapply
      // immediately, or the tint the owner dialled in vanishes for however many
      // frames until something else happens to trigger it again.
      this.applyMascotTint()

      // The room enables shadows on the renderer; a freshly adopted mesh does
      // not inherit the castShadow flag set on the model it replaced.
      if (this.room?.group.visible) {
        this.spinner.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true
        })
      }

      this.detailLoaded = true
      return true
    } catch (err) {
      // Degrade to the 20k model. The room must never wait on, or break over,
      // a 2.1 MB download.
      console.warn('MascotEngine: high-detail model unavailable, keeping the orbit build', err)
      return false
    } finally {
      this.detailLoading = false
      draco.dispose()
    }
  }

  hasDetail() {
    return this.detailLoaded
  }

  // ── configuration ───────────────────────────────────────────────────

  setConfig(cfg: MascotConfig) {
    this.cfg = cfg
    this.applyLook()
    this.layout()
    if (this.reduced) this.drawStatic()
  }

  /**
   * Live eye configuration. Rides the same no-rebuild path setConfig() uses, so
   * a slider drag does not tear down the engine and lose the pinned expression.
   */
  setEyeConfig(c: MascotEyesConfig) {
    const wasEnabled = this.eyes.ENABLED
    this.eyes = c
    const u = this.eyeUniforms
    ;(u.uEyeColor.value as THREE.Color).set(c.COLOR)
    ;(u.uEyeCore.value as THREE.Color).set(c.CORE)
    ;(u.uSocketColor.value as THREE.Color).set(c.SOCKET)
    u.uEyeGlow.value = c.GLOW
    u.uEyeGap.value = c.GAP
    u.uSocketSpan.value = c.SOCKET_SPAN
    u.uSocketSpanY.value = c.SOCKET_SPAN_Y
    u.uSocketFeather.value = c.SOCKET_FEATHER
    u.uFaceRadius.value = c.FACE_RADIUS

    // Toggling the switch has to rebuild the material: when off, the display's
    // chunks are not injected AT ALL. Merely zeroing uEyesOn would leave the
    // socket mask compiled in and the mascot's painted eyes still covered —
    // which is exactly the half-disabled state this project has shipped three
    // times. Spec §7.4.
    if (this.model && wasEnabled !== c.ENABLED) this.patchEyes()

    // Re-write the current shape immediately: without this a change only
    // appears on the next glance, which reads as the control being dead.
    if (this.forcedExpr) this.setExpression(this.forcedExpr)
    if (this.reduced) this.drawStatic()
  }

  /** Bench-only. `on: false` restores the real size, spin and orbit. */
  setInspect(v: { on: boolean; angleDeg: number; sizePx: number }) {
    this.inspect = v
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

  // ── SAMSARA transition surface ────────────────────────────────────

  /**
   * `orbit` restores the shipped behaviour exactly. `transit` and `room` take
   * the pose from setTransform() instead of from projectOrbit().
   */
  setMode(m: 'orbit' | 'transit' | 'room') {
    const wasOrbit = this.mode === 'orbit'
    this.mode = m
    if (m === 'orbit') this.transform = null
    // Only re-evaluate on an actual orbit <-> non-orbit crossing — the tint is
    // gated on exactly that boundary, and calling it every frame's mode write
    // (this fires from the sequence's own per-frame setMode calls) would be
    // work with no observable effect the other 59 times a second.
    if (wasOrbit !== (m === 'orbit')) {
      this.applyMascotTint()
      this.applyEnvironmentFor(m)
    }
  }

  getMode() {
    return this.mode
  }

  /**
   * Screen-space pose while mode !== 'orbit'. Null falls back to the orbit.
   *
   * x, y and sizePx stay in SCREEN PIXELS under both cameras — that is the
   * contract, and it is what lets transitScript stay pure and camera-agnostic.
   * The optional  is the world plane the pose is solved on once the
   * perspective camera is live; it does nothing under the ortho camera, where
   * there is no depth to have.
   */
  setTransform(t: { x: number; y: number; sizePx: number; z?: number } | null) {
    this.transform = t
    this.transitZ = t?.z ?? 0
  }

  /**
   * Swap the render camera.
   *
   * ⚠️ The seam must be solved, not eyeballed: at the handoff SAMSARA has to
   * occupy the same pixels either side or it jumps in one frame. The caller
   * supplies a distance from solveHandoff() in lib/samsara/cameraHandoff.ts,
   * which inverts the projection analytically for exactly this reason.
   */
  setCameraMode(m: 'ortho' | 'perspective', opts?: { fovDeg: number; distance: number }) {
    this.cameraMode = m
    if (m === 'perspective' && opts) {
      this.persp.fov = opts.fovDeg
      this.persp.position.set(0, 0, opts.distance)
      this.persp.aspect = this.H > 0 ? this.W / this.H : 1
      this.persp.updateProjectionMatrix()
      this.persp.lookAt(0, 0, 0)
    }
    // The burst sizes its points off the FOV, so it has to follow it.
    this.syncBurstProjection()
  }

  getCameraMode() {
    return this.cameraMode
  }

  /**
   * The live orbit frame, so the sequence can build a TransitContext from where
   * SAMSARA ACTUALLY is rather than from a second copy of the layout math.
   *
   * Read-only and additive. It exists because transitScript.ts is pure and
   * takes its geometry as an argument — which is the property that makes the
   * far point testable — and something has to hand it the real numbers. The
   * alternative, re-running orbitGeometry()/logoScreenBox() in React, is the
   * duplicate-projection failure projectOrbit was extracted to prevent.
   */
  getOrbitFrame() {
    return {
      W: this.W,
      H: this.H,
      cx: this.cx,
      cy: this.cy,
      orbitR: this.orbitR,
      innerR: this.innerR,
      angle: this.angle,
      mobile: typeof window !== 'undefined' && window.innerWidth < 640,
      /**
       * The out-of-plane offset place() is CURRENTLY using — HEIGHT plus the
       * live bob, not HEIGHT alone.
       *
       * BOB_PX ships at 0, so today the two are the same. It is a CMS field
       * though, and the transit re-projects the far point from this number: a
       * caller passing bare HEIGHT would put the scripted start pose a bob's
       * amplitude away from where the body actually is, and the seam would open
       * up the first time anyone tuned it — on a control that has nothing
       * visibly to do with the handoff.
       */
      heightPx: this.orbitHeightPx(),
      /** Base on-screen diameter before the belt depth cue. */
      baseSizePx: this.sizePx(),
      /** Last diameter actually drawn, depth cue included. */
      diameterPx: this.lastDiameterPx,
    }
  }

  /**
   * Drive the orbit angle from outside instead of from the belt clock.
   *
   * ⚠️ Deliberately an override on the ORBIT branch, not a scripted transform.
   *
   * The half-orbit — beat 4 easing SAMSARA round to the far point — still
   * happens IN the belt, so it must keep the belt's depth cue, its perspective
   * divide and, above all, its z-flip: mid-sweep SAMSARA can still pass behind
   * the mark. Routing those 600ms through setTransform() instead would force
   * z = -1 (see place()) and pop the body in front of the logo the instant the
   * fourth beat landed — a visible failure at the one moment the sequence is
   * asking to be watched.
   *
   * null restores the belt clock.
   */
  setAngleOverride(a: number | null) {
    this.angleOverride = a
  }

  getAngleOverride() {
    return this.angleOverride
  }

  /** 0 = room invisible, 1 = fully present. See Room.setReveal. */
  setRoomReveal(v: number) {
    this.room?.setReveal(v)
  }

  // ── the room pose, and turning it by hand ───────────────────────────

  /** The parked orientation, in DEGREES. See LandingConfig's ROT_*_DEG. */
  setRoomPose(deg: { x: number; y: number; z: number }) {
    const R = Math.PI / 180
    this.roomPose = { x: deg.x * R, y: deg.y * R, z: deg.z * R }
  }

  setDragConfig(cfg: DragConfig) {
    this.dragCfg = cfg
    if (!cfg.ENABLED) this.endDrag()
  }

  /**
   * True while a pointer is actively turning SAMSARA.
   *
   * ⚠️ The SAMSARA sequence must consult this before feeding a `touchmove` to
   * the gesture normaliser. On a touch screen one finger dragged across the
   * mascot is BOTH a rotation and an upward swipe, and the swipe means "leave
   * the room" — so without this, inspecting the far side of SAMSARA on a phone
   * exits the room instead.
   */
  isDragging() {
    return this.dragging
  }

  /**
   * Where the body is drawn on screen right now, in CSS px within the host box.
   *
   * Published so an affordance can be anchored TO SAMSARA rather than to the
   * pointer. The site's cursor pill trails the cursor by design, which is right
   * for a label that describes what you are pointing at and wrong for one that
   * marks where a fixed target is — it reads as the target being somewhere it
   * is not.
   */
  getBodyScreen() {
    return {
      x: this.lastScreen.x,
      y: this.lastScreen.y,
      // The DRAWN height, stretch included — a hint anchored below the body has
      // to clear the body that is actually there, not the one the script asked
      // for.
      diameterPx: this.lastDiameterPx * this.stretchY(),
    }
  }

  /** Fires when the pointer moves onto or off SAMSARA's disc. */
  onMascotHover(cb: ((over: boolean) => void) | null) {
    this.overListeners.clear()
    if (cb) {
      this.overListeners.add(cb)
      cb(this.overMascot)
    }
  }

  /**
   * Is a viewport point on SAMSARA?
   *
   * A circle test against the last drawn centre and diameter, NOT a raycast.
   * The mascot is a sphere, so the circle is not an approximation of its
   * silhouette — it IS its silhouette, exactly, at any orientation. The mark
   * needs a raycast because it is a knot full of holes; this does not, and a
   * per-move raycast against 200k triangles is not something to pay for when
   * the closed form is two subtractions.
   */
  private hitsMascot(clientX: number, clientY: number) {
    if (!this.model || this.lastDiameterPx <= 0) return false
    // host, not the canvas: resize() measures W/H from the host, so lastScreen
    // is in the HOST's box. Measuring against a different element would put the
    // hit circle wherever the two happened to disagree.
    const rect = this.host.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    const dx = clientX - rect.left - this.lastScreen.x
    const dy = clientY - rect.top - this.lastScreen.y
    // ⚠️ An ELLIPSE, because MASCOT_STRETCH_X/Y can make the body one. A circle
    // of the scripted diameter would leave the stretched axis unclickable at
    // its extremes and overshoot on the other — and the symptom would read as
    // "the click area is offset", which this project has already chased once.
    const rx = (this.lastDiameterPx / 2) * this.stretchX()
    const ry = (this.lastDiameterPx / 2) * this.stretchY()
    if (rx <= 0 || ry <= 0) return false
    const nx = dx / rx
    const ny = dy / ry
    return nx * nx + ny * ny <= 1
  }

  /** 1 in the orbit — the stretch is a room-only control. */
  private stretchX() {
    return this.mode === 'orbit' ? 1 : this.roomCfg.MASCOT_STRETCH_X
  }

  private stretchY() {
    return this.mode === 'orbit' ? 1 : this.roomCfg.MASCOT_STRETCH_Y
  }

  /** Draggable only once it has arrived — see DragConfig. */
  private dragAllowed() {
    return this.dragCfg.ENABLED && this.mode === 'room' && !!this.model
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.dragAllowed() || this.dragging) return
    if (!this.hitsMascot(e.clientX, e.clientY)) return
    // Owner: "click&hold will make it laugh/smile until click is released."
    // Set on the same press that starts a drag, not behind a movement
    // threshold — see HOLD_EXPRESSION.
    if (this.idleEyes.HOLD_EXPRESSION) {
      this.holdingSmile = true
      this.holdSmileT = 0
    }
    this.dragging = true
    this.dragPointerId = e.pointerId
    this.dragLastX = e.clientX
    this.dragLastY = e.clientY
    this.dragVelYaw = 0
    this.dragVelPitch = 0
    this.dragIdleMs = -1
  }

  private onPointerMove = (e: PointerEvent) => {
    this.ptrX = e.clientX
    this.ptrY = e.clientY
    this.ptrSeen = true
    if (!this.dragging || e.pointerId !== this.dragPointerId) return

    const R = Math.PI / 180
    const k = this.dragCfg.SENSITIVITY_DEG_PER_PX * R
    const dx = (e.clientX - this.dragLastX) * k
    const dy = (e.clientY - this.dragLastY) * k
    this.dragLastX = e.clientX
    this.dragLastY = e.clientY

    this.dragYaw += dx
    const max = this.dragCfg.MAX_PITCH_DEG * R
    this.dragPitch = Math.max(-max, Math.min(max, this.dragPitch + dy))
    // Recorded per event rather than differentiated per frame: a flick's last
    // move can land between two frames, and a velocity sampled on the frame
    // boundary would read it as a dead stop.
    this.dragVelYaw = dx
    this.dragVelPitch = dy
  }

  private onPointerUp = (e: PointerEvent) => {
    // Not gated on the pointer id: a press that never became a drag (drag
    // disabled, or the config changed mid-press) still has a smile to release,
    // and leaving that latched would freeze SAMSARA grinning.
    if (!this.dragging) {
      this.releaseSmile()
      return
    }
    if (e.pointerId !== this.dragPointerId) return
    this.endDrag()
  }

  /** A drag whose pointerup lands in another window would otherwise never end. */
  private onBlur = () => this.endDrag()

  private endDrag() {
    this.releaseSmile()
    if (!this.dragging) return
    this.dragging = false
    this.dragPointerId = -1
    this.dragIdleMs = 0
  }

  /**
   * Let go of the held smile.
   *
   * Hands the continuous bob over to the decaying one rather than stopping it,
   * so releasing settles instead of cutting the body's motion mid-swing.
   */
  private releaseSmile() {
    if (!this.holdingSmile) return
    this.holdingSmile = false
    this.smileShakeT = 0
  }

  /**
   * Spin-down, the return to the parked pose, and the hover flag.
   *
   * Split out of place() because it is the only part of the pose that runs on
   * wall-clock time rather than on the frame's own progress through the transit.
   */
  private updateDrag(dtSec: number) {
    const cfg = this.dragCfg
    const allowed = this.dragAllowed()

    // Leaving the room drops any turn on the floor: coming back should present
    // the pose the owner tuned, not wherever the last visitor left it.
    if (!allowed) {
      this.dragYaw = 0
      this.dragPitch = 0
      this.dragVelYaw = 0
      this.dragVelPitch = 0
      this.dragIdleMs = -1
      this.releaseSmile()
      this.setOver(false)
      return
    }

    this.setOver(this.ptrSeen && this.hitsMascot(this.ptrX, this.ptrY))

    if (this.dragging) return

    // Inertia. DAMPING is the fraction of velocity SURVIVING one second, so the
    // decay is framerate-independent rather than a per-frame multiplier that
    // would spin longer on a faster display.
    const keep = Math.pow(Math.max(1e-6, cfg.DAMPING), dtSec)
    if (Math.abs(this.dragVelYaw) > 1e-6 || Math.abs(this.dragVelPitch) > 1e-6) {
      const R = Math.PI / 180
      const max = cfg.MAX_PITCH_DEG * R
      this.dragYaw += this.dragVelYaw * dtSec * 60
      this.dragPitch = Math.max(-max, Math.min(max, this.dragPitch + this.dragVelPitch * dtSec * 60))
      this.dragVelYaw *= keep
      this.dragVelPitch *= keep
      if (Math.abs(this.dragVelYaw) < 1e-4) this.dragVelYaw = 0
      if (Math.abs(this.dragVelPitch) < 1e-4) this.dragVelPitch = 0
    }

    if (this.dragIdleMs < 0) return
    this.dragIdleMs += dtSec * 1000

    // 0 means stay put — the inspection setting. Never returns, by design.
    if (cfg.RETURN_DELAY_MS <= 0) return
    if (this.dragIdleMs < cfg.RETURN_DELAY_MS) return

    const rate = 1 - Math.exp((-dtSec * 1000 * 4) / Math.max(1, cfg.RETURN_MS))
    this.dragYaw += (0 - this.dragYaw) * rate
    this.dragPitch += (0 - this.dragPitch) * rate
    if (Math.abs(this.dragYaw) < 1e-4 && Math.abs(this.dragPitch) < 1e-4) {
      this.dragYaw = 0
      this.dragPitch = 0
      this.dragIdleMs = -1
    }
  }

  /** Has a drag left the body somewhere other than its parked pose? */
  private dragTouched() {
    return (
      this.dragging ||
      this.dragYaw !== 0 ||
      this.dragPitch !== 0 ||
      this.dragVelYaw !== 0 ||
      this.dragVelPitch !== 0
    )
  }

  private setOver(v: boolean) {
    if (v === this.overMascot) return
    this.overMascot = v
    this.overListeners.forEach((cb) => {
      try {
        cb(v)
      } catch (err) {
        console.error('MascotEngine: hover listener threw', err)
      }
    })
  }

  /**
   * Stop the spin and turn the face to the viewer.
   *
   * Spec §6.5: in the room SAMSARA is stationary and front-facing, and that is
   * what finally makes the eyes legible — in the hero the face points at the
   * viewer roughly 25% of each 3.2s turn, which was an owner decision for the
   * ORBIT and is not reopened.
   *
   * ⚠️ Not `setInspect`, which also hijacks the orbit angle and the size. This
   * touches the spin and nothing else, so the landed pose stays the sequence's
   * to decide.
   */
  setSpinParked(v: boolean) {
    this.spinParked = v
  }

  getSpinParked() {
    return this.spinParked
  }

  /**
   * Throw the room away so the next setRoomVisible(true) builds a fresh one.
   *
   * `setRoomConfig` reaches colours and intensities, which are uniforms. DEPTH
   * is GEOMETRY — the floor, four walls and the backdrop are sized from it at
   * build time — so tuning it live needs a rebuild. No WebGL context is
   * involved, so this is not the canvas-poisoning hazard `dispose(true)` is.
   */
  rebuildRoom() {
    if (!this.room) return
    const wasVisible = this.room.group.visible
    this.scene.remove(this.room.group)
    this.room.dispose()
    this.room = null
    if (wasVisible) this.setRoomVisible(true)
  }

  /** The camera every render goes through. Ortho unless explicitly swapped. */
  private activeCamera(): THREE.Camera {
    return this.cameraMode === 'perspective' ? this.persp : this.camera
  }

  /**
   * Show or hide the dark room. Built on first show and kept thereafter.
   *
   * ⚠️ Shadows are enabled on the renderer only while the room is visible.
   * Leaving shadowMap.enabled on for the orbit would pay a shadow pass on every
   * hero frame for a scene that casts none.
   */
  /**
   * Lazily fetch the emitter orb model and build the hologram scene.
   *
   * ⚠️ LAZY on purpose. A hero-only visit must never pay 590 KB for a model it
   * will not draw, exactly as the room's own high-detail LOD is deferred.
   *
   * Resolves false rather than throwing when the fetch fails: a missing orb
   * must degrade to a room with no hologram, never to a broken room. That is
   * the same fail-open rule the sequence itself follows for a missing GL
   * context.
   */
  async loadEmitters(url: string): Promise<boolean> {
    if (this.disposed || this.emitters || this.orbLoading) return !!this.emitters
    this.orbLoading = true
    try {
      const draco = new DRACOLoader()
      draco.setDecoderPath('/draco/')
      const loader = new GLTFLoader()
      loader.setDRACOLoader(draco)
      const gltf = await loader.loadAsync(url)
      if (this.disposed) return false

      // Normalise to a unit radius so `pose.radius` is the only scale that
      // matters downstream, whatever units the file happens to carry.
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const centre = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      model.position.sub(centre)
      const norm = new THREE.Group()
      norm.add(model)
      norm.scale.setScalar(2 / maxDim)

      this.orbModel = norm
      this.emitters = createEmitterScene(norm)
      this.scene.add(this.emitters.group)
      return true
    } catch {
      return false
    } finally {
      this.orbLoading = false
    }
  }

  /** True once the orbs are loaded and their scene is in the graph. */
  hasEmitters(): boolean {
    return !!this.emitters
  }

  /**
   * The hologram's per-frame state, or null to stand it down.
   *
   * Stored rather than applied here: the scene must be updated from inside the
   * render loop so its rect lands in the SAME snapshot as the pose.
   */
  setHologram(a: EmitterUpdateArgs | null) {
    this.holoArgs = a
    if (!a && this.emitters) this.emitters.group.visible = false
  }

  setRoomVisible(v: boolean) {
    if (v && !this.room) {
      this.room = buildRoom(this.roomCfg)
      this.scene.add(this.room.group)
      this.spinner.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true
      })
    }
    if (this.room) this.room.group.visible = v
    this.renderer.shadowMap.enabled = v
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }

  /**
   * The room's expression schedule. See IdleEyesConfig.
   *
   * Separate from setEyeConfig(), which carries the owner-approved ORBIT
   * behaviour (shapes, glance timing, the facing threshold) and is not reopened
   * here. Only what SCHEDULES an expression changes in the room; eyes.ts is
   * untouched, exactly as spec §6.5 requires.
   */
  setIdleEyes(cfg: IdleEyesConfig) {
    this.idleEyes = cfg
  }

  setRoomConfig(cfg: RoomConfig) {
    this.roomCfg = cfg
    this.room?.setConfig(cfg)
    this.applyMascotTint()
    if (this.mode !== 'orbit') this.applyEnvironmentFor(this.mode)
  }

  /**
   * SAMSARA's material as it renders in the room. See RoomConfig's own comment
   * for why this exists and why it defaults to a no-op.
   *
   * ⚠️ NEVER sets `needsUpdate`. Color and roughness are plain shader uniforms
   * on a MeshStandardMaterial — `needsUpdate` forces a full program recompile,
   * which is the exact trap this project's own reveal-ramp bug was: see the
   * `Material.needsUpdate` note in docs/superpowers/verification/README.md.
   * Recompiling four programs to change a colour would be that bug's sibling.
   */
  private applyMascotTint() {
    const cfg = this.roomCfg
    const inRoom = this.mode !== 'orbit'

    // ⚠️ Roughness is INDEPENDENT of the tint, and coupling them was a bug.
    // Both used to be gated behind `TINT_STRENGTH > 0`, so turning the colour
    // tint off silently disabled the roughness the owner had dialled in — two
    // unrelated controls where moving one killed the other, with nothing on
    // screen or in the console to say so.
    this.eyeUniforms.uTtRough.value = inRoom ? Math.max(0, cfg.MASCOT_ROUGHNESS_BOOST) : 0

    const tinting = inRoom && cfg.MASCOT_TINT_STRENGTH > 0
    const target = tinting ? this.scratchTintColor.set(cfg.MASCOT_TINT_COLOR) : null
    for (let i = 0; i < this.materials.length; i++) {
      const base = this.materialBase[i]
      if (!base) continue
      const m = this.materials[i]
      if (tinting && target) m.color.copy(base.color).lerp(target, cfg.MASCOT_TINT_STRENGTH)
      else m.color.copy(base.color)
    }
  }

  hasRoom() {
    return !!this.room
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

  /**
   * The environment SAMSARA reflects while it is in the room.
   *
   * ⚠️ This is the single biggest lever on how the mascot reads, and it is not
   * a light. The material is `metallic: 1`, and a pure metal has NO diffuse
   * term — what you see is almost entirely what it reflects. three.js's
   * RoomEnvironment is a neutral white studio, so a copper model lit by it
   * comes back grey, and reads as polished chrome rather than warm brass. No
   * amount of light INTENSITY fixes that; the reflected colour has to change.
   *
   * Built by recolouring RoomEnvironment's emissive panels rather than by
   * authoring a new studio: the panel LAYOUT is what gives the model its
   * highlight structure and is worth keeping — only the colour is wrong.
   *
   * Rebuilt when the tint or intensity changes, and only ever while in the
   * room. The hero's orbit keeps the neutral environment it was approved
   * under, where the body is 12.6-70px and its hue is not the point.
   */
  private buildRoomEnvironment() {
    const cfg = this.roomCfg
    const key = `${cfg.ENV_COLOR}|${cfg.ENV_INTENSITY}`
    if (this.roomEnvKey === key && this.roomEnvRT) return
    this.roomEnvKey = key

    const scene = new RoomEnvironment()
    const tint = new THREE.Color(cfg.ENV_COLOR)
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!m || !m.isMeshStandardMaterial) return
      // Multiply rather than replace: the studio's relative panel brightnesses
      // are what shape the highlights, and flattening them to one colour would
      // trade a grey model for an evenly-lit orange one.
      m.color.multiply(tint)
      if (m.emissive) m.emissive.multiply(tint)
    })

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const rt = pmrem.fromScene(scene, 0.04)
    pmrem.dispose()
    this.roomEnvRT?.dispose()
    this.roomEnvRT = rt
  }

  /** Swap between the orbit's neutral environment and the room's warm one. */
  private applyEnvironmentFor(mode: 'orbit' | 'transit' | 'room') {
    if (mode === 'orbit') {
      this.scene.environment = this.envRT?.texture ?? null
      this.scene.environmentIntensity = this.cfg.ENV_INTENSITY
      return
    }
    this.buildRoomEnvironment()
    this.scene.environment = this.roomEnvRT?.texture ?? this.envRT?.texture ?? null
    this.scene.environmentIntensity = this.roomCfg.ENV_INTENSITY
  }

  /**
   * Anisotropic filtering on every map the model carries.
   *
   * ⚠️ Not a micro-optimisation — on THIS model it is the difference between
   * worked metal and flat chrome. The material's UVs carry
   * KHR_texture_transform at scale ~16, so the maps TILE SIXTEEN TIMES across
   * the body. three.js defaults `anisotropy` to 1, which means that at grazing
   * angles — and on a sphere almost every texel is at a grazing angle — the
   * sampler falls back to a blurred mip and the normal map's hammered
   * micro-relief disappears. A metal with no micro-relief has nothing to break
   * up its specular, and reads as polished chrome.
   *
   * Costs no bytes and no draw calls: it is a sampler state, applied once per
   * texture at load.
   */
  private applyTextureQuality() {
    const max = this.renderer.capabilities.getMaxAnisotropy()
    for (const m of this.materials) {
      for (const map of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap]) {
        if (!map || map.anisotropy === max) continue
        map.anisotropy = max
        map.needsUpdate = true
      }
    }
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

  /** HEIGHT plus the live bob — the value place() feeds projectOrbit. */
  private orbitHeightPx() {
    const c = this.cfg
    const bob = c.BOB_PX
      ? Math.sin((this.elapsed / Math.max(0.1, c.BOB_SECONDS)) * Math.PI * 2) * c.BOB_PX
      : 0
    return c.HEIGHT + bob
  }

  private sizePx() {
    if (this.inspect.on) return this.inspect.sizePx
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
    // Keep the room camera's aspect in step, or a resize mid-transit stretches it.
    this.persp.aspect = H > 0 ? W / H : 1
    this.persp.updateProjectionMatrix()
    this.syncBurstProjection()
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
    this.renderer.render(this.scene, this.activeCamera())
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
    /**
     * ⚠️ The scroll fade belongs to the HERO ORBIT ONLY.
     *
     * `scrollAlpha` is `1 - scrollY / (SCROLL_FADE_VH * innerHeight)` — at 0.6vh
     * it reaches zero after about half a screen — and it is right for a mascot
     * circling a mark the visitor is scrolling away from.
     *
     * It is wrong the moment SAMSARA is in the ROOM. There the canvas is
     * `position: fixed` and covers the viewport, the pin is released on landing,
     * and the body is the subject rather than something being left behind. With
     * the fade still applied, scrolling down inside Section 2 dimmed the eye
     * display and the smoke and then erased SAMSARA entirely, leaving an empty
     * lit room — measured gone by scrollY 800 at an 800px viewport, while the
     * room itself stayed because it is not gated by this alpha.
     *
     * In `transit` the page is pinned so scrollY cannot move, but the same rule
     * is applied there: once the sequence owns the body, page scroll does not
     * get a say in whether it is visible.
     */
    const scrollFade = this.mode === 'orbit' ? this.scrollAlpha : 1
    const alpha = entrance * scrollFade * (c.ENABLED ? 1 : 0)

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
    if (this.inspect.on) {
      // Parked and face-on. The face is +Z in model space and only the spin
      // turns it, so spin 0 IS frontal — which also pins cos(spin) at 1, well
      // above any FACING_THRESHOLD, so the glance beat keeps running and can be
      // watched. The orbit is frozen at the owner's chosen angle rather than a
      // computed "best" one: where the mascot reads most clearly depends on the
      // viewport and on what else is switched on.
      this.angle = (this.inspect.angleDeg * Math.PI) / 180
      this.spin = 0
    } else {
      this.angle +=
        dir * motion * belt.ORBIT_SPEED * c.SPEED_SCALE * speedFactor * 0.012 * dt
      if (this.spinParked) {
        // Ease to the NEAREST frontal orientation, never snap. The face is +Z
        // in model space and only the spin turns it, so a whole multiple of 2pi
        // is frontal — rounding to the nearest one means SAMSARA turns at most
        // half a revolution to face the viewer, in whichever direction it was
        // already going.
        const TAU = Math.PI * 2
        const target = Math.round(this.spin / TAU) * TAU
        this.spin += (target - this.spin) * Math.min(1, 0.08 * dt)
      } else {
        this.spin += ((c.SPIN_SPEED * Math.PI) / 180) * (dt / 60)
      }
    }

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

    // ── SAMSARA transition: pose comes from the script, not the orbit ──
    // The whole of the `orbit` path below is untouched; this branch simply
    // supplies a q from elsewhere. z is forced negative so the depth flip
    // reports "in front" — once SAMSARA has committed to leaving it never needs
    // to pass behind the mark again, and it stays visible for the whole fall.
    let q: { x: number; y: number; z: number; scale: number }
    let scriptedDiameter: number | null = null

    if (this.mode !== 'orbit' && this.transform) {
      const t = this.transform
      // Owner: "when smiling, samsara will be shaking up and down." Applied
      // HERE rather than in the sequence because only the engine knows when a
      // smile was picked — the sequence has no view of the expression pool.
      // A decaying bob, so it settles rather than stopping mid-swing.
      let y = t.y
      const idle = this.idleEyes
      if (this.holdingSmile) {
        // Held: a CONTINUOUS bob, looping for as long as the visitor keeps
        // hold. SMILE_SHAKE_MS is the loop period here rather than a decay
        // length — same amplitude and rhythm as the idle smile, so the two read
        // as one behaviour rather than two.
        const period = Math.max(1, idle.SMILE_SHAKE_MS) / 1000
        y += Math.sin((this.holdSmileT / period) * Math.PI * 2) * idle.SMILE_SHAKE_PX
        this.holdSmileT += dtSec
      } else if (this.smileShakeT >= 0) {
        // Unheld: the same bob DECAYING to rest. Also what a release hands over
        // to, so letting go settles instead of stopping mid-swing.
        const dur = Math.max(1, idle.SMILE_SHAKE_MS) / 1000
        const p01 = this.smileShakeT / dur
        if (p01 >= 1) this.smileShakeT = -1
        else y += Math.sin(p01 * Math.PI * 4) * idle.SMILE_SHAKE_PX * (1 - p01)
        this.smileShakeT += dtSec
      }
      q = { x: t.x, y, z: -1, scale: 1 }
      scriptedDiameter = t.sizePx
    } else {
      const tiltRad = ((belt.TILT + c.TILT_OFFSET) * Math.PI) / 180
      // The override replaces the WHOLE angle argument, PHASE included, so that
      // an override of farPointAngle() lands on exactly the pose
      // transitScript.transitPoseAt(0) computes. Adding PHASE on top would put
      // the seam a few degrees off the far point and reintroduce the jump the
      // whole handoff exists to avoid.
      const orbitAngle = this.angleOverride ?? this.angle + (c.PHASE * Math.PI) / 180
      // Recorded with the frame, not read live off the field. A verification
      // script sampling on its own rAF cannot otherwise tell whether the angle
      // it sees is the one that produced the pose it is looking at, and the
      // seam assertion depends on picking exactly the frame the sweep settled.
      this.lastRendered.orbitAngle = orbitAngle
      q = projectOrbit(
        belt,
        this.cx,
        this.cy,
        this.orbitR,
        orbitAngle,
        this.orbitHeightPx(),
        tiltRad,
      )

      if (charge > 0.01 && c.HOLD_SHAKE_PX > 0) {
        const amp = charge * c.HOLD_SHAKE_PX
        q.x += Math.sin(this.shakePhase) * amp
        q.y += Math.cos(this.shakePhase * 1.31) * amp
      }
    }

    this.lastScreen = { x: q.x, y: q.y, z: q.z, scale: q.scale }

    const visible = alpha > 0.001
    this.placer.visible = visible

    // Screen px (y down, origin top-left) -> the ortho camera's centred space.
    const X = q.x - this.W / 2
    const Y = this.H / 2 - q.y
    this.placer.position.set(X, Y, 0)
    // Overwritten below when the perspective camera is live — the ortho values
    // are computed unconditionally because the trail and the label both consume
    // X/Y in screen-centred space regardless of which camera renders them.

    // Beyond the perspective divide, matching SAT_DEPTH_SCALE so the mascot
    // and the beads share one depth cue rather than two different ones.
    //
    // Inspect mode opts out: the depth cue is a function of where the mascot is
    // parked, so leaving it on made "inspect diameter 320" render a 144px body
    // and change size again whenever the park angle moved. A tuning control
    // that reports one number and draws another is worse than no control.
    const depthScale = this.inspect.on ? 1 : 1 + (q.scale - 1) * (1 + c.DEPTH_SCALE * 4)
    // A scripted pose carries its own on-screen size — the transit interpolates
    // from the far point's ~21px to 40% of viewport height, and running that
    // through the orbit's depth cue as well would apply the falloff twice.
    const diameterPx = scriptedDiameter ?? this.sizePx() * Math.max(0.15, depthScale)
    this.lastDiameterPx = diameterPx
    const radiusPx = diameterPx / 2
    this.placer.scale.setScalar(diameterPx)
    // Room-only reshape. Applied to the PLACER, so the eye display is
    // unaffected: the shader works in object space from the pre-transform
    // `position`, which this never touches.
    if (this.mode !== 'orbit') {
      this.placer.scale.set(
        diameterPx * this.roomCfg.MASCOT_STRETCH_X,
        diameterPx * this.roomCfg.MASCOT_STRETCH_Y,
        diameterPx,
      )
    }

    // ── perspective placement ─────────────────────────────────────────
    //
    // ⚠️ This is the gap Task 8 left open and Task 11 closes. The two lines
    // above place SAMSARA in ORTHOGRAPHIC screen-pixel space — position in the
    // hundreds, scale in pixels. Under the perspective camera those numbers are
    // world units, which puts the body far outside the frustum and renders an
    // empty room. That is not hypothetical: it is what happened the first time
    // the room's dev handle swapped cameras.
    //
    // The conversion is deliberately per frame rather than solved once at the
    // handoff. Solving once matches the seam instant and nothing after it;
    // solving position AND size at the body's CURRENT depth every frame makes
    // the whole transit exact, which is strictly stronger and costs two
    // divisions. transitZ is the plane it sits on — the sequence advances it
    // through the room so the shadow falls where the body actually is.
    if (this.cameraMode === 'perspective') {
      const dist = Math.max(0.001, this.persp.position.z - this.transitZ)
      const w = screenToWorld(q.x, q.y, dist, this.W, this.H, this.persp.fov)
      this.placer.position.set(w.x, w.y, this.transitZ)
      const world = worldSizeFor(diameterPx, dist, this.H, this.persp.fov)
      this.placer.scale.set(
        world * this.roomCfg.MASCOT_STRETCH_X,
        world * this.roomCfg.MASCOT_STRETCH_Y,
        world,
      )
    }

    // ── orientation ───────────────────────────────────────────────────
    //
    // In the belt this is one number: SPIN_TILT rolls the axis, `spin` turns the
    // body, and that was the right shape for a mascot sweeping past at 12.6-70px.
    //
    // Parked in the room it is a POSE, because the owner has to aim the face at
    // the visitor. Both live here rather than in two branches of the caller, so
    // there is exactly one place that decides what SAMSARA is pointing at.
    //
    // `posed` chases the target instead of taking it, and the yaw target is
    // wrapped to the nearest turn — otherwise parking a body that has spun 40
    // times would unwind all 40 on screen before it settled.
    this.updateDrag(dtSec)
    const parked = this.mode === 'room' && (this.spinParked || this.dragTouched())
    if (parked) {
      const TAU = Math.PI * 2
      const yawTarget = this.roomPose.y + Math.round((this.posed.y - this.roomPose.y) / TAU) * TAU
      // Time-based, so the settle takes the same wall-clock time on a 144Hz
      // display as on a 60Hz one.
      const k = 1 - Math.exp(-dtSec * 6)
      this.posed.x += (this.roomPose.x - this.posed.x) * k
      this.posed.y += (yawTarget - this.posed.y) * k
      this.posed.z += (this.roomPose.z - this.posed.z) * k
    } else {
      this.posed.x = 0
      this.posed.y = this.spin
      this.posed.z = (c.SPIN_TILT * Math.PI) / 180
    }

    this.tilter.rotation.z = this.posed.z
    this.spinner.rotation.set(this.posed.x + this.dragPitch, this.posed.y + this.dragYaw, 0)

    // Motes are shed at the mascot's own position, so the wake traces the real
    // orbit rather than an idealised one — the hold-shake jitter above is
    // included on purpose.
    this.updateTrail(dtSec, alpha, X, Y)
    // Parked is the same condition the pose easing uses just above, so the dust
    // starts exactly when the body stops turning rather than on a second rule.
    this.updateBurst(dtSec, alpha, parked)
    this.updateEyes(dtSec, charge, diameterPx, alpha)
    this.placeLabel(q, radiusPx, alpha)

    this.recordProjection()

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
  /**
   * Where the body ACTUALLY lands on screen, in CSS px, and how wide it
   * actually renders — the placer's own transform pushed back through the
   * camera that is about to draw it. Verification instrument; see __ttMascot.
   *
   * ⚠️ Recorded at the END of place(), not computed on demand from the dev
   * handle. A caller sampling on its own rAF lands BETWEEN this engine's frame
   * and the sequence's, where the camera can already have been swapped while
   * the placement is still the previous frame's — which reads as a 2,300px jump
   * at the seam that never appears on screen, because place() and render() are
   * consecutive statements and can never disagree. Recording it here makes the
   * instrument report frames the renderer actually drew.
   */
  private recordProjection() {
    const cam = this.activeCamera()
    // placer is a direct child of the scene, which sits at the identity, so its
    // local position IS its world position — no matrixWorld, which has not been
    // recomputed yet at this point in the frame.
    const c = this.placer.position
    const centre = c.clone().project(cam)
    // ⚠️ scale.Z, not scale.Y. Z is the axis MASCOT_STRETCH never touches, so
    // this reports the SCRIPTED size — which is what the seam is about. Measured
    // off Y instead, a 1.12 vertical stretch would show up as a 12% mismatch
    // between the pose the script asked for and the pose that rendered, on every
    // frame, and read as a broken projection rather than a deliberate reshape.
    // Before the stretch existed the scale was uniform, so this changes nothing
    // that came before it.
    const top = new THREE.Vector3(c.x, c.y + this.placer.scale.z / 2, c.z).project(cam)
    const toPxY = (ndcY: number) => (1 - (ndcY * 0.5 + 0.5)) * this.H
    const y = toPxY(centre.y)
    this.lastRendered.x = (centre.x * 0.5 + 0.5) * this.W
    this.lastRendered.y = y
    this.lastRendered.diameterPx = Math.abs(toPxY(top.y) - y) * 2
    this.lastRendered.camera = this.cameraMode
    this.lastRendered.mode = this.mode

    // ── the hologram, drawn and measured in the SAME frame ──────────
    //
    // ⚠️ Both halves happen HERE, next to the pose, and that placement is the
    // whole point rather than convenience.
    //
    // Three rAF callbacks run per browser frame in registration order: the
    // engine's loop, the sequence's loop, then any sampler. A rect computed in
    // a later callback describes THIS frame's render but carries NEXT frame's
    // camera and phase. samsara-seam.mjs cost three separate false readings
    // learning that — a 6px seam and a 2,332px jump that did not exist.
    const holo = this.holoArgs
    if (this.emitters && holo) {
      if (this.holoCfgApplied !== holo.cfg) {
        this.emitters.setConfig(holo.cfg)
        this.holoCfgApplied = holo.cfg
      }
      this.emitters.update(holo)

      const pts = this.emitters.screenCorners()
      if (pts.length === 4 && this.emitters.group.visible) {
        // ⚠️ The bounding box of the four PROJECTED corners — never a
        // projection of the centre plus the world size. Under perspective
        // those differ, and the difference is what would put future subtitles
        // subtly out of place with nothing looking broken.
        //
        // ⚠️ this.W / this.H are the CSS size. The canvas ATTRIBUTES are
        // cssSize x devicePixelRatio, and using them here would reproduce the
        // 25%-too-large presentation bug at dpr 1.25.
        const v = new THREE.Vector3()
        this.lastRendered.holoRect = projectQuad(
          { corners: pts as [Vec3, Vec3, Vec3, Vec3], centre: [0, 0, 0], w: 0, h: 0 },
          (pt) => {
            v.set(pt[0], pt[1], pt[2]).project(cam)
            return [((v.x + 1) / 2) * this.W, ((1 - v.y) / 2) * this.H]
          },
        )
      } else {
        this.lastRendered.holoRect = null
      }
    } else {
      this.lastRendered.holoRect = null
    }
  }

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
      // OFF means the chunks are never injected — the mascot renders with its
      // own painted eyes, exactly as before this feature existed. Clearing
      // onBeforeCompile and forcing a recompile is what makes the switch
      // reversible at runtime rather than only at mount.
      //
      // Zeroing uEyesOn instead would leave the socket mask compiled in and the
      // painted ovals still covered — a black faceplate, which is WORSE than
      // the state the switch promises to restore. Spec §7.4.
      if (!this.eyes.ENABLED) {
        m.onBeforeCompile = () => {}
        delete m.userData.ttEyeShader
        m.needsUpdate = true
        continue
      }
      m.onBeforeCompile = (shader) => {
        try {
          this.injectEyes(shader, m)
        } catch (err) {
          // The eyes are ADDITIVE to a material that already renders. A failure
          // here must leave the mascot showing its own painted face, never
          // blank it. Spec §10.
          console.error('MascotEngine: eye display disabled — shader patch failed', err)
        }
      }
      m.needsUpdate = true
    }
  }

  /** The actual injection, split out so patchEyes can guard it. */
  private injectEyes(shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }, m: THREE.MeshStandardMaterial) {
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
      .replace(
        '#include <common>',
        // ⚠️ The uniform DECLARATION rides along here, and it is not optional.
        // Adding a uniform to `shader.uniforms` only binds a VALUE — GLSL still
        // has to be told the symbol exists, or the program fails to compile and
        // the material renders NOTHING. That is exactly what happened when the
        // roughness lever below was added without it: SAMSARA vanished
        // completely, and the only trace was a console entry.
        `#include <common>\nuniform float uTtRough;\n${EYES_FRAGMENT_CHUNK}`,
      )
      /**
       * ⚠️ A REAL roughness lever, and it has to live in the shader.
       *
       * `material.roughness` MULTIPLIES the roughness map. The source material
       * ships `roughness: 1` — already the maximum — so ADDING to the factor
       * cannot make anything rougher: it clamps and does nothing. That is why
       * "still too shiny" survived a roughness boost of 0.5.
       *
       * Blending the sampled value TOWARD 1 after the map is read is the only
       * way to actually take gloss out, and it keeps the map's variation
       * instead of flattening every surface to a single value.
       */
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 1.0, clamp(uTtRough, 0.0, 1.0));`,
      )
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
    const t = this.eyes
    u.uEyesOn.value = alpha

    // Scanlines are moire on a small body: 7 lines over an 18px-tall eye.
    // Faded in with size rather than switched, so it cannot pop.
    u.uScanline.value =
      diameterPx > t.SCANLINE_MIN_PX
        ? Math.min(t.SCANLINE_MAX, (diameterPx - t.SCANLINE_MIN_PX) / Math.max(0.01, t.SCANLINE_RAMP))
        : 0

    // ── what schedules an expression ──────────────────────────────────
    //
    // ⚠️ Two different clocks, because the orbit and the room are two different
    // problems.
    //
    // In the belt the face sweeps past the viewer, so a glance fires on the
    // RISING EDGE of `isFacing` — which is right there and is owner-approved.
    // Parked in the room that edge NEVER COMES AGAIN: cos(spin) sits above the
    // threshold permanently, `wasFacing` stays true, and SAMSARA plays exactly
    // one expression on arrival and then rests on neutral for the rest of the
    // scene. That is not a subtle bug; it is the whole face going quiet.
    //
    // So the room runs a timer instead (spec §6.5), over its OWN weight pool.
    const roomIdle = this.mode === 'room'
    if (roomIdle) {
      const idle = this.idleEyes
      this.idleMs += dtSec * 1000
      if (this.idleMs >= Math.max(1, idle.INTERVAL_MS)) {
        this.idleMs = 0
        this.glanceT = 0
        this.glanceExpr = pickWeighted(
          idle.WEIGHTS,
          Math.random(),
          t.NO_REPEAT ? this.lastGlance : null,
        )
        if (this.glanceExpr) this.lastGlance = this.glanceExpr
        // Owner: "when smiling, samsara will be shaking up and down."
        if (this.glanceExpr === 'happy') this.smileShakeT = 0
      }
      // Kept in step so the orbit's edge detector cannot fire a second glance
      // on the frame the room hands back.
      this.wasFacing = Math.cos(this.spin) > t.FACING_THRESHOLD
    } else {
      this.idleMs = 0
      this.smileShakeT = -1
      // The face is +Z in model space and only the spin turns it, so cos(spin)
      // is the facing term. > 0 means the display is toward the viewer at all.
      const isFacing = Math.cos(this.spin) > t.FACING_THRESHOLD
      if (isFacing && !this.wasFacing) {
        this.glanceT = 0
        this.glanceExpr = pickWeighted(
          t.WEIGHTS,
          Math.random(),
          t.NO_REPEAT ? this.lastGlance : null,
        )
        if (this.glanceExpr) this.lastGlance = this.glanceExpr
      }
      this.wasFacing = isFacing
    }
    // The beat runs a little shorter than the face-forward window so it lands
    // and resolves while it can actually be seen.
    if (this.glanceT < 1) {
      this.glanceT = Math.min(1, this.glanceT + dtSec / Math.max(0.01, t.GLANCE_SECONDS))
    }

    if (this.forcedExpr) {
      this.setExpression(this.forcedExpr)
      return
    }

    // Owner: "click&hold will make it laugh/smile until click is released."
    //
    // Held above the charge reaction below, because in the room the charge is 0
    // — the sequence stops publishing it once landed — so this is the only
    // press SAMSARA can still answer. Snapped to full rather than blended in:
    // a smile that faded up over a beat would lag the press it is reacting to.
    if (this.holdingSmile && this.idleEyes.HOLD_EXPRESSION) {
      this.setExpression(this.idleEyes.HOLD_EXPRESSION)
      return
    }

    if (charge > 0.02) {
      // Press-and-hold: eyes widen as the charge builds, then squeeze shut at
      // the peak — riding the same gesture the body already reacts to.
      const x = Math.min(0.999, Math.max(0.001, t.CHARGE_CROSSOVER))
      if (charge < x) this.setExpression('neutral', 'wide', charge / x)
      else this.setExpression('wide', 'blink', (charge - x) / (1 - x))
      return
    }

    // Triangle: neutral -> expression -> neutral across the beat. A null
    // expression means the pool is empty, so the face simply rests.
    const p = Math.min(0.99, Math.max(0.01, t.GLANCE_PEAK))
    const g = this.glanceT
    const k = g >= 1 || !this.glanceExpr ? 0 : g < p ? g / p : 1 - (g - p) / (1 - p)
    this.setExpression('neutral', this.glanceExpr ?? undefined, k)
  }

  /** Shapes are frozen in ./eyes.ts; an unknown name resolves to neutral. */
  private exprOf(name: string): Expression {
    return EXPRESSIONS[name] ?? EXPRESSIONS.neutral
  }

  /** Drive the display: set the expression, optionally blended toward another. */
  setExpression(name: string, blendTo?: string, t = 0) {
    const a = this.exprOf(name)
    const b = blendTo ? this.exprOf(blendTo) : a
    const k = blendTo ? Math.min(1, Math.max(0, t)) : 0
    this.writeEyes(lerpEye(a.left, b.left, k), lerpEye(rightOf(a), rightOf(b), k))
  }

  private writeEyes(l: EyeShape, r: EyeShape) {
    const L = this.eyeUniforms.uEyeL.value as Float32Array
    const R = this.eyeUniforms.uEyeR.value as Float32Array
    // A short array would let packEye write past its slots, and a NaN reaching
    // the SDF makes the whole eye vanish with nothing logged. Cheap guard
    // against a class of failure that is silent by nature.
    if (!L || !R || L.length < 12 || R.length < 12) return
    packEye(l, L, 0)
    packEye(r, R, 0)
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
    // A visitor who asked for stillness must not get a face caught mid-glance,
    // and the frame must be deterministic — verification compares this exact
    // frame across configurations.
    this.glanceT = 1
    this.glanceExpr = null
    this.lastGlance = null
    this.wasFacing = false
    // dtSec 0: nothing is shed and nothing drifts. A motion wake on a frame
    // that is deliberately motionless would be a lie about what is happening.
    this.place(1, 0, 0)
    this.setExpression('neutral')
    this.renderer.render(this.scene, this.activeCamera())
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
    this.roomEnvRT?.dispose()
    this.roomEnvRT = null
    if (this.emitters) {
      this.scene.remove(this.emitters.group)
      this.emitters.dispose()
      this.emitters = null
    }
    // The orb model is the emitters' source, so it is retired here rather than
    // in emitterScene.dispose(), which only owns the clones.
    if (this.orbModel) {
      this.orbModel.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[]
        for (const one of Array.isArray(mat) ? mat : [mat]) one?.dispose()
      })
      this.orbModel = null
    }
    this.holoArgs = null
    this.holoCfgApplied = null
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('blur', this.onBlur)
    this.overListeners.clear()
    this.depthCb = null
    // Before the generic scene traversal below, so the room's own lights and
    // shadow map are released explicitly rather than left to the mesh sweep,
    // which only handles meshes.
    this.room?.dispose()
    this.room = null
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
