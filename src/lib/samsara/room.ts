/**
 * The dark room SAMSARA falls into.
 *
 * Spec §6.1–6.2. Graphite on black — the Atelier drawing language inverted,
 * rather than a photoreal interior, so the dark room belongs to a brand that
 * deliberately dropped its dark appearance rather than reading as a different
 * website. Geometry stays minimal: floor, back wall, two side walls, no ceiling.
 *
 * ⚠️ NO scene.fog. Fog is a property of the SCENE, and this room shares its
 * scene with the orbit — setting it would tint the mascot while it is still
 * circling the mark in the hero. Depth falloff comes from a distance-decaying
 * key light instead, which is contained to the objects it reaches.
 *
 * ⚠️ ONE shadow-casting light, with a deliberately small shadow map. That
 * shadow is what sells three bounces as contact rather than float, and getting
 * it free is the main dividend of SAMSARA and the room sharing one scene — but
 * this project has lost 5.9 fps once already to a lighting-adjacent bug (the
 * ember gl_PointSize idiom that produced ~437px points, ~13,000 of them,
 * additively blended). So: one caster, small map, and frame rate measured via
 * real rAF deltas rather than eyeballed.
 */
import * as THREE from 'three'
import { solveHandoff } from './cameraHandoff'
import type { RoomConfig } from './types'

export type Room = {
  group: THREE.Group
  /** The single shadow-casting key. Exposed so the bench can tune it live. */
  key: THREE.SpotLight
  setConfig(cfg: RoomConfig): void
  /**
   * 0 = invisible, 1 = fully present. Spec §5.7: the room fades up AFTER the
   * layer promotion and, once opaque, is what hides the hero so the pin can be
   * released without the visitor seeing the scroll jump.
   *
   * Both halves are needed. Fading only the lights leaves the walls lit by
   * scene.environment and the room never truly arrives; fading only the
   * materials leaves a fully-lit room appearing through its own alpha, which
   * reads as a dissolve rather than a room coming up.
   */
  setReveal(v: number): void
  dispose(): void
}

/**
 * Room interior height as a multiple of DEPTH.
 *
 * Exported because the sequence solves its camera distance from it — the
 * perspective camera is framed so this height fills the viewport. A second
 * copy of the number in the React layer would silently reframe the room the
 * first time this one was tuned.
 */
export const ROOM_HEIGHT_FACTOR = 1.1

/**
 * The perspective camera that frames this room.
 *
 * Solved from the room's own interior height against the full viewport height,
 * so the room fills the frame. Lives here, beside the geometry it is solved
 * from, because two callers need it — the sequence at the promotion and the
 * engine's dev handle — and a second copy would let the bench show a framing
 * the real transition does not use.
 *
 * `solveHandoff` answers "at what distance does this world size render as this
 * many pixels", which is exactly the question. It is NOT needed to make the
 * seam continuous: place() re-solves position and size at the body's live depth
 * every frame, so any distance reproduces the pixel pose. That is what frees
 * this one to serve composition.
 */
export function roomCameraFor(cfg: RoomConfig, viewportH: number, mobile = false) {
  const fovDeg = mobile ? cfg.MOBILE_CAMERA_FOV_DEG : cfg.CAMERA_FOV_DEG
  const { distance } = solveHandoff(viewportH, cfg.DEPTH * ROOM_HEIGHT_FACTOR, viewportH, fovDeg)
  return { fovDeg, distance }
}

/**
 * Shadow map edge, px.
 *
 * ⚠️ MEASURED: 512 and 1024 cost the SAME here (53.0 vs 52.7 fps under software
 * rasterisation), so the room's cost is not the shadow map and shrinking it
 * buys nothing. Do not trade quality away for a saving that does not exist.
 * The cost is fill rate — four large PBR planes covering the whole viewport,
 * lit by an environment map — which is simply what a room costs.
 */
const SHADOW_MAP = 1024

export function buildRoom(cfg: RoomConfig): Room {
  const group = new THREE.Group()
  group.visible = false

  const D = cfg.DEPTH
  const W = D * 1.6
  const H = D * ROOM_HEIGHT_FACTOR

  /**
   * ⚠️ EXTENT scales the SURFACES, never the framing.
   *
   * `H` above stays the camera's reference — `roomCameraFor` solves distance
   * from it — so the composition is untouched at any extent. What grows is how
   * far the floor and walls run before they end.
   *
   * ⚠️ And they grow UPWARD from the floor, not about their own centre. The
   * ground plane's height is where SAMSARA's bounce makes contact and where its
   * shadow lands; scaling the walls symmetrically would drag the floor down
   * with them and the landing would read as hovering.
   */
  const E = Math.max(1, cfg.EXTENT)
  const WE = W * E
  const HE = H * E
  const DE = D * 2 * E
  /** Unscaled, deliberately — see above. */
  const floorY = -H / 2
  /** Walls rise from the floor rather than straddling the origin. */
  const wallY = floorY + HE / 2

  const floorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cfg.FLOOR_COLOR),
    roughness: 0.92,
    metalness: 0,
  })
  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cfg.WALL_COLOR),
    roughness: 1,
    metalness: 0,
    side: THREE.FrontSide,
  })

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WE, DE), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, floorY, -D / 2)
  floor.receiveShadow = true

  // The back wall stays at -D. Its DEPTH is the fall's own reference (see the
  // clearance solve in SamsaraSequence), so only its extent grows.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(WE, HE), wallMat)
  back.position.set(0, wallY, -D)
  back.receiveShadow = true

  const left = new THREE.Mesh(new THREE.PlaneGeometry(DE, HE), wallMat)
  left.rotation.y = Math.PI / 2
  left.position.set(-WE / 2, wallY, -D / 2)

  const right = new THREE.Mesh(new THREE.PlaneGeometry(DE, HE), wallMat)
  right.rotation.y = -Math.PI / 2
  right.position.set(WE / 2, wallY, -D / 2)

  // Distance-decaying key, so the walls fall off into darkness at their edges
  // without any fog and without hard-edged geometry.
  const key = new THREE.SpotLight(
    new THREE.Color(cfg.KEY_LIGHT_COLOR),
    cfg.KEY_LIGHT_INTENSITY,
    D * 4,
    Math.PI / 5,
    0.6,
    1.4,
  )
  key.position.set(D * 0.35, H * 0.55, D * 0.5)
  key.target.position.set(0, 0, 0)
  key.castShadow = true
  key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = D * 4
  key.shadow.bias = -0.0015

  const ambient = new THREE.AmbientLight(0xffffff, cfg.AMBIENT_INTENSITY)

  // BG_COLOR as real geometry rather than scene.background, for the same reason
  // this room carries no fog: the scene is SHARED with the orbit, so anything
  // set on it would paint behind the mascot while it is still circling the mark
  // in the hero. A single unlit quad, far enough back and large enough to
  // outrun the frustum at any sane camera distance, closes the gap the four
  // walls leave at the corners — which is what lets the fade-up actually hide
  // the hero (spec §5.7) instead of merely dimming it.
  const bgMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.BG_COLOR) })
  // Scaled and pushed back with the surfaces: at a large extent the side walls
  // run to -D/2 - D*E, and a backdrop left at -1.8D would sit IN FRONT of their
  // far ends, leaving the hero visible through the gap the fade-up is supposed
  // to close.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(D * 20 * E, D * 20 * E), bgMat)
  backdrop.position.set(0, 0, -D * 1.8 * E)

  group.add(backdrop, floor, back, left, right, key, key.target, ambient)

  // Captured at build time so setReveal() scales against the configured values
  // rather than against whatever it last wrote — otherwise a reveal ramp
  // multiplies its own output and the room dims to nothing over a few frames.
  let keyBase = cfg.KEY_LIGHT_INTENSITY
  let ambientBase = cfg.AMBIENT_INTENSITY
  let reveal = 1

  const applyReveal = () => {
    const v = reveal < 0 ? 0 : reveal > 1 ? 1 : reveal
    key.intensity = keyBase * v
    ambient.intensity = ambientBase * v
    const wantTransparent = v < 1
    for (const m of [floorMat, wallMat, bgMat]) {
      m.opacity = v
      // ⚠️ `needsUpdate` ONLY when the flag actually flips. This runs every
      // frame of the fall, and needsUpdate forces three.js to recompile the
      // material's program — setting it unconditionally rebuilds four shaders
      // sixty times a second for the length of the fall, which is the most
      // expensive possible way to change one float. Opacity is a uniform and
      // needs no recompile at all; `transparent` changes the render path and
      // does, exactly twice per run.
      if (m.transparent !== wantTransparent) {
        m.transparent = wantTransparent
        m.depthWrite = !wantTransparent
        m.needsUpdate = true
      }
    }
  }

  return {
    group,
    key,
    setConfig(next: RoomConfig) {
      floorMat.color.set(next.FLOOR_COLOR)
      wallMat.color.set(next.WALL_COLOR)
      bgMat.color.set(next.BG_COLOR)
      key.color.set(next.KEY_LIGHT_COLOR)
      keyBase = next.KEY_LIGHT_INTENSITY
      ambientBase = next.AMBIENT_INTENSITY
      applyReveal()
    },
    setReveal(v: number) {
      reveal = v
      applyReveal()
    },
    dispose() {
      backdrop.geometry.dispose()
      floor.geometry.dispose()
      back.geometry.dispose()
      left.geometry.dispose()
      right.geometry.dispose()
      bgMat.dispose()
      floorMat.dispose()
      wallMat.dispose()
      key.dispose()
      group.clear()
    },
  }
}
