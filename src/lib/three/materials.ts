import * as THREE from 'three'

// Material factories ported verbatim from the owner-approved preview
// (_ASSETS/logo-3d/preview.html). Two named slots: 'logo-black', 'logo-red'.
export type LogoMaterials = Record<'logo-black' | 'logo-red', THREE.Material>

/** Pencil cross-hatch matcap (no UVs needed) — screen-space hatching. */
function makePencilMatcap(): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 512
  const g = cv.getContext('2d')!
  g.fillStyle = '#EFEBE0'
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = 'rgba(48,46,42,0.34)'
  g.lineWidth = 1.6
  for (let i = -512; i < 1024; i += 5) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + 512, 512)
    g.stroke()
  }
  g.strokeStyle = 'rgba(48,46,42,0.22)'
  for (let i = -512; i < 1024; i += 8) {
    g.beginPath()
    g.moveTo(i + 512, 0)
    g.lineTo(i, 512)
    g.stroke()
  }
  let gr = g.createRadialGradient(170, 170, 20, 170, 170, 330) // light lifts top-left
  gr.addColorStop(0, 'rgba(250,247,238,0.95)')
  gr.addColorStop(0.45, 'rgba(250,247,238,0.55)')
  gr.addColorStop(1, 'rgba(250,247,238,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 512)
  gr = g.createRadialGradient(256, 256, 150, 256, 256, 256) // rim shadow
  gr.addColorStop(0, 'rgba(38,37,33,0)')
  gr.addColorStop(1, 'rgba(38,37,33,0.30)')
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 512)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Tuned against the original clip's own third act rather than picked by eye:
// mean colour of the mark at 7.5s is red #83484B / graphite #5E534E (paper
// excluded). The previous values rendered noticeably darker and far more
// saturated than that, which made the handoff out of the drawn phase read as a
// colour jump. Re-measure with the compare harness before changing these.
export function makePencilMaterials(): LogoMaterials {
  const matcap = makePencilMatcap()
  return {
    'logo-black': new THREE.MeshMatcapMaterial({ matcap, color: 0x635a58 }),
    'logo-red': new THREE.MeshMatcapMaterial({ matcap, color: 0x8f4f57 }),
  }
}
