/**
 * Pins the sequence state machine.
 *
 * Spec §5.1. The charge beats build the freeze and are REVERSIBLE; the last one
 * commits to a fixed-duration cinematic that scroll can no longer scrub.
 * Scrolling up from the room plays a short exit, not a rewind of the fall.
 *
 * ⚠️ The machine is exercised against a LOCAL four-beat config, not the shipped
 * one, and that separation is the point. The controller has to be correct at any
 * BEATS_TO_COMMIT — walking charge1 -> charge2 -> charge3 and back needs three
 * charge beats to walk THROUGH. The owner froze the live sequence at two
 * (2026-08-31), which would leave charge2 and charge3 permanently unreachable
 * and eleven assertions here quietly testing nothing. The shipped config's own
 * shape is asserted separately at the end, so both stay honest.
 * Run: npm run verify:config
 */
import { SequenceController } from './SequenceController'
import { DEFAULT_SEQUENCE } from './types'

let failures = 0
const check = (label: string, cond: boolean, note = '') => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}   ${note}`)
  } else {
    console.log(`ok    ${label}   ${note}`)
  }
}

// Four beats, to exercise the full charge1..charge3 walk. See the header.
const cfg = {
  ...DEFAULT_SEQUENCE,
  GESTURES: { ...DEFAULT_SEQUENCE.GESTURES, BEATS_TO_COMMIT: 4 },
  FREEZE: {
    ...DEFAULT_SEQUENCE.FREEZE,
    SHAKE_PX_PER_BEAT: [2, 3, 4],
    CHARGE_PER_BEAT: [0.4, 0.7, 1],
  },
}
const make = () => new SequenceController(cfg)

// The Mode union names charge1..charge3, so a config claiming more charge beats
// than that would have modes the union cannot express.
check('the fixture stays within the Mode union', cfg.GESTURES.BEATS_TO_COMMIT - 1 <= 3)

// ── forward through the charge ──────────────────────────────────────
{
  const c = make()
  check('starts idle', c.mode === 'idle')
  c.beat('down')
  check('1 down -> charge1', c.mode === 'charge1')
  c.beat('down')
  check('2 down -> charge2', c.mode === 'charge2')
  c.beat('down')
  check('3 down -> charge3', c.mode === 'charge3')
  c.beat('down')
  check('4 down -> committed', c.mode === 'committed')
}

// ── the charge is reversible; the commit is not ─────────────────────
{
  const c = make()
  c.beat('down')
  c.beat('down')
  check('at charge2', c.mode === 'charge2')
  c.beat('up')
  check('up from charge2 -> charge1', c.mode === 'charge1')
  c.beat('up')
  check('up from charge1 -> idle', c.mode === 'idle')
  c.beat('up')
  check('up from idle stays idle', c.mode === 'idle')
}

{
  const c = make()
  for (let i = 0; i < 4; i++) c.beat('down')
  check('committed', c.mode === 'committed')

  // ⚠️ Asserting only that `mode` stays 'committed' proves NOTHING — the mode
  // getter short-circuits on the phase, so it reads 'committed' even when the
  // beat handler is happily mutating state underneath. A sabotage that let
  // beats through left this suite fully green while silently resetting the
  // transit clock to 0, restarting the whole cinematic mid-fall.
  //
  // Progress is what actually witnesses interference.
  c.advance(c.transitTotalMs * 0.4)
  const mid = c.transit01
  check('mid-cinematic progress recorded', Math.abs(mid - 0.4) < 0.02, mid.toFixed(3))

  c.beat('down')
  check('a down beat does not restart the cinematic', c.transit01 === mid, c.transit01.toFixed(3))
  c.beat('up')
  check('an up beat does not rewind the cinematic', c.transit01 === mid, c.transit01.toFixed(3))
  check('mode is still committed', c.mode === 'committed')

  // And it must still land on schedule, not be pushed out by the beats.
  c.advance(c.transitTotalMs * 0.61)
  check('lands on schedule despite the beats', c.mode === 'landed')
}

// ── committed runs on a clock, to landed ────────────────────────────
{
  const c = make()
  for (let i = 0; i < 4; i++) c.beat('down')
  const total = c.transitTotalMs
  check('transit total is the sum of its phases', total > 0, `${total}ms`)

  c.advance(total * 0.5)
  check('halfway through the transit, still committed', c.mode === 'committed')
  check(
    'transit progress tracks the clock',
    Math.abs(c.transit01 - 0.5) < 0.02,
    c.transit01.toFixed(3),
  )

  c.advance(total * 0.6)
  check('past the end -> landed', c.mode === 'landed')
  check('transit progress clamps at 1', c.transit01 === 1)
}

// ── exit ────────────────────────────────────────────────────────────
{
  const c = make()
  for (let i = 0; i < 4; i++) c.beat('down')
  c.advance(c.transitTotalMs + 1)
  check('landed', c.mode === 'landed')

  c.beat('down')
  check('down while landed does nothing', c.mode === 'landed')

  c.beat('up')
  check('up from landed -> exiting', c.mode === 'exiting')
  c.advance(cfg.EXIT_MS * 0.5)
  check('mid-exit, still exiting', c.mode === 'exiting')
  check('exit progress tracks the clock', Math.abs(c.exit01 - 0.5) < 0.02, c.exit01.toFixed(3))
  c.advance(cfg.EXIT_MS)
  check('past the exit -> idle', c.mode === 'idle')
  check('charge is released on return to idle', c.chargeLevel === 0)
}

// ── charge and shake ramp with the beats ────────────────────────────
{
  const c = make()
  check('idle charge is exactly 0', c.chargeLevel === 0)
  check('idle shake is exactly 0', c.shakePx === 0)

  const charges: number[] = []
  const shakes: number[] = []
  for (let i = 0; i < 3; i++) {
    c.beat('down')
    charges.push(c.chargeLevel)
    shakes.push(c.shakePx)
  }
  check(
    `charge ramps (${charges.join(', ')})`,
    charges.every((v, i) => i === 0 || v > charges[i - 1]),
  )
  check(
    `shake ramps (${shakes.join(', ')})`,
    shakes.every((v, i) => i === 0 || v > shakes[i - 1]),
  )
  check('charge tops out at full before the commit', charges[2] === 1)
  check(
    'charge matches the configured ramp',
    charges.every((v, i) => v === cfg.FREEZE.CHARGE_PER_BEAT[i]),
  )

  // Stepping back down must retrace the same values, not decay separately.
  c.beat('up')
  check('stepping back down retraces the ramp', c.chargeLevel === cfg.FREEZE.CHARGE_PER_BEAT[1])
}

// ── the sequence owns the charge from beat 1 ────────────────────────
// Spec §5.8: pointer-hold must be disabled while the sequence is running, or
// the visitor can fight the animation. Exposed as a flag so the React layer
// cannot forget to ask.
{
  const c = make()
  check('pointer hold allowed while idle', c.pointerHoldAllowed === true)
  c.beat('down')
  check('pointer hold disabled from beat 1', c.pointerHoldAllowed === false)
  c.beat('up')
  check('pointer hold restored on return to idle', c.pointerHoldAllowed === true)
}

// ── advance() outside timed states is inert ─────────────────────────
{
  const c = make()
  c.advance(99999)
  check('advancing while idle does nothing', c.mode === 'idle')
  c.beat('down')
  c.advance(99999)
  check('advancing while charging does nothing', c.mode === 'charge1')
}

// ── and the SHIPPED config, whatever it is tuned to ─────────────────
// The machine above is generic; this is the one instance of it that ships.
{
  const live = DEFAULT_SEQUENCE
  const steps = live.GESTURES.BEATS_TO_COMMIT
  const c = new SequenceController(live)
  for (let i = 0; i < steps - 1; i++) c.beat('down')
  check(
    `the approved ${steps}-beat config charges before it commits`,
    c.mode !== 'idle' && c.mode !== 'committed',
    c.mode,
  )
  c.beat('down')
  check('and the last beat commits', c.mode === 'committed', c.mode)

  // Reversible right up to the commit — the property a visitor relies on to
  // back out of a freeze they started by accident.
  const r = new SequenceController(live)
  for (let i = 0; i < steps - 1; i++) r.beat('down')
  for (let i = 0; i < steps - 1; i++) r.beat('up')
  check('and it walks all the way back to idle', r.mode === 'idle', r.mode)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll sequence controller checks passed.')
process.exit(failures ? 1 : 0)
