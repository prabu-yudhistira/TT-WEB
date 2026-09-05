/**
 * Pins `emitterOrbs` — the arithmetic that decides where the two orbs are.
 *
 * These are STRUCTURAL assertions, not value pins: EMITTERS is unfrozen (spec
 * §9), so this file asserts the relationships the composition depends on and
 * leaves the magnitudes to the owner's bench pass.
 */
import { DEFAULT_SEQUENCE, portOffsets } from './types'
import {
  orbParkedPose,
  orbPoseAt,
  orbBobY,
  orbRot,
  portWorld,
  lensWorld,
  type OrbCtx,
} from './emitterOrbs'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (cond) console.log(`ok    ${label}   ${note}`)
  else {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  }
}

const cfg = DEFAULT_SEQUENCE.EMITTERS
const land: OrbCtx = { W: 1440, H: 900, mobile: false, roomDepth: 42, camZ: 30 }
const port: OrbCtx = { W: 390, H: 844, mobile: true, roomDepth: 42, camZ: 30 }

// ── parked placement ────────────────────────────────────────────────
{
  const near = orbParkedPose('near', cfg, land)
  const far = orbParkedPose('far', cfg, land)
  check('near orb is nearer the camera than far', near.z > far.z,
    `${near.z.toFixed(2)} vs ${far.z.toFixed(2)}`)
  // ⚠️ The "one size, two positions" rule (spec §6.1). If this ever fails
  // someone has added a second size value, and the owner's mockup proportions
  // stop being reproducible from config.
  check('both orbs share ONE world radius', Math.abs(near.radius - far.radius) < 1e-9,
    `${near.radius} vs ${far.radius}`)
  check('near orb is left of centre', near.x < 0, near.x.toFixed(2))
  check('near orb is below centre', near.y < 0, near.y.toFixed(2))
}

// ── portrait flanks the screen instead of sitting beside SAMSARA ────
{
  const near = orbParkedPose('near', cfg, port)
  const far = orbParkedPose('far', cfg, port)
  check('portrait flanks: near left, far right', near.x < 0 && far.x > 0,
    `${near.x.toFixed(2)} / ${far.x.toFixed(2)}`)
  check('portrait orbs are smaller than landscape',
    near.radius < orbParkedPose('near', cfg, land).radius,
    `${near.radius.toFixed(3)} vs ${orbParkedPose('near', cfg, land).radius.toFixed(3)}`)
}

// ── entry path ──────────────────────────────────────────────────────
{
  const parked = orbParkedPose('near', cfg, land)
  const t0 = orbPoseAt('near', 0, cfg, land)
  const tEnd = orbPoseAt('near', cfg.ENTRY_MS, cfg, land)
  // Spec §5.1: the orbs fly in from the camera side, past the viewer. Starting
  // inside the frustum would have them fade in rather than arrive.
  check('entry starts behind the camera', t0.z > land.camZ,
    `${t0.z.toFixed(2)} vs cam ${land.camZ}`)
  check('entry ends exactly on the parked pose',
    Math.abs(tEnd.x - parked.x) < 1e-6 &&
    Math.abs(tEnd.y - parked.y) < 1e-6 &&
    Math.abs(tEnd.z - parked.z) < 1e-6)
  check('entry is monotonic in depth', orbPoseAt('near', 800, cfg, land).z > parked.z)
  check('past the end it holds the parked pose',
    Math.abs(orbPoseAt('near', cfg.ENTRY_MS * 3, cfg, land).z - parked.z) < 1e-6)
  check('the radius never changes during entry',
    Math.abs(t0.radius - parked.radius) < 1e-9)
}

// ── the stagger is real, not decorative ─────────────────────────────
{
  const nearParked = orbParkedPose('near', cfg, land)
  const farParked = orbParkedPose('far', cfg, land)
  check('near has parked while far is still travelling',
    Math.abs(orbPoseAt('near', cfg.ENTRY_MS, cfg, land).z - nearParked.z) < 1e-6 &&
    Math.abs(orbPoseAt('far', cfg.ENTRY_MS, cfg, land).z - farParked.z) > 1e-3)
  check('far parks after its own stagger + entry',
    Math.abs(orbPoseAt('far', cfg.ENTRY_MS + cfg.ENTRY_STAGGER_MS, cfg, land).z - farParked.z) < 1e-6)
}

// ── bob ─────────────────────────────────────────────────────────────
{
  const a = orbBobY('near', 0, cfg)
  check('bob moves', Math.abs(a - orbBobY('near', cfg.BOB_MS / 4, cfg)) > 1e-6)
  check('bob stays within its amplitude', Math.abs(a) <= cfg.BOB_AMP + 1e-9)
  check('bob is periodic', Math.abs(orbBobY('near', cfg.BOB_MS, cfg) - a) < 1e-6)
  // ⚠️ In phase, the two orbs read as one rigid object on a spring rather than
  // as two independently hovering machines.
  check('the two orbs bob out of phase',
    Math.abs(orbBobY('near', 0, cfg) - orbBobY('far', 0, cfg)) > 1e-6)
}

// ── ports and lens ──────────────────────────────────────────────────
{
  const pose = orbParkedPose('near', cfg, land)
  const local = portOffsets(cfg)
  check('there are four ports', local.length === 4)
  const ports = local.map((_, i) => portWorld(pose, i, cfg))
  check('all four ports are below the orb centre', ports.every((p) => p[1] < pose.y))
  check('ports scale with the orb radius',
    Math.abs(
      Math.hypot(ports[0][0] - pose.x, ports[0][1] - pose.y, ports[0][2] - pose.z) -
        Math.hypot(...local[0]) * pose.radius,
    ) < 1e-6)
  // Four distinct ports, not one repeated — a copy/paste in PORT_OFFSETS would
  // put every plume in the same place and look almost right.
  check('the four ports are distinct',
    new Set(ports.map((p) => p.map((v) => v.toFixed(4)).join(','))).size === 4)
  check('the lens is above the orb centre', lensWorld(pose, cfg)[1] > pose.y)
}

// ── parked orientation ──────────────────────────────────────────────
{
  const pose = orbParkedPose('near', cfg, land)
  const zero = { X_DEG: 0, Y_DEG: 0, Z_DEG: 0 }
  check('zero rotation is the identity',
    portWorld(pose, 0, cfg, zero).every((v, i) => Math.abs(v - portWorld(pose, 0, cfg)[i]) < 1e-12))

  // ⚠️ The ports must MOVE with the body. Rotating the mesh while the ports
  // stayed put would emit smoke from empty space beside the orb, and at the
  // 0/0/0 default the two agree perfectly — so it would look right until the
  // first time anyone touched the slider.
  const spun = portWorld(pose, 0, cfg, { X_DEG: 0, Y_DEG: 90, Z_DEG: 0 })
  check('a yaw moves the afterburners', Math.hypot(
    spun[0] - portWorld(pose, 0, cfg)[0], spun[2] - portWorld(pose, 0, cfg)[2]) > 1e-3)

  // A pure yaw is about the Y axis, so height is untouched.
  check('and a pure yaw leaves their height alone',
    Math.abs(spun[1] - portWorld(pose, 0, cfg)[1]) < 1e-9)

  // Distance from the orb centre is a property of the body, not of its pose.
  const dist = (q: number[]) => Math.hypot(q[0] - pose.x, q[1] - pose.y, q[2] - pose.z)
  check('rotation is rigid — the ports keep their distance',
    Math.abs(dist(spun) - dist(portWorld(pose, 0, cfg))) < 1e-9)

  const lensSpun = lensWorld(pose, cfg, { X_DEG: 180, Y_DEG: 0, Z_DEG: 0 })
  check('a 180 pitch puts the lens below the centre', lensSpun[1] < pose.y)

  check('the two orbs can be oriented independently',
    orbRot('near', cfg, land) !== orbRot('far', cfg, land) ||
      JSON.stringify(cfg.NEAR_ROT) === JSON.stringify(cfg.FAR_ROT))
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll emitterOrbs checks passed.')
process.exit(failures ? 1 : 0)
