/**
 * Does each expression stay distinguishable at the size it actually SHIPS?
 *
 * The mascot is 12.6px on the far side of the orbit and 70px at closest
 * approach; the tuning bench shows the face at 340px+. This takes the crops
 * eyes-render.mjs already wrote and downsamples them to the real sizes.
 *
 * ⚠️ Downsampling a large render is NOT the same as rendering small — there is
 * no per-size antialiasing or mip selection — so treat these as an OPTIMISTIC
 * upper bound. It rules out expressions being identical at size; it does not
 * establish that a viewer reads fourteen distinct feelings at 12.6px, where the
 * display is about 6px across.
 *
 * Run: node docs/superpowers/verification/eyes-legibility.mjs
 * Requires: eyes-render.mjs to have run first.
 */
import { createRequire } from 'node:module'
const sharp = createRequire('file:///D:/TAMPA%20TARUNO/WEBSITE/_WEB_PRODUCT/package.json')('sharp')
import { readdirSync } from 'node:fs'

const DIR = (process.env.TT_SHOTS ?? 'eyeshots') + '/'
const SIZES = [
  { px: 12.6, note: 'far side of the orbit' },
  { px: 28, note: 'the configured SIZE' },
  { px: 70, note: 'closest approach' },
]
// Below this mean per-channel difference two crops are, in practice, the same
// picture. Deliberately low so the verdict errs toward optimism.
const SAME = 3

const names = readdirSync(DIR)
  .filter((f) => f.endsWith('.png') && f !== 'sheet.png')
  .map((f) => f.replace('.png', ''))
if (names.length !== 14) {
  console.error(`FAIL  expected 14 crops in ${DIR}, found ${names.length} — run eyes-render.mjs first`)
  process.exit(1)
}

const dist = (a, b) => {
  let d = 0
  for (let i = 0; i < a.data.length; i += a.info.channels) {
    d += Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2])
  }
  return d / (a.data.length / a.info.channels) / 3
}

let failures = 0
for (const { px, note } of SIZES) {
  const n = Math.max(4, Math.round(px))
  const imgs = {}
  for (const name of names) {
    imgs[name] = await sharp(`${DIR}${name}.png`)
      .resize(n, n, { kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true })
  }
  const collisions = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (dist(imgs[names[i]], imgs[names[j]]) < SAME) collisions.push(`${names[i]}=${names[j]}`)
    }
  }
  const pairs = (names.length * (names.length - 1)) / 2
  const ok = collisions.length === 0
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${String(px).padStart(5)}px (${note}): ` +
      `${collisions.length}/${pairs} colliding  ${collisions.slice(0, 6).join(', ')}`,
  )
}

console.log(failures ? `\n${failures} size(s) failed.` : '\nEye legibility checks passed.')
process.exit(failures ? 1 : 0)
