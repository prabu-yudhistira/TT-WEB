/**
 * Pins `hologramGeometry` — the screen's placement, the shafts, and the rect
 * that will become the DOM contract.
 */
import { DEFAULT_SEQUENCE } from './types'
import { screenQuad, projectQuad, shaftFor, shaftReach, flickerAt, type Vec3 } from './hologramGeometry'
import type { OrbCtx } from './emitterOrbs'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  }
}

const cfg = DEFAULT_SEQUENCE.HOLOGRAM
const land: OrbCtx = { W: 1440, H: 900, mobile: false, roomDepth: 42, camZ: 30 }
const port: OrbCtx = { W: 390, H: 844, mobile: true, roomDepth: 42, camZ: 30 }

// ── the quad ────────────────────────────────────────────────────────
{
  const q = screenQuad(cfg, land)
  check('four corners', q.corners.length === 4)
  check('positive extent', q.w > 0 && q.h > 0, `${q.w.toFixed(2)} x ${q.h.toFixed(2)}`)
  check('corners are coplanar in z',
    new Set(q.corners.map((c) => c[2].toFixed(6))).size === 1)
  check('centre matches the corners',
    Math.abs(q.corners.reduce((s, c) => s + c[0], 0) / 4 - q.centre[0]) < 1e-6 &&
    Math.abs(q.corners.reduce((s, c) => s + c[1], 0) / 4 - q.centre[1]) < 1e-6)
  // Landscape: the screen sits LEFT of SAMSARA, which parks at X_FRAC 0.75.
  check('landscape places it left of centre', q.centre[0] < 0, q.centre[0].toFixed(2))
  check('the screen stands in front of the back wall',
    q.centre[2] > land.camZ - land.roomDepth, `${q.centre[2].toFixed(2)}`)
  check('and behind the camera plane', q.centre[2] < land.camZ)
}

// ── portrait moves it below SAMSARA rather than beside it ───────────
{
  const q = screenQuad(cfg, port)
  check('portrait places it below centre', q.centre[1] < 0, q.centre[1].toFixed(2))
  check('portrait is horizontally centred', Math.abs(q.centre[0]) < 1e-6)
  check('portrait keeps a positive extent', q.w > 0 && q.h > 0)
}

// ── the projected rect: the DOM contract ────────────────────────────
{
  const q = screenQuad(cfg, land)
  // A deliberately skewed projection, so a rect computed from the CENTRE plus
  // the world size would disagree with the true corner bounds. That is the
  // failure mode this contract has to be immune to.
  const project = (p: Vec3): [number, number] => [
    720 + p[0] * 10 + p[2] * 1.5,
    450 - p[1] * 10 + p[2] * 0.8,
  ]
  const r = projectQuad(q, project)
  const xs = q.corners.map((c) => project(c)[0])
  const ys = q.corners.map((c) => project(c)[1])
  check('rect x is the min of the projected corners', Math.abs(r.x - Math.min(...xs)) < 1e-6)
  check('rect y is the min of the projected corners', Math.abs(r.y - Math.min(...ys)) < 1e-6)
  check('rect w spans the projected corners',
    Math.abs(r.w - (Math.max(...xs) - Math.min(...xs))) < 1e-6)
  check('rect h spans the projected corners',
    Math.abs(r.h - (Math.max(...ys) - Math.min(...ys))) < 1e-6)
  check('the rect has positive extent', r.w > 0 && r.h > 0)
}

// ── shafts ──────────────────────────────────────────────────────────
{
  const q = screenQuad(cfg, land)
  const lens: Vec3 = [-14, -8, 22]
  const s = shaftFor(lens, q, cfg)
  check('the shaft starts at the lens',
    s.origin[0] === lens[0] && s.origin[1] === lens[1] && s.origin[2] === lens[2])
  check('the shaft targets the screen centre',
    s.target[0] === q.centre[0] && s.target[1] === q.centre[1] && s.target[2] === q.centre[2])
  check('length matches lens-to-centre distance',
    Math.abs(s.length - Math.hypot(
      q.centre[0] - lens[0], q.centre[1] - lens[1], q.centre[2] - lens[2])) < 1e-6,
    s.length.toFixed(3))
  check('spread is carried from config', s.spread === cfg.SHAFT_SPREAD)
  // Two orbs at different places must produce two different shafts, or they
  // read as one beam and the "projected by two emitters" idea is lost.
  const other = shaftFor([6, -6, 10], q, cfg)
  check('a different lens gives a different shaft', Math.abs(other.length - s.length) > 1e-3)
}

// ── the fan's reach ─────────────────────────────────────────────────
{
  const cfg1 = { ...cfg, SHAFT_REACH: 1 }
  const fov = 20
  const aspect = 16 / 9
  const camDist = 40
  const r = shaftReach(camDist, fov, aspect, cfg1)

  // The invariant the owner's bug turned on: a fan anywhere in the frame must
  // still reach every corner of it, or its edge is visible on screen.
  const halfH = camDist * Math.tan((fov * Math.PI) / 360)
  const halfW = halfH * aspect
  const worstCase = Math.hypot(2 * halfW, 2 * halfH)
  check('reach covers the frame from any point in it', r >= worstCase - 1e-9,
    `${r.toFixed(2)} vs worst case ${worstCase.toFixed(2)}`)

  // ⚠️ Scales with DEPTH. The two orbs sit at very different distances from the
  // camera; a reach that did not follow would draw one huge fan and one small.
  check('reach grows with camera distance',
    shaftReach(camDist * 2, fov, aspect, cfg1) > r * 1.9)
  check('and with a wider viewport',
    shaftReach(camDist, fov, aspect * 2, cfg1) > r)
  check('SHAFT_REACH scales it', Math.abs(shaftReach(camDist, fov, aspect, { ...cfg, SHAFT_REACH: 2 }) - r * 2) < 1e-9)
}

// ── flicker ─────────────────────────────────────────────────────────
{
  check('no dip before the first interval', flickerAt(cfg.FLICKER_MS * 0.5, cfg) === 0)
  check('no dip between flickers',
    flickerAt(cfg.FLICKER_MS * 1.5, cfg) === 0, `${flickerAt(cfg.FLICKER_MS * 1.5, cfg)}`)
  const at = flickerAt(cfg.FLICKER_MS + cfg.FLICKER_DUR_MS * 0.25, cfg)
  check('a dip occurs at the interval', at > 0, at.toFixed(3))
  check('the dip never exceeds its configured depth', at <= cfg.FLICKER_DEPTH + 1e-9)
  // ⚠️ A screen that fully extinguishes reads as a fault, not as a projection.
  check('the flicker never fully extinguishes the glass', at < 1)
  // Three intervals, so a one-shot cannot pass as a permanent cadence.
  let dips = 0
  for (let k = 1; k <= 3; k++) {
    if (flickerAt(cfg.FLICKER_MS * k + cfg.FLICKER_DUR_MS * 0.25, cfg) > 0) dips++
  }
  check('and it repeats every interval', dips === 3, `${dips}`)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll hologramGeometry checks passed.')
process.exit(failures ? 1 : 0)
