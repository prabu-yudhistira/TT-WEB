import * as THREE from 'three'
import type { SequenceConfig } from './types'
import {
  orbParkedPose,
  orbPoseAt,
  orbBobY,
  lensWorld,
  type OrbCtx,
  type OrbPose,
  type OrbSlot,
} from './emitterOrbs'
import { makeSmokePool, SmokeState, type SmokeMode } from './orbSmoke'
import { screenQuad, shaftFor, flickerAt, type Vec3 } from './hologramGeometry'
import type { HoloPhase } from './HologramController'

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
  /** Milliseconds since the lagging orb parked — the cadence and flicker clock. */
  parkedMs: number
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

export function createEmitterScene(orbModel: THREE.Object3D): EmitterScene {
  const group = new THREE.Group()
  group.visible = false

  // ── the two orbs: one model, two instances ────────────────────────
  const orbs = SLOTS.map(() => {
    const o = orbModel.clone(true)
    o.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = false
      m.receiveShadow = false
    })
    group.add(o)
    return o
  })

  // ── smoke: one pool and one draw call per orb ─────────────────────
  const smoke = SLOTS.map(() => {
    // Seeded per orb, and differently, so the two plumes are not identical.
    let s = 987654321
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    return new SmokeState(makeSmokePool(POOL), rnd)
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
  const shaftMat = new THREE.MeshBasicMaterial({
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
  const glassMat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glassMat)
  glass.visible = false
  group.add(glass)

  let corners: Vec3[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3()
  const mid = new THREE.Vector3()
  const quat = new THREE.Quaternion()

  const writeSmoke = (i: number, pose: OrbPose, bob: number, clock: number, cfg: SequenceConfig) => {
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
      // Puffs are in ORB RADII with the port offset already baked in by
      // `spawn`, so this is the only place they become world units.
      pos.setXYZ(
        k,
        pose.x + p.x * pose.radius,
        pose.y + bob + p.y * pose.radius,
        pose.z + p.z * pose.radius,
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
      shaftMat.color.set(cfg.HOLOGRAM.SHAFT_COLOR)
      glassMat.color.set(cfg.HOLOGRAM.GLASS_COLOR)
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

      const mode: SmokeMode =
        phase === 'dormant' ? 'off' : phase === 'entering' ? 'thrust' : 'cadence'
      // Thrust counts from the start of entry; the cadence counts from the park.
      const clock =
        phase === 'entering'
          ? a.entry01 * (cfg.EMITTERS.ENTRY_MS + cfg.EMITTERS.ENTRY_STAGGER_MS)
          : a.parkedMs

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

        orbs[i].position.set(pose.x, pose.y + bob, pose.z)
        orbs[i].scale.setScalar(pose.radius)

        smoke[i].update(cfg.EMITTERS, mode, clock, a.dtMs)
        writeSmoke(i, pose, bob, clock, cfg)

        shafts[i].visible = lit
        if (lit) {
          const s = shaftFor(lensWorld({ ...pose, y: pose.y + bob }), quad, cfg.HOLOGRAM)
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
        glassMat.opacity = cfg.HOLOGRAM.GLASS_OPACITY * forming * (1 - dip) * a.reveal
        shaftMat.opacity = cfg.HOLOGRAM.SHAFT_OPACITY * (1 - dip * 0.5) * a.reveal
      } else {
        shaftMat.opacity = lit ? cfg.HOLOGRAM.SHAFT_OPACITY * a.reveal : 0
      }
    },

    screenCorners: () => corners,

    dispose() {
      smokeGeo.forEach((g) => g.dispose())
      smokeMat.dispose()
      shafts.forEach((s) => s.geometry.dispose())
      shaftMat.dispose()
      glass.geometry.dispose()
      glassMat.dispose()
      // The two orbs are clones sharing the source model's geometry and
      // materials, so disposing them here would break the source. The engine
      // owns that; this only drops the clones.
      group.clear()
    },
  }
}
