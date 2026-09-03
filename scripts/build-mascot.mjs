/**
 * Mascot asset pipeline: source GLB -> shipped Draco GLB.
 *
 *   node scripts/build-mascot.mjs <src.glb> <out.glb> [triTarget] [texSize]
 *   npm run build:mascot          (wires up the paths below)
 *
 * The 57.6 MB source GLB lives at ../_ASSETS/mascot/Mascot.glb — a large
 * working-tree asset, NOT committed to this app repo (same as logo.glb, which
 * sits in _ASSETS/logo-3d/). Only the 543 KB shipped output,
 * public/models/mascot.draco.glb, is committed.
 *
 * Dev-only dependencies (already in devDependencies; never shipped to the client):
 *   @gltf-transform/core  @gltf-transform/extensions  @gltf-transform/functions
 *   meshoptimizer  draco3dgltf   (sharp is a runtime dependency, reused here as the
 *   texture encoder)
 *
 * ── Why 20k / 1024² (measured 2026-08-28, see the decimation ladder in
 * docs/superpowers/specs/2026-08-28-hero-mascot-design.md §8.2) ──
 * A 20k-triangle build is visually indistinguishable from the 1.96M-triangle
 * source at every size the hero uses — verified by rendering both through the
 * same rasteriser and comparing, not by eye on a single screenshot. The next
 * rung down (~10k) is still fine at orbit size but visibly facets the ornamental
 * bezel ring when scaled up, which the later fly-out would expose. 1024² textures
 * leave headroom for that same fly-out.
 *
 * ── Why the ORB is 40k / 1024² (measured 2026-09-03, `npm run build:orb`) ──
 * `emitter_orb.glb` is 1,949,942 triangles — roughly 10x the room LOD — and
 * ships at 40k.
 *
 * ⚠️ The ladder was rendered on the RTX 3050 at the size the orb ACTUALLY
 * appears (158px on 1440x900, derived from the owner's composition mockup), and
 * at that size **every rung from 1.95M down to 20k/512² is indistinguishable**.
 * Geometry is not the lever here and a triangle target chosen by intuition would
 * have been wrong in either direction: 20k/512² is 272 KB and looks identical on
 * the page.
 *
 * 40k / 1024² (590 KB) is chosen for HEADROOM, not for the default view. The
 * difference only appears when the orb is enlarged: 512² visibly softens the
 * engraved filigree, which is the whole character of this model, and below ~40k
 * the scalloped bezel ring around the hologram lens goes polygonal — and that
 * ring is the feature the hologram sub-project is built around. Two orbs share
 * ONE download, so this is 590 KB total, not per orb.
 *
 * ⚠️ Same KHR_texture_transform warning as below, and it was verified rather
 * than assumed: the ladder was rendered side by side against the source and the
 * skin is intact at every rung.
 *
 * ── Why Draco rather than meshopt ──
 * The app already loads /models/logo.draco.glb through DRACOLoader with the
 * decoder served from /draco/, so this adds no new decoder and the wasm is
 * already warm by the time the mascot is requested.
 *
 * ⚠️ The source UVs carry KHR_texture_transform with scale ~16 (the texture tiles
 * 16x). @gltf-transform preserves it, but any change to the steps below must be
 * re-verified by rendering the output and comparing against the source — a
 * silently dropped transform smears the whole skin.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { simplify, weld, prune, dedup, draco, textureCompress } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import draco3d from 'draco3dgltf'
import sharp from 'sharp'
import { statSync } from 'node:fs'

const [src, out, triTarget = '20000', texSize = '1024'] = process.argv.slice(2)
if (!src || !out) {
  console.error('usage: node scripts/build-mascot.mjs <src.glb> <out.glb> [triTarget] [texSize]')
  process.exit(1)
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
})
await MeshoptSimplifier.ready

const triCount = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0)

const doc = await io.read(src)
const before = triCount(doc)

await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(triTarget) / before, error: 0.02 }),
  dedup(),
  prune(),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [Number(texSize), Number(texSize)],
    quality: 82,
  }),
  draco({ method: 'edgebreaker' }),
)

await io.write(out, doc)

const kb = (n) => (n / 1024).toFixed(0) + ' KB'
const mb = (n) => (n / 1048576).toFixed(2) + ' MB'
const srcSize = statSync(src).size
const outSize = statSync(out).size
console.log(`source : ${Math.round(before).toLocaleString()} tris   ${mb(srcSize)}`)
console.log(
  `output : ${Math.round(triCount(doc)).toLocaleString()} tris   ${kb(outSize)}   (${(srcSize / outSize).toFixed(0)}x smaller)`,
)
console.log(
  `extensions: ${doc
    .getRoot()
    .listExtensionsUsed()
    .map((e) => e.extensionName)
    .join(', ')}`,
)
