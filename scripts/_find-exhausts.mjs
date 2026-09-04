/**
 * Locate SAMSARA's exhaust tips by MEASURING the mesh, not by eye.
 *
 * The tubes are the body's furthest protrusions, so the tips are simply the
 * outlying vertices once the hull is normalised — no need to identify them
 * semantically. Clustering those outliers separates the two tubes from each
 * other and from any other bump.
 *
 * Reports in BODY RADII, the units EXHAUST.PORT_* uses: the engine normalises
 * the model to maxDim 1 and then treats scale.z / 2 as the radius, so a local
 * coordinate is worth twice its value in body radii.
 *
 *   node --import tsx scripts/_find-exhausts.mjs
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const SRC = process.argv[2] ?? 'public/models/mascot.room.draco.glb'
/** Outliers only. The hull sits near r = 0.5 once normalised. */
const OUTLIER_Q = 0.9995
/** Two points closer than this are the same protrusion. */
const CLUSTER_R = 0.09

const io = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
})
const doc = await io.read(SRC)

const pts = []
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const el = [0, 0, 0]
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el)
      pts.push([el[0], el[1], el[2]])
    }
  }
}

// Centre and normalise exactly as MascotEngine.loadDetail does.
const min = [Infinity, Infinity, Infinity]
const max = [-Infinity, -Infinity, -Infinity]
for (const p of pts) {
  for (let k = 0; k < 3; k++) {
    if (p[k] < min[k]) min[k] = p[k]
    if (p[k] > max[k]) max[k] = p[k]
  }
}
const centre = min.map((v, k) => (v + max[k]) / 2)
const maxDim = Math.max(...max.map((v, k) => v - min[k])) || 1
const norm = pts.map((p) => p.map((v, k) => (v - centre[k]) / maxDim))

const withR = norm.map((p) => ({ p, r: Math.hypot(p[0], p[1], p[2]) }))
withR.sort((a, b) => b.r - a.r)
const cut = withR[Math.floor(withR.length * (1 - OUTLIER_Q))]?.r ?? 0
const outliers = withR.filter((v) => v.r >= cut)

console.log(`${pts.length.toLocaleString()} verts · normalised radius max ${withR[0].r.toFixed(3)}`)
console.log(`outlier cut ${cut.toFixed(3)} -> ${outliers.length} points\n`)

// Greedy clustering: the tubes are far apart relative to their own size.
const clusters = []
for (const o of outliers) {
  const hit = clusters.find(
    (c) => Math.hypot(c.peak[0] - o.p[0], c.peak[1] - o.p[1], c.peak[2] - o.p[2]) < CLUSTER_R,
  )
  if (hit) {
    hit.n++
    if (o.r > hit.r) {
      hit.r = o.r
      hit.peak = o.p
    }
  } else {
    clusters.push({ peak: o.p, r: o.r, n: 1 })
  }
}
clusters.sort((a, b) => b.n - a.n)

console.log('protrusions, in BODY RADII (x2 the normalised local), face is +Z:')
console.log('  #   verts      x       y       z     |r|   note')
clusters.slice(0, 10).forEach((c, i) => {
  const b = c.peak.map((v) => v * 2)
  const note =
    b[1] > 0.5 && b[2] < 0 ? 'upper rear — exhaust candidate' : b[1] > 0.8 ? 'top' : ''
  console.log(
    `  ${String(i).padStart(2)}  ${String(c.n).padStart(6)}  ` +
      b.map((v) => v.toFixed(3).padStart(6)).join('  ') +
      `  ${(c.r * 2).toFixed(3)}  ${note}`,
  )
})

// A symmetric pair is the signature we are after: same y and z, opposite x.
console.log('\nsymmetric pairs (|Δx| large, Δy and Δz small):')
for (let i = 0; i < clusters.length; i++) {
  for (let j = i + 1; j < clusters.length; j++) {
    const a = clusters[i].peak.map((v) => v * 2)
    const b = clusters[j].peak.map((v) => v * 2)
    if (
      Math.abs(a[0] + b[0]) < 0.12 &&
      Math.abs(a[1] - b[1]) < 0.12 &&
      Math.abs(a[2] - b[2]) < 0.12 &&
      Math.abs(a[0]) > 0.15
    ) {
      console.log(
        `  #${i} & #${j}  ->  PORT_X ${Math.abs((a[0] - b[0]) / 2).toFixed(3)}` +
          `  PORT_Y ${((a[1] + b[1]) / 2).toFixed(3)}` +
          `  PORT_Z ${((a[2] + b[2]) / 2).toFixed(3)}`,
      )
    }
  }
}
