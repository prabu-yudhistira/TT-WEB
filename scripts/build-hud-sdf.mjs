/**
 * Turn the owner's HUD artwork into a signed distance field.
 *
 *   node --import tsx scripts/build-hud-sdf.mjs
 *
 * ⚠️ WHY NOT JUST USE THE PNG. Two reasons, and the second is the one that
 * matters.
 *
 *  - The art is 1000px wide and the panel renders about 1580 device pixels on
 *    a 2x screen, so a straight texture is magnified 1.6x and goes soft
 *    exactly where the line work is the point. An SDF magnifies cleanly: the
 *    edge is reconstructed from the distance, not resampled from pixels.
 *  - The glow has to BREATHE. The screen flickers on a 5s cycle and the halo
 *    has to move with it. Baked into a bitmap it cannot; from a distance field
 *    it is one exp() per fragment.
 *
 * ⚠️ THE OUTPUT IS COMMITTED. It is derived, but it is derived from an artwork
 * the owner drew by hand, and regenerating it is this script plus their source
 * file — not something a clean checkout can do on its own.
 *
 * Encoding: v = 0.5 - signed / SPREAD, clamped. So v > 0.5 is inside the ink,
 * v = 0.5 is the edge, and the shader recovers signed pixels as
 * (0.5 - v) * SPREAD.
 */
import sharp from 'sharp'
import path from 'node:path'

const SRC = 'public/hud/panel.png'
const OUT = 'public/hud/panel.sdf.png'

/**
 * How far the field reaches, in source pixels.
 *
 * ⚠️ A TRADE, not a free parameter, and it is the FULL range — the field
 * saturates at SPREAD/2 either side of an edge.
 *
 * The whole range is packed into 8 bits, so a wider spread buys a longer halo
 * and spends precision on the line. At 32 the field reaches 16px outside the
 * ink, and a 4px stroke still has 16 levels between its centre and its edge —
 * about 8 across the antialiased band, which is enough. Much past this and the
 * strokes band; much below it and the halo has nowhere to fall off, which is
 * how a flat wash ends up over the whole panel.
 */
const SPREAD = 32

/** Above this the pixel is ink. The art keys cleanly — background tops out at
 *  0.063 and the ink core sits above 0.95 — so this only has to miss the noise. */
const THRESHOLD = 0.5

const INF = 1e20

/** Felzenszwalb & Huttenlocher's exact 1D squared-distance transform. */
function edt1d(f, d, v, z, n) {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/** Squared distance from every pixel to the nearest set pixel in `seed`. */
function edt2d(seed, W, H) {
  const g = new Float64Array(W * H)
  for (let i = 0; i < W * H; i++) g[i] = seed[i] ? 0 : INF
  const n = Math.max(W, H)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x]
    edt1d(f, d, v, z, H)
    for (let y = 0; y < H; y++) g[y * W + x] = d[y]
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x]
    edt1d(f, d, v, z, W)
    for (let x = 0; x < W; x++) g[y * W + x] = d[x]
  }
  return g
}

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H, channels: C } = info

// Keyed on the MAX channel, not on luminance. The art is a saturated orange on
// black; luminance weights blue at 0.11 and would thin every stroke before the
// threshold ever saw it.
const ink = new Uint8Array(W * H)
let inkCount = 0
for (let i = 0; i < W * H; i++) {
  const o = i * C
  const key = Math.max(data[o], data[o + 1], data[o + 2]) / 255
  if (key >= THRESHOLD) {
    ink[i] = 1
    inkCount++
  }
}
const air = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) air[i] = ink[i] ? 0 : 1

const outSq = edt2d(ink, W, H)
const inSq = edt2d(air, W, H)

const out = Buffer.alloc(W * H)
for (let i = 0; i < W * H; i++) {
  const signed = Math.sqrt(outSq[i]) - Math.sqrt(inSq[i])
  out[i] = Math.max(0, Math.min(255, Math.round((0.5 - signed / SPREAD) * 255)))
}

await sharp(out, { raw: { width: W, height: H, channels: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT)

console.log(`${SRC}  ${W}x${H}  aspect ${(W / H).toFixed(4)}`)
console.log(`ink pixels: ${inkCount} (${((inkCount / (W * H)) * 100).toFixed(2)}%)`)
console.log(`wrote ${path.resolve(OUT)}  spread ${SPREAD}px`)
