/**
 * Pins the externally-driven separation — the SAMSARA freeze's hold on the mark.
 *
 * Spec §4.4: during the freeze all three 3D layers shake, and the mark shakes
 * "through its separation — the sequence drives that charge from beat 1". Until
 * Task 13 the only thing that could separate the mark was a finger held on it,
 * so this input is new and it crosses two components.
 *
 * ⚠️ The assertion that matters most is the one that looks least interesting:
 * `getCharge()` must NOT include the external drive.
 *
 * `LogoEngine.getCharge()` is published to the satellites and the mascot so they
 * freeze with the mark. During the sequence they are already being driven from
 * the same source that drives `external`. Fold it in here and that value depends
 * on itself through two components — and because HeroBlock merges with `max()`,
 * it could then never fall again: the belt would latch at full freeze for the
 * rest of the session, with no error and nothing in the console. That is not a
 * bug anyone finds by reading; it is a bug someone reports as "the hero froze".
 *
 * Only `uBlast` is touched by this controller, so the uniforms are a stub rather
 * than a real three.js set — which keeps this file pure and millisecond-fast.
 * Run: npm run verify:config
 */
import { ShatterController } from './ShatterController'
import { DEFAULT_SEPARATION, type ShatterUniforms } from './types'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  } else {
    console.log(`ok    ${label}   ${note}`)
  }
}

const make = () => {
  const u = { uBlast: { value: 0 } } as unknown as ShatterUniforms
  return { u, c: new ShatterController(u, 100, DEFAULT_SEPARATION) }
}

// ── the external drive renders, with no pointer involved ────────────
{
  const { u, c } = make()
  check('starts at rest', u.uBlast.value === 0 && c.getEffectiveCharge() === 0)

  c.setExternalCharge(0.4)
  c.update(1 / 60)
  check('external charge reaches the shader', Math.abs(u.uBlast.value - 0.4) < 1e-9, String(u.uBlast.value))
  check('effective charge follows it', Math.abs(c.getEffectiveCharge() - 0.4) < 1e-9)
}

// ── ⚠️ THE ANTI-FEEDBACK CONTRACT ───────────────────────────────────
{
  const { c } = make()
  c.setExternalCharge(1)
  c.update(1 / 60)
  check(
    'getCharge() EXCLUDES the external drive — the belt must not read its own output',
    c.getCharge() === 0,
    `got ${c.getCharge()}`,
  )
  check('while getEffectiveCharge() includes it', c.getEffectiveCharge() === 1)
}

// ── the state the ignition's hold pulses key off ────────────────────
{
  const { c } = make()
  check('idle at rest', c.getState() === 'idle')
  c.setExternalCharge(0.5)
  check('a partial external drive reads as charging', c.getState() === 'charging', c.getState())
  c.setExternalCharge(1)
  check('a full external drive reads as blasted', c.getState() === 'blasted', c.getState())
  c.setExternalCharge(0)
  check('and it lets go again', c.getState() === 'idle', c.getState())
}

// ── the mark vibrates with whatever is actually driving it ──────────
{
  const { c } = make()
  const rest = c.getVibrateOffset()
  check('no shake at rest', Math.abs(rest.x) < 1e-9 && Math.abs(rest.y) < 1e-9)

  c.setExternalCharge(1)
  c.update(1 / 60)
  const shaken = c.getVibrateOffset()
  check(
    'the external drive shakes the mark',
    Math.abs(shaken.x) > 1e-6 || Math.abs(shaken.y) > 1e-6,
    `${shaken.x.toFixed(4)}, ${shaken.y.toFixed(4)}`,
  )

  // Amplitude is linear in the effective charge, so half the drive is half the
  // shake — checked at the same phase, or the sine would decide the answer.
  const half = make()
  half.c.setExternalCharge(1)
  half.c.update(1 / 60)
  const full = Math.hypot(...Object.values(half.c.getVibrateOffset()))
  const q = make()
  q.c.setExternalCharge(0.5)
  q.c.update(1 / 60)
  const halfMag = Math.hypot(...Object.values(q.c.getVibrateOffset()))
  check('shake is linear in the charge', Math.abs(halfMag * 2 - full) < 1e-6, `${halfMag} vs ${full}`)
}

// ── clamped, because a bench slider can overshoot ───────────────────
{
  const { u, c } = make()
  c.setExternalCharge(4)
  c.update(1 / 60)
  check('clamps above 1', u.uBlast.value === 1, String(u.uBlast.value))
  c.setExternalCharge(-2)
  c.update(1 / 60)
  check('clamps below 0', u.uBlast.value === 0, String(u.uBlast.value))
}

// ── the two drives coexist; whichever leads, wins ───────────────────
{
  const { u, c } = make()
  c.setArmed(true)
  c.pointerDown(0, 0)
  // CHARGE_MS 950, so ~500ms of holding puts the pointer charge past 0.5.
  for (let i = 0; i < 32; i++) c.update(1 / 60)
  const pointer = c.getCharge()
  check('a real press still charges', pointer > 0.4 && pointer < 1, pointer.toFixed(3))

  c.setExternalCharge(0.1)
  c.update(1 / 60)
  check('a weaker external drive does not pull it down', u.uBlast.value >= pointer, String(u.uBlast.value))

  c.setExternalCharge(1)
  c.update(1 / 60)
  check('a stronger one takes over', u.uBlast.value === 1)
}

// ── ⚠️ disarming must not blank a sequence-driven separation ────────
//
// Spec §5.8 disables hold-to-separate from beat 1 — which is the same instant
// the sequence starts driving `external`. setArmed(false) calls cancel(), and
// cancel() used to zero uBlast unconditionally.
{
  const { u, c } = make()
  c.setExternalCharge(1)
  c.update(1 / 60)
  c.setArmed(false)
  check('disarming leaves the external separation standing', u.uBlast.value === 1, String(u.uBlast.value))
  c.update(1 / 60)
  check('and it survives the next frame', u.uBlast.value === 1, String(u.uBlast.value))
}

// ── and it releases cleanly ─────────────────────────────────────────
{
  const { u, c } = make()
  c.setExternalCharge(1)
  c.update(1 / 60)
  c.setExternalCharge(0)
  c.update(1 / 60)
  check('dropping the drive releases the mark', u.uBlast.value === 0)
  check('no residual pointer charge was invented', c.getCharge() === 0)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll shatter controller checks passed.')
process.exit(failures ? 1 : 0)
