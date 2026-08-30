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
import type { RoomConfig } from './types'

export type Room = {
  group: THREE.Group
  /** The single shadow-casting key. Exposed so the bench can tune it live. */
  key: THREE.SpotLight
  setConfig(cfg: RoomConfig): void
  dispose(): void
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
  const H = D * 1.1

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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D * 2), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -H / 2, -D / 2)
  floor.receiveShadow = true

  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat)
  back.position.set(0, 0, -D)
  back.receiveShadow = true

  const left = new THREE.Mesh(new THREE.PlaneGeometry(D * 2, H), wallMat)
  left.rotation.y = Math.PI / 2
  left.position.set(-W / 2, 0, -D / 2)

  const right = new THREE.Mesh(new THREE.PlaneGeometry(D * 2, H), wallMat)
  right.rotation.y = -Math.PI / 2
  right.position.set(W / 2, 0, -D / 2)

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

  group.add(floor, back, left, right, key, key.target, ambient)

  return {
    group,
    key,
    setConfig(next: RoomConfig) {
      floorMat.color.set(next.FLOOR_COLOR)
      wallMat.color.set(next.WALL_COLOR)
      key.color.set(next.KEY_LIGHT_COLOR)
      key.intensity = next.KEY_LIGHT_INTENSITY
      ambient.intensity = next.AMBIENT_INTENSITY
    },
    dispose() {
      floor.geometry.dispose()
      back.geometry.dispose()
      left.geometry.dispose()
      right.geometry.dispose()
      floorMat.dispose()
      wallMat.dispose()
      key.dispose()
      group.clear()
    },
  }
}
