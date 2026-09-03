/**
 * Inspect emitter_orb.glb before anything is built on it.
 *
 * The question that decides the approach: are the "hologram emitter" (the domed
 * lens on top) and the "steam emitters" (the ports at the base) separate NAMED
 * nodes? If they are, effects attach to real transforms. If the orb is one
 * welded mesh, every emitter position has to be hand-placed in local space and
 * re-derived whenever the model changes.
 *
 *   node scripts/_inspect-orb.mjs [path]
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const PATH = process.argv[2] ?? '../_ASSETS/mascot/emitter_orb.glb'

const io = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
})

const doc = await io.read(PATH)
const root = doc.getRoot()

console.log('=== ' + PATH + ' ===')
console.log('generator :', root.getAsset().generator ?? '(none)')
console.log('scenes    :', root.listScenes().length)
console.log('nodes     :', root.listNodes().length)
console.log('meshes    :', root.listMeshes().length)
console.log('materials :', root.listMaterials().length)
console.log('textures  :', root.listTextures().length)
console.log('animations:', root.listAnimations().length)

let tris = 0
let verts = 0
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices()
    const pos = prim.getAttribute('POSITION')
    verts += pos ? pos.getCount() : 0
    tris += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0)
  }
}
console.log('triangles :', Math.round(tris).toLocaleString())
console.log('vertices  :', Math.round(verts).toLocaleString())

// ── the node tree, which is the actual question ─────────────────────
console.log('\n--- node tree ---')
const walk = (node, depth) => {
  const pad = '  '.repeat(depth)
  const mesh = node.getMesh()
  const t = node.getTranslation()
  const s = node.getScale()
  const bits = []
  if (mesh) {
    let mt = 0
    for (const prim of mesh.listPrimitives()) {
      const i = prim.getIndices()
      const p = prim.getAttribute('POSITION')
      mt += i ? i.getCount() / 3 : (p ? p.getCount() / 3 : 0)
    }
    bits.push(`mesh(${Math.round(mt).toLocaleString()} tris, ${mesh.listPrimitives().length} prim)`)
  }
  bits.push(`t[${t.map((v) => v.toFixed(2)).join(',')}]`)
  if (s.some((v) => Math.abs(v - 1) > 1e-4)) bits.push(`s[${s.map((v) => v.toFixed(2)).join(',')}]`)
  console.log(`${pad}• ${node.getName() || '(unnamed)'}  ${bits.join('  ')}`)
  for (const c of node.listChildren()) walk(c, depth + 1)
}
for (const scene of root.listScenes()) for (const n of scene.listChildren()) walk(n, 0)

// ── materials and textures: the cost, and whether emissive already exists ──
console.log('\n--- materials ---')
for (const m of root.listMaterials()) {
  const em = m.getEmissiveFactor()
  const lit = em.some((v) => v > 0.001)
  console.log(
    `  "${m.getName() || '(unnamed)'}"  ` +
      `emissive=[${em.map((v) => v.toFixed(2)).join(',')}]${lit ? ' ← LIT' : ''}  ` +
      `metal=${m.getMetallicFactor().toFixed(2)} rough=${m.getRoughnessFactor().toFixed(2)}  ` +
      `alpha=${m.getAlphaMode()}`,
  )
}

console.log('\n--- textures ---')
let texBytes = 0
for (const t of root.listTextures()) {
  const img = t.getImage()
  texBytes += img?.byteLength ?? 0
  console.log(
    `  "${t.getName() || '(unnamed)'}"  ${(t.getSize() || []).join('x') || '?'}  ` +
      `${((img?.byteLength ?? 0) / 1024 / 1024).toFixed(2)}MB  ${t.getMimeType()}`,
  )
}
console.log(`  TOTAL texture bytes: ${(texBytes / 1024 / 1024).toFixed(1)}MB`)

// ── bounds, so the room can scale it without guessing ───────────────
const min = [Infinity, Infinity, Infinity]
const max = [-Infinity, -Infinity, -Infinity]
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const el = [0, 0, 0]
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el)
      for (let k = 0; k < 3; k++) {
        if (el[k] < min[k]) min[k] = el[k]
        if (el[k] > max[k]) max[k] = el[k]
      }
    }
  }
}
console.log('\n--- bounds (local, pre-node-transform) ---')
console.log('  min :', min.map((v) => v.toFixed(3)).join(', '))
console.log('  max :', max.map((v) => v.toFixed(3)).join(', '))
console.log('  size:', max.map((v, i) => (v - min[i]).toFixed(3)).join(', '))
