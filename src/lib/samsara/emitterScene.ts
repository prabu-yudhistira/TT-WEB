import * as THREE from 'three'
import { portOffsets, type EmittersConfig, type SequenceConfig } from './types'
import {
  orbParkedPose,
  orbPoseAt,
  orbBobY,
  orbRot,
  rotateLocal,
  lensWorld,
  type OrbCtx,
  type OrbPose,
  type OrbSlot,
} from './emitterOrbs'
import { makeSmokePool, SmokeState, type PortSpec, type SmokeMode } from './orbSmoke'
import { screenQuad, shaftFor, flickerAt, type Vec3 } from './hologramGeometry'
import type { HoloPhase } from './HologramController'
import { DEFAULT_SEQUENCE } from './types'

const DEFAULT_EMITTERS = DEFAULT_SEQUENCE.EMITTERS

/**
 * The GL half of the emitter orbs and the holographic screen.
 *
 * Same shape as `room.ts`: build once, mutate per frame, dispose explicitly.
 * Every decision about WHERE something goes lives in the pure modules this
 * imports — nothing here computes a position, only draws one.
 *
 * ⚠️ NOTHING in this group casts or receives shadows. `room.ts` runs exactly
 * one shadow-casting light on purpose, and this project has lost 5.9 fps once
 * already to a lighting-adjacent regression.
 *
 * ⚠️ The shafts are ADDITIVE GEOMETRY, not fog. `scene.fog` is banned here
 * because the room shares its scene with the hero orbit, and fog would tint
 * SAMSARA while it is still circling the mark.
 */

export type EmitterUpdateArgs = {
  cfg: SequenceConfig
  ctx: OrbCtx
  phase: HoloPhase
  entry01: number
  form01: number
  /** Milliseconds since the lagging orb parked — the flicker and bob clock. */
  parkedMs: number
  /**
   * Milliseconds since the sequence armed. MONOTONIC.
   *
   * ⚠️ Separate from parkedMs on purpose. The smoke clock stamps every puff's
   * birth and is what `sample` measures age against, so it must never go
   * backwards. It used to be `entry01 * entryTotal` while entering and then
   * `parkedMs`, which JUMPS BACK to zero at the hand-off — every live puff
   * would read as unborn and the whole cloud would vanish for a second and a
   * half. Harmless while the entrance was a separate burst mode; not harmless
   * now the emission is continuous across that boundary.
   */
  smokeMs: number
  dtMs: number
  /** The room's own reveal ramp, so the orbs arrive with the room rather than before it. */
  reveal: number
}

export type EmitterScene = {
  group: THREE.Group
  setConfig(cfg: SequenceConfig): void
  update(a: EmitterUpdateArgs): void
  /** The screen's four world-space corners, for the projected-rect contract. */
  screenCorners(): Vec3[]
  dispose(): void
}

const SLOTS: OrbSlot[] = ['near', 'far']

/**
 * ⚠️ Sized for THRUST, not for the cadence.
 *
 * Thrust runs at THRUST_RATE per second per port across four ports for the
 * whole entry; the cadence is a few puffs every three seconds. A pool sized for
 * the cadence truncates the entrance silently — puffs stop appearing and
 * nothing logs.
 */
const POOL = 420

/**
 * Per-point alpha and size, which `PointsMaterial` cannot express.
 *
 * The puff bloom — faint at birth, peaking mid-life, gone at death — is the
 * whole reason the smoke reads as steam rather than as popping dots, and it is
 * per-particle by definition. A fixed-size, fixed-opacity material would throw
 * that away.
 */
const SMOKE_VERT = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (uScale / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

const SMOKE_FRAG = /* glsl */ `
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    // Soft round falloff. A hard disc reads as a sprite, not as vapour.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = vAlpha * (1.0 - r) * (1.0 - r);
    gl_FragColor = vec4(uColor, a);
  }
`

/**
 * A light shaft, not a translucent wedge.
 *
 * A cone drawn at uniform opacity reads as a solid polygon with hard edges,
 * because every fragment is equally opaque no matter how much notional volume
 * the eye is looking through. Two terms fix that:
 *
 *  - a FRESNEL term, so the surface is most transparent where it faces the
 *    camera and brightest at grazing angles, which is how looking through a
 *    volume of lit dust actually behaves;
 *  - a LENGTH falloff, so the beam is strongest at the lens and dissipates
 *    toward the screen instead of ending in a hard rim.
 */
const SHAFT_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vT;
  void main() {
    // ConeGeometry runs along local Y from -0.5 (base) to +0.5 (apex).
    vT = position.y + 0.5;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const SHAFT_FRAG = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vT;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - facing, 1.6);
    // vT = 1 is the apex, which sits at the lens. Brightest there.
    float along = mix(0.15, 1.0, vT);
    gl_FragColor = vec4(uColor, uOpacity * rim * along);
  }
`

/**
 * The glass — the owner's HUD panel, drawn procedurally.
 *
 * Signed-distance fields rather than a texture, for three reasons that all
 * matter here: the panel is re-projected at every viewport so a bitmap would
 * resample and soften; its colour is CMS-driven, so a baked-in amber would need
 * re-exporting to retune; and the flicker scales one uniform rather than
 * cross-fading two images.
 *
 * ⚠️ All geometry is laid out in U-SPACE: u = vUv.x * aspect, v = 1 - vUv.y.
 * That makes u and v share a scale, so a circle stays a circle and a chamfer
 * keeps 45 degrees whatever the screen's aspect happens to be. It also puts the
 * origin TOP-LEFT, matching how the reference art is measured.
 *
 * Coordinates below are taken directly off the owner's reference at 1012x599.
 */
const GLASS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GLASS_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uAspect;

  /**
   * ⚠️ Layout is in NORMALISED panel space, not in world or aspect units.
   *
   * n = (vUv.x, 1 - vUv.y), so both axes run 0..1 with the origin TOP-LEFT,
   * matching how the reference art is measured. Every coordinate below is a
   * fraction of the owner's 1012x599 reference, so the composition holds its
   * proportions whatever aspect the panel ends up at.
   *
   * DISTANCES are a different matter: a step in n.x covers uAspect times more
   * of the panel than the same step in n.y. Anything that must stay round or
   * keep an even thickness converts x into y-units by multiplying by uAspect —
   * without that the ring becomes an ellipse and the frame's verticals come out
   * thinner than its horizontals.
   */

  float lineY(float dy, float t, float soft) {
    return 1.0 - smoothstep(t, t + soft, abs(dy));
  }

  float boxFill(vec2 p, vec2 c, vec2 h, float soft) {
    vec2 d = abs(p - c) - h;
    float o = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    return 1.0 - smoothstep(0.0, soft, o);
  }

  void main() {
    float A = uAspect;
    vec2 n = vec2(vUv.x, 1.0 - vUv.y);
    // Same point in y-units, for anything measuring a distance.
    vec2 y = vec2(n.x * A, n.y);

    float soft = 0.0055;
    float t = 0.013;      // half-thickness of every rule
    float ink = 0.0;

    // ── the frame ───────────────────────────────────────────────────
    //
    // An octagon: a box intersected with a diamond. The top edge carries a
    // raised centre section, so v is not folded about the middle the way u is.
    float inset = 0.048;
    float cham = 0.115;
    float hw = A * 0.5 - inset;
    float hh = 0.5 - inset;
    float pu = abs(y.x - A * 0.5);

    float plateau = smoothstep(0.205, 0.222, n.x) - smoothstep(0.778, 0.795, n.x);
    float topY = (0.5 - hh) - plateau * 0.038;

    float box = max(pu - hw, max(y.y - (0.5 + hh), topY - y.y));
    float diamond = (pu + abs(y.y - 0.5)) - (hw + hh - cham);
    float frame = max(box, diamond);

    ink += lineY(frame, t, soft);

    // ── left: a short vertical rule ─────────────────────────────────
    if (n.y > 0.317 && n.y < 0.534) {
      ink += lineY((n.x - 0.071) * A, 0.009, soft);
    }

    // ── left: the segmented gauge ───────────────────────────────────
    //
    // A ladder of rungs on a repeating v, so the count follows the panel
    // instead of being a fixed list of quads.
    if (n.y > 0.481 && n.y < 0.876 && n.x > 0.045 && n.x < 0.071) {
      float pitch = 0.0188;
      float rung = mod(n.y - 0.481, pitch);
      ink += (1.0 - smoothstep(0.0062, 0.0062 + soft, abs(rung - pitch * 0.5)));
    }

    // ── bottom left: the dashed ring ────────────────────────────────
    vec2 ringC = vec2(0.155 * A, 0.805);
    vec2 rv = y - ringC;
    float rd = length(rv) - 0.092;
    float ang = atan(rv.y, rv.x);
    float dash = step(0.36, fract(ang / 6.28318530718 * 22.0));
    ink += lineY(rd, 0.010, soft) * dash;

    // ── bottom: the long rule ───────────────────────────────────────
    if (n.x > 0.321 && n.x < 0.692) {
      ink += lineY(n.y - 0.907, 0.009, soft);
    }

    // ── bottom right: two blocks and a tick ─────────────────────────
    ink += boxFill(y, vec2(0.8175 * A, 0.8995), vec2(0.0175 * A, 0.0285), soft);
    ink += boxFill(y, vec2(0.8500 * A, 0.8995), vec2(0.0100 * A, 0.0285), soft);
    if (n.x > 0.865 && n.x < 0.884) {
      ink += lineY(n.y - 0.907, 0.009, soft);
    }

    ink = clamp(ink, 0.0, 1.0);

    /**
     * ── the bloom around every stroke ─────────────────────────────
     *
     * The reference does not read as vector line-art: every stroke carries a
     * wide soft halo, and that halo is most of what makes it look emitted
     * rather than drawn. A crisp SDF edge alone came out looking like a wire
     * diagram, so the frame's distance field is reused as a falloff.
     */
    float halo = exp(-abs(frame) * 22.0) * 0.55;

    /**
     * ── the inner haze ────────────────────────────────────────────
     *
     * Dark in the middle, lifting toward the frame. This is what gives the
     * panel depth instead of reading as a flat coloured pane, and it is
     * clipped hard at the frame so nothing hazes the room outside it.
     */
    float inside = clamp(-frame, 0.0, 1.0);
    float haze = exp(-inside * 7.0) * 0.42;
    float within = step(frame, 0.0);

    float a = uOpacity * (ink * 1.9 + (halo + haze) * within);
    if (a <= 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

export function createEmitterScene(orbModel: THREE.Object3D): EmitterScene {
  const group = new THREE.Group()
  group.visible = false

  // ── the two orbs: one model, two instances ────────────────────────
  /**
   * The clones need their OWN material, and the reflection has to be tamed.
   *
   * ⚠️ Object3D.clone() SHARES materials with the source, so setting anything
   * on a clone would reach back into the model the engine owns.
   *
   * ⚠️ And the orb is metalness 1.0 — a metal has no diffuse term, so every lit
   * pixel is a reflection of scene.environment. That environment is a bright
   * studio, and at full strength it renders the orbs as pale ceramic rather
   * than dark patinated brass. scene.environmentIntensity CANNOT be used to fix
   * it: the scene belongs to the hero orbit too, and dimming it there would
   * change SAMSARA mid-flight. envMapIntensity is per-material and reaches only
   * these two clones.
   */
  const orbMats = new Map<THREE.Material, THREE.Material>()
  const orbs = SLOTS.map(() => {
    const o = orbModel.clone(true)
    o.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = false
      m.receiveShadow = false
      const src = m.material as THREE.Material
      let copy = orbMats.get(src)
      if (!copy) {
        copy = src.clone()
        const std = copy as THREE.MeshStandardMaterial
        if (std.isMeshStandardMaterial) {
          /**
           * ⚠️ The lever here is the BASE COLOUR, and that is not what the
           * material's own numbers suggest.
           *
           * The orb reports metalness 1.0 / roughness 1.0 and carries no
           * envMap of its own, which says "pure metal, lit entirely by
           * scene.environment" — so the obvious fix was envMapIntensity, and
           * it was measured to do NOTHING. Bisected over mean luma on the near
           * orb at 1440x900:
           *
           *   as shipped              86.1
           *   envMapIntensity 0       85.9   <- the environment contributes ~0
           *   + emissiveIntensity 0   85.7   <- so does the emissive map
           *   + base colour black     36.0   <- this is the whole of it
           *
           * The metalness MAP overrides the scalar across most of the shell, so
           * the surface is largely dielectric and the room key light drives an
           * ordinary diffuse response off the albedo. Dimming the base colour
           * is the only control that moves it, which is the same lever
           * ROOM.MASCOT_TINT_STRENGTH provides for SAMSARA.
           */
          std.color.multiplyScalar(0.4)
          // Warmed very slightly toward copper as it darkens, so the orbs read
          // as patinated brass rather than as grey plastic in shadow.
          std.color.offsetHSL(-0.01, 0.06, 0)
          // Kept low even though it measured as inert: if a future room
          // environment is brighter, this stops the orbs floating up with it.
          std.envMapIntensity = 0.35
          std.roughness = Math.min(1, std.roughness * 1.15)
        }
        orbMats.set(src, copy)
      }
      m.material = copy
    })
    group.add(o)
    return o
  })

  // ── smoke: one pool and one draw call per orb ─────────────────────
  /** The four afterburners, pointing down and biased outward by their own offset. */
  const orbPorts = (e: EmittersConfig): PortSpec[] =>
    portOffsets(e).map((o) => ({
      at: o as unknown as readonly [number, number, number],
      dir: [o[0] * 0.3, -0.7, o[2] * 0.3] as const,
    }))

  const smoke = SLOTS.map(() => {
    // Seeded per orb, and differently, so the two plumes are not identical.
    let s = 987654321
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    return new SmokeState(makeSmokePool(POOL), orbPorts(DEFAULT_EMITTERS), rnd)
  })

  const smokeMat = new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color('#ffffff') },
      uScale: { value: 400 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
  })

  const smokeGeo = SLOTS.map(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(POOL), 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(POOL), 1))
    return g
  })

  const smokePoints = smokeGeo.map((g) => {
    const p = new THREE.Points(g, smokeMat)
    // The pool's dead slots sit at the origin; a computed bounding sphere would
    // include them and cull the whole cloud at the wrong moments.
    p.frustumCulled = false
    group.add(p)
    return p
  })

  // ── shafts, one per orb ───────────────────────────────────────────
  const shaftMat = new THREE.ShaderMaterial({
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  // Open-ended cone, apex at the lens. Unit height so scale carries the length.
  const shafts = SLOTS.map(() => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 28, 1, true), shaftMat)
    m.visible = false
    group.add(m)
    return m
  })

  // ── the glass ─────────────────────────────────────────────────────
  const glassMat = new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 0 },
      uAspect: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glassMat)
  glass.visible = false
  group.add(glass)

  /**
   * A marker at each port and at the lens, for placing them by eye.
   *
   * The ports are recessed nozzles on the underside, so an outlier search over
   * the mesh cannot find them the way it finds SAMSARA's protruding exhausts —
   * it returns one bulb. Without a marker a port is invisible until smoke
   * happens to come out of it, which makes "the plume is a bit off" a slow way
   * to discover where a point actually is.
   *
   * Five per orb: four ports and the lens, in two colours so they cannot be
   * confused. Hidden unless EMITTERS.SHOW_PORTS.
   */
  const markerGeo = new THREE.SphereGeometry(0.09, 12, 8)
  const portMarkerMat = new THREE.MeshBasicMaterial({ color: 0x33ff88, depthTest: false })
  const lensMarkerMat = new THREE.MeshBasicMaterial({ color: 0xff4488, depthTest: false })
  const markers: THREE.Mesh[] = []
  for (let i = 0; i < SLOTS.length * 5; i++) {
    const isLens = i % 5 === 4
    const m = new THREE.Mesh(markerGeo, isLens ? lensMarkerMat : portMarkerMat)
    m.visible = false
    // Over everything, or a marker inside the hull is exactly as invisible as
    // the port it is standing in for.
    m.renderOrder = 999
    group.add(m)
    markers.push(m)
  }

  let corners: Vec3[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const quat = new THREE.Quaternion()

  const writeSmoke = (
    i: number,
    slot: OrbSlot,
    pose: OrbPose,
    bob: number,
    clock: number,
    cfg: SequenceConfig,
  ) => {
    const puffs = smoke[i].sample(clock, cfg.EMITTERS)
    const pos = smokeGeo[i].getAttribute('position') as THREE.BufferAttribute
    const al = smokeGeo[i].getAttribute('aAlpha') as THREE.BufferAttribute
    const sz = smokeGeo[i].getAttribute('aSize') as THREE.BufferAttribute
    for (let k = 0; k < POOL; k++) {
      const p = puffs[k]
      if (!p) {
        al.setX(k, 0)
        continue
      }
      /**
       * Puffs are in ORB RADII with the port offset already baked in by
       * `spawn`, so this is the only place they become world units — and the
       * only place the body's orientation reaches them.
       *
       * ⚠️ Rotated by the SAME function that positions the ports and the same
       * three numbers the mesh is given. A plume that did not rotate with the
       * body would pour out of empty space beside it.
       */
      const q = rotateLocal([p.x, p.y, p.z], orbRot(slot, cfg.EMITTERS))
      pos.setXYZ(
        k,
        pose.x + q[0] * pose.radius,
        pose.y + bob + q[1] * pose.radius,
        pose.z + q[2] * pose.radius,
      )
      al.setX(k, p.alpha)
      sz.setX(k, p.size * pose.radius)
    }
    pos.needsUpdate = true
    al.needsUpdate = true
    sz.needsUpdate = true
    smokePoints[i].visible = puffs.length > 0
  }

  return {
    group,

    setConfig(cfg) {
      ;(smokeMat.uniforms.uColor.value as THREE.Color).set(cfg.EMITTERS.PUFF_COLOR)
      // ⚠️ The ports are CONFIG now, so a moved slider has to reach the
      // emitters. Pushed here rather than per frame: setConfig runs on config
      // identity change, which is exactly when a port can have moved.
      for (const st of smoke) st.setPorts(orbPorts(cfg.EMITTERS))
      for (let i = 0; i < markers.length; i++) markers[i].visible = cfg.EMITTERS.SHOW_PORTS
      ;(shaftMat.uniforms.uColor.value as THREE.Color).set(cfg.HOLOGRAM.SHAFT_COLOR)
      ;(glassMat.uniforms.uColor.value as THREE.Color).set(cfg.HOLOGRAM.GLASS_COLOR)
    },

    update(a) {
      const { cfg, ctx, phase } = a
      group.visible = phase !== 'dormant' && a.reveal > 0.01
      if (!group.visible) return

      // Point attenuation is in pixels; half the viewport height is three's own
      // convention and keeps puff size stable across viewports.
      smokeMat.uniforms.uScale.value = ctx.H / 2

      const quad = screenQuad(cfg.HOLOGRAM, ctx)
      corners = quad.corners as unknown as Vec3[]

      const mode: SmokeMode = phase === 'dormant' ? 'off' : 'on'
      const clock = a.smokeMs

      const lit = phase === 'emitting' || phase === 'forming' || phase === 'live'

      SLOTS.forEach((slot, i) => {
        const pose =
          phase === 'entering'
            ? orbPoseAt(
                slot,
                a.entry01 * (cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS),
                cfg.EMITTERS,
                ctx,
              )
            : orbParkedPose(slot, cfg.EMITTERS, ctx)
        // BOB_AMP is in orb radii; no bob during entry, or the arrival wobbles.
        const bob = phase === 'entering' ? 0 : orbBobY(slot, a.parkedMs, cfg.EMITTERS) * pose.radius

        const rot = orbRot(slot, cfg.EMITTERS)
        orbs[i].position.set(pose.x, pose.y + bob, pose.z)
        // ⚠️ Default XYZ Euler order, which is what `rotateLocal` reproduces
        // term for term. Changing one without the other detaches the plume.
        orbs[i].rotation.set(
          (rot.X_DEG * Math.PI) / 180,
          (rot.Y_DEG * Math.PI) / 180,
          (rot.Z_DEG * Math.PI) / 180,
        )
        orbs[i].scale.setScalar(pose.radius)

        smoke[i].update(cfg.EMITTERS, mode, clock, a.dtMs)
        writeSmoke(i, slot, pose, bob, clock, cfg)

        if (cfg.EMITTERS.SHOW_PORTS) {
          const locals = portOffsets(cfg.EMITTERS)
          for (let k = 0; k < 4; k++) {
            const q = rotateLocal(locals[k] as unknown as readonly [number, number, number], rot)
            markers[i * 5 + k].position.set(
              pose.x + q[0] * pose.radius,
              pose.y + bob + q[1] * pose.radius,
              pose.z + q[2] * pose.radius,
            )
            markers[i * 5 + k].scale.setScalar(pose.radius)
          }
          const l = lensWorld({ ...pose, y: pose.y + bob }, cfg.EMITTERS, rot)
          markers[i * 5 + 4].position.set(l[0], l[1], l[2])
          markers[i * 5 + 4].scale.setScalar(pose.radius)
        }

        shafts[i].visible = lit
        if (lit) {
          const s = shaftFor(lensWorld({ ...pose, y: pose.y + bob }, cfg.EMITTERS, rot), quad, cfg.HOLOGRAM)
          mid.set(
            (s.origin[0] + s.target[0]) / 2,
            (s.origin[1] + s.target[1]) / 2,
            (s.origin[2] + s.target[2]) / 2,
          )
          dir
            .set(s.target[0] - s.origin[0], s.target[1] - s.origin[1], s.target[2] - s.origin[2])
            .normalize()
          shafts[i].position.copy(mid)
          // ConeGeometry's axis is +Y; aim it along the lens-to-screen vector.
          shafts[i].quaternion.copy(quat.setFromUnitVectors(up, dir))
          // Widening toward the screen is what reads as a projection rather
          // than as a laser, so the cone's base sits at the screen end.
          shafts[i].scale.set(s.spread * pose.radius * 3, s.length, s.spread * pose.radius * 3)
        }
      })

      // ── the glass ───────────────────────────────────────────────
      const showGlass = phase === 'forming' || phase === 'live'
      glass.visible = showGlass
      if (showGlass) {
        glass.position.set(quad.centre[0], quad.centre[1], quad.centre[2])
        glass.scale.set(quad.w, quad.h, 1)
        /**
         * ⚠️ The flicker touches OPACITY ONLY — never the transform, never
         * visibility, never the phase.
         *
         * The published rect and the `live` state must be byte-identical during
         * a dip, because this screen will carry subtitles and option buttons as
         * DOM on top. A rect that moved with the flicker would jitter that text
         * five times a minute.
         */
        const dip = phase === 'live' ? flickerAt(a.parkedMs, cfg.HOLOGRAM) : 0
        // Forming is an UNSTABLE ramp, not a clean fade — the owner's words
        // were "start from flickering then appear".
        const forming =
          phase === 'forming'
            ? a.form01 * (0.45 + 0.55 * Math.abs(Math.sin(a.form01 * Math.PI * 6.5)))
            : 1
        glassMat.uniforms.uAspect.value = quad.w / Math.max(0.001, quad.h)
        glassMat.uniforms.uOpacity.value =
          cfg.HOLOGRAM.GLASS_OPACITY * forming * (1 - dip) * a.reveal
        shaftMat.uniforms.uOpacity.value =
          cfg.HOLOGRAM.SHAFT_OPACITY * (1 - dip * 0.5) * a.reveal
      } else {
        shaftMat.uniforms.uOpacity.value = lit ? cfg.HOLOGRAM.SHAFT_OPACITY * a.reveal : 0
      }
    },

    screenCorners: () => corners,

    dispose() {
      markerGeo.dispose()
      portMarkerMat.dispose()
      lensMarkerMat.dispose()
      smokeGeo.forEach((g) => g.dispose())
      smokeMat.dispose()
      shafts.forEach((s) => s.geometry.dispose())
      shaftMat.dispose()
      glass.geometry.dispose()
      glassMat.dispose()
      // The clones share the SOURCE model's geometry, which the engine owns and
      // disposes. Their materials are copies made here, so those are ours.
      for (const m of orbMats.values()) m.dispose()
      orbMats.clear()
      group.clear()
    },
  }
}
