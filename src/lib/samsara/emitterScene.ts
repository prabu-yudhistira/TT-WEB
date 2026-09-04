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
import { screenQuad, shaftFor, shaftReach, flickerAt, type Vec3 } from './hologramGeometry'
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
  /**
   * ⚠️ The CAMERA is a parameter, not part of EmitterUpdateArgs. The args are
   * assembled in the React layer, which has no camera and should not grow one;
   * the engine that owns the camera passes it here.
   */
  update(a: EmitterUpdateArgs, cam: THREE.Camera): void
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
 * The light shafts — a FAN OF RAYS, not a wedge.
 *
 * ⚠️ Rewritten 2026-09-04. This was a cone mesh shaded with a fresnel term and
 * a length falloff, which is a perfectly good way to draw a volume of lit dust
 * and is NOT what the owner's reference shows. Their reference is a spray of
 * many fine straight rays from a point, and no amount of tuning a smooth
 * surface produces that: the rays have to be BANDED, and banded on the ANGLE
 * from the source. Everything below follows from that one fact.
 *
 * ── Why a camera-facing plane, and not the cone ─────────────────────
 *
 * The banding is a screen-space effect: what makes a ray a ray is that it runs
 * straight away from the source AS SEEN. On a cone's surface the same maths
 * bands the SURFACE, which is a striped lampshade seen edge-on.
 *
 * So: a plane centred on the lens, turned to face the camera every frame. Its
 * local xy is then the screen plane, the source sits at its origin, and
 * `position.xy` is exactly the reference shader's `coord - raySource` with no
 * projection maths of our own. A full-screen pass would be the other way to do
 * it, and would have to be composited outside this scene, miss the bloom, and
 * carry each orb's projected pixel position — three moving parts to avoid.
 *
 * ⚠️ The fan is banded on cos(angle), NOT on the angle itself. Spacing is
 * therefore wide near the axis and tight at the rim. That is the reference's
 * look and it is deliberate; "fixing" it to even spacing loses the splay.
 */
const SHAFT_VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    // PlaneGeometry(2, 2) runs -1..1 with the lens at its centre, so this is
    // already source-relative. Scale carries the reach.
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SHAFT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vP;
  uniform vec3 uColor;
  uniform float uOpacity;
  /** Fan axis, in the plane's own space — i.e. on screen. */
  uniform vec2 uDir;
  uniform float uSpread;
  uniform float uRays;
  uniform float uSpeed;
  uniform float uFade;
  uniform float uContrast;
  /** The screen's left and right edges, in this plane's own x. */
  uniform vec2 uClip;
  uniform float uBound;
  uniform float uCore;
  uniform float uTip;
  uniform vec3 uCoreColor;
  uniform float uCoreSpan;
  /** Per-orb phase, so two fans are not the same fan twice. */
  uniform float uSeed;
  uniform float uTime;

  float layer(float cosA, float a, float b) {
    // Two beats at different frequencies: one alone gives a regular comb, and
    // a regular comb reads as a printed pattern rather than as light.
    return clamp(
      (0.45 + 0.15 * sin(cosA * a + uTime * uSpeed)) +
      (0.30 + 0.20 * cos(-cosA * b + uTime * uSpeed)),
      0.0, 1.0);
  }

  void main() {
    float dist = length(vP);
    if (dist > 1.0) discard;
    vec2 n = vP / max(dist, 1e-4);
    float cosA = dot(n, uDir);
    if (cosA <= 0.0) discard;
    float cone = pow(cosA, 1.0 / max(uSpread, 0.001));
    /**
     * ONE falloff, shaped.
     *
     * ⚠️ The reference multiplies TWO distance terms — a length falloff over
     * rayLength screen widths and a fade floored at 0.5 over fadeDistance.
     * Both are measured in PIXELS against the viewport, which is why it needs
     * two: neither alone lands in the right place. Here the disc's radius IS
     * the reach, so distance is already normalised and one term does the work.
     * Two linear terms multiplied is what killed the first attempt — the fan
     * was under a quarter strength by the time it left the orb.
     *
     * Completing exactly at dist 1 is what keeps the disc's edge invisible.
     * uFade shapes the curve rather than moving its end: below 1 the ray
     * carries most of its way across the frame, which is what the reference's
     * do.
     */
    float falloff = pow(clamp(1.0 - dist, 0.0, 1.0), max(uFade, 0.01));
    /**
     * ⚠️ A FEATHER on top of the falloff, and it is not redundant.
     *
     * pow(1 - dist, uFade) does reach zero at the disc's edge, but below 1 it
     * arrives there steeply: at uFade 0.5 the last tenth of the radius carries
     * a third of full strength. On the near orb that is a bright arc drawn
     * across the room, and bloom makes it a hoop. Whatever the falloff's
     * shape, the last quarter has to be given away smoothly.
     */
    falloff *= smoothstep(1.0, 0.75, dist);
    float r1 = layer(cosA, 36.2214 * uRays + uSeed, 21.1135 * uRays + uSeed);
    float r2 = layer(cosA, 22.3991 * uRays + uSeed, 18.0234 * uRays + uSeed);
    /**
     * ⚠️ NORMALISED, then crushed — and both halves are load-bearing.
     *
     * Each layer floors at 0.4 and the two are averaged, so their sum never
     * leaves [0.36, 0.9]: the gaps between rays are two thirds as bright as
     * the rays, which is a smooth wash and not a fan. The reference has real
     * darkness between its streaks. Mapping that band onto 0..1 restores the
     * floor; uContrast then decides how wide the gaps read.
     */
    float rays = clamp(((r1 * 0.5 + r2 * 0.4) - 0.36) / 0.54, 0.0, 1.0);
    /**
     * ⚠️ The crush TIGHTENS WITH DISTANCE, and that is what makes a tip.
     *
     * An angular band is a wedge: narrowest at the source, widest at its far
     * end. Drawn that way the fan ends in a row of blunt fans, which is the
     * opposite of the reference — there each ray is a spike that converges to
     * a point. Raising the exponent along the ray eats it from both sides, so
     * only the band's peak survives at the end and the wedge closes back up.
     * The falloff then takes the spike to nothing exactly where it closes.
     */
    rays = pow(rays, max(uContrast, 0.01) * mix(1.0, max(uTip, 1.0), dist));
    /**
     * ⚠️ BOUNDED BY THE SCREEN, left and right.
     *
     * The owner's reference has the fan living INSIDE the panel — the orbs are
     * projecting a screen, not floodlighting the room, and an unbounded fan
     * washes over the floor and past SAMSARA with nothing to say. The bounds
     * are the panel's own edges, handed in already converted into this plane's
     * x so the shader stays free of matrices.
     *
     * Feathered by a share of the span rather than a fixed width, so the edge
     * stays equally soft on a narrow viewport as on a wide one.
     */
    float soft = max(0.01, (uClip.y - uClip.x) * 0.05);
    float edge = smoothstep(uClip.x - soft, uClip.x + soft, vP.x)
               * smoothstep(uClip.y + soft, uClip.y - soft, vP.x);
    // ⚠️ A MIX, not a switch. At 0 the fan is free of the screen entirely; the
    // owner has asked for both looks on different references, and a hard
    // boolean would make the choice a code change instead of a slider.
    float bound = mix(1.0, edge, clamp(uBound, 0.0, 1.0));

    /**
     * The hot core.
     *
     * ⚠️ OUTSIDE the striation and outside the bound. In the reference the
     * rays converge into a small bloom at the emitter, not into a point — and
     * that bloom sits ON the orb, which is below the screen. Banding it would
     * cut it into wedges; bounding it would clip it in half.
     *
     * The radius is a fixed share of the reach rather than a knob of its own:
     * the reach already follows the orb's depth, so this stays the same size
     * on screen wherever the orb is, which is what a lens flare does.
     */
    float core = uCore * exp(-(dist * dist) / (0.05 * 0.05));

    /**
     * Hot at the lens, amber further out.
     *
     * ⚠️ On DISTANCE, not on brightness. Grading by the ray's own strength
     * would make every band's centre-line white for its whole length, which
     * reads as a set of glowing wires. Light does not do that: the throat of
     * the beam is hot because that is where it is dense, and it cools as it
     * spreads. sqrt puts most of the transition close to the source, where the
     * eye reads it as a filament rather than as a wash.
     */
    vec3 tint = mix(uCoreColor, uColor, smoothstep(0.0, max(uCoreSpan, 1e-4), sqrt(dist)));

    gl_FragColor = vec4(tint, min(1.0, uOpacity * rays * cone * falloff * bound + core));
  }
`

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
  //
  // ⚠️ A material EACH, not one shared. uDir differs per orb because the two
  // are at different places relative to the screen, and uSeed differs so the
  // two fans are not a copy of one another — the reference's are visibly
  // distinct. Sharing the material would silently give both orbs whichever
  // one was written last.
  const shaftMats = SLOTS.map((_, i) => new THREE.ShaderMaterial({
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 0 },
      uDir: { value: new THREE.Vector2(0, 1) },
      uSpread: { value: 1 },
      uRays: { value: 1 },
      uSpeed: { value: 1 },
      uFade: { value: 1 },
      uContrast: { value: 2 },
      uClip: { value: new THREE.Vector2(-1, 1) },
      uBound: { value: 1 },
      uCore: { value: 0 },
      uTip: { value: 1 },
      uCoreColor: { value: new THREE.Color('#ffffff') },
      uCoreSpan: { value: 0.5 },
      uSeed: { value: i * 7.31 },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }))
  const shafts = SLOTS.map((_, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaftMats[i])
    // Turned to face the camera every frame, so its own bounds tell the culler
    // nothing useful until after that.
    m.frustumCulled = false
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
  const dir = new THREE.Vector3()
  /** Scratch for the NDC projections that place the screen-edge bound. */
  const pv = new THREE.Vector3()
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()

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
      for (const m of shaftMats) {
        ;(m.uniforms.uColor.value as THREE.Color).set(cfg.HOLOGRAM.SHAFT_COLOR)
        m.uniforms.uSpread.value = cfg.HOLOGRAM.SHAFT_SPREAD
        m.uniforms.uRays.value = cfg.HOLOGRAM.SHAFT_RAYS
        m.uniforms.uSpeed.value = cfg.HOLOGRAM.SHAFT_SPEED
        m.uniforms.uFade.value = cfg.HOLOGRAM.SHAFT_FADE
        m.uniforms.uContrast.value = cfg.HOLOGRAM.SHAFT_CONTRAST
        m.uniforms.uBound.value = cfg.HOLOGRAM.SHAFT_BOUND
        m.uniforms.uCore.value = cfg.HOLOGRAM.SHAFT_CORE
        m.uniforms.uTip.value = cfg.HOLOGRAM.SHAFT_TIP
        ;(m.uniforms.uCoreColor.value as THREE.Color).set(cfg.HOLOGRAM.SHAFT_CORE_COLOR)
        m.uniforms.uCoreSpan.value = cfg.HOLOGRAM.SHAFT_CORE_SPAN
      }
      ;(glassMat.uniforms.uColor.value as THREE.Color).set(cfg.HOLOGRAM.GLASS_COLOR)
    },

    update(a, cam) {
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
      const setShaftOpacity = (v: number) => {
        for (const m of shaftMats) m.uniforms.uOpacity.value = v
      }

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
          shafts[i].position.set(s.origin[0], s.origin[1], s.origin[2])
          shafts[i].quaternion.copy(cam.quaternion)
          // ⚠️ Sized from the REAL camera, at THIS orb's own distance. See
          // shaftReach: anything derived from the composition instead leaves
          // the disc's edge inside the frame for whichever orb sits closest.
          const persp = cam as THREE.PerspectiveCamera
          const reach = shaftReach(
            cam.position.distanceTo(shafts[i].position),
            persp.isPerspectiveCamera ? persp.fov : 20,
            persp.isPerspectiveCamera ? persp.aspect : ctx.W / ctx.H,
            cfg.HOLOGRAM,
          )
          shafts[i].scale.setScalar(reach)

          /**
           * The fan's axis, flattened onto the screen.
           *
           * The plane wears the camera's rotation, so its local x and y ARE the
           * camera's right and up. Projecting the world lens-to-screen vector
           * onto those two gives the direction the fan must point in the
           * shader's space — which is why the shader needs no matrices at all.
           */
          dir
            .set(s.target[0] - s.origin[0], s.target[1] - s.origin[1], s.target[2] - s.origin[2])
            .normalize()
          camRight.setFromMatrixColumn(cam.matrixWorld, 0)
          camUp.setFromMatrixColumn(cam.matrixWorld, 1)
          const dx = dir.dot(camRight)
          const dy = dir.dot(camUp)
          const dl = Math.hypot(dx, dy)
          // Degenerate only when the fan points straight at the viewer, where
          // there is no on-screen direction to have. Up is the sane default —
          // it is where the screen sits relative to both orbs.
          const u = shaftMats[i].uniforms.uDir.value as THREE.Vector2
          if (dl > 1e-3) u.set(dx / dl, dy / dl)
          else u.set(0, 1)

          /**
           * The screen's edges, in this plane's own x.
           *
           * ⚠️ Measured in NDC and then converted, NOT in world units. The
           * panel sits at a different depth from either orb, so its world
           * width is not where it APPEARS relative to the orb's plane — and
           * where it appears is the whole point of a bound the eye reads as
           * the screen's edge. One extra projection per orb per frame buys
           * that exactly.
           */
          pv.set(s.origin[0], s.origin[1], s.origin[2]).project(cam)
          const lensNdc = pv.x
          pv
            .set(
              s.origin[0] + camRight.x * reach,
              s.origin[1] + camRight.y * reach,
              s.origin[2] + camRight.z * reach,
            )
            .project(cam)
          const halfNdc = Math.abs(pv.x - lensNdc)
          const clip = shaftMats[i].uniforms.uClip.value as THREE.Vector2
          if (halfNdc > 1e-6) {
            let lo = Infinity
            let hi = -Infinity
            for (const corner of quad.corners) {
              pv.set(corner[0], corner[1], corner[2]).project(cam)
              if (pv.x < lo) lo = pv.x
              if (pv.x > hi) hi = pv.x
            }
            clip.set((lo - lensNdc) / halfNdc, (hi - lensNdc) / halfNdc)
          } else {
            // Degenerate only if the plane has collapsed; leave it unbounded
            // rather than blanking the fan on a divide by nothing.
            clip.set(-1e3, 1e3)
          }
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
        setShaftOpacity(cfg.HOLOGRAM.SHAFT_OPACITY * (1 - dip * 0.5) * a.reveal)
      } else {
        setShaftOpacity(lit ? cfg.HOLOGRAM.SHAFT_OPACITY * a.reveal : 0)
      }

      // ⚠️ From the MONOTONIC clock, not parkedMs. parkedMs restarts at the
      // park, and a shimmer that jumps backwards there is a visible hitch on
      // the exact frame the orbs settle.
      for (const m of shaftMats) m.uniforms.uTime.value = a.smokeMs / 1000
    },

    screenCorners: () => corners,

    dispose() {
      markerGeo.dispose()
      portMarkerMat.dispose()
      lensMarkerMat.dispose()
      smokeGeo.forEach((g) => g.dispose())
      smokeMat.dispose()
      shafts.forEach((s) => s.geometry.dispose())
      shaftMats.forEach((m) => m.dispose())
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
