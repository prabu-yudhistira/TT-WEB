import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
const io = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
})
for (const [label, path] of [['SHIPPED (20k/1024)','public/models/mascot.draco.glb'],['ROOM LOD (200k/2048)','C:/Users/YUDHIS~1/AppData/Local/Temp/mascot.room.draco.glb']]) {
  const doc = await io.read(path)
  const root = doc.getRoot()
  console.log(`\n=== ${label} ===`)
  console.log('materials:', root.listMaterials().length, ' meshes:', root.listMeshes().length)
  for (const t of root.listTextures()) {
    const img = t.getImage()
    const size = t.getSize()
    console.log(`  texture "${t.getName() || '(unnamed)'}"  ${size ? size.join('x') : '?'}  ${(img?.byteLength/1024).toFixed(0)}KB  ${t.getMimeType()}`)
  }
  for (const m of root.listMaterials()) {
    const bc = m.getBaseColorTexture()
    console.log(`  material "${m.getName()||'(unnamed)'}" baseColor=${bc ? (bc.getSize()||[]).join('x') : 'none'}`)
  }
}
