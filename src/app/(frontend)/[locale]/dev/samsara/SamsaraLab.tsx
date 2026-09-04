'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SatelliteField } from '@/components/hero/SatelliteField'
import { MascotLayer } from '@/components/hero/MascotLayer'
import { SamsaraSequence, type SequenceControls } from '@/components/hero/SamsaraSequence'
import { DEFAULT_SEQUENCE, type SequenceConfig } from '@/lib/samsara/types'
import type { MascotEngine } from '@/lib/mascot/MascotEngine'
import type { Mode } from '@/lib/samsara/SequenceController'
import type { SatelliteConfig } from '@/lib/satellites/types'
import type { MascotConfig } from '@/lib/mascot/types'
import type { MascotEyesConfig } from '@/lib/mascot/eyeTypes'
import { EXPRESSION_ORDER } from '@/lib/mascot/eyes'
import type { LabelBox } from '@/lib/satellites/labels'
import type { SeparationConfig } from '@/lib/three/shatter/types'
import type { IgnitionConfig } from '@/lib/three/ignition/types'

const LogoCanvas = dynamic(() => import('@/components/three/LogoCanvas'), { ssr: false })

/**
 * The SAMSARA tuning bench. See page.tsx for what it is FOR.
 *
 * ⚠️ Three things about its shape are load-bearing, not stylistic.
 *
 * 1. **The stage mirrors the hero's DOM order exactly** — satellites, then the
 *    mascot, then the logo. All three sit at z-index 0 in one stacking context
 *    and the logo has to paint last. Reorder them and the mascot stops passing
 *    behind the mark, which is the property the whole handoff is built on.
 *
 * 2. **The panel is a SIBLING of the stage, not a child.** The sequence puts a
 *    non-passive `wheel` listener on the stage and calls `preventDefault()`
 *    unconditionally — that is what makes beats 1–3 move nothing. A panel
 *    inside the stage would inherit that and could not be scrolled at all.
 *
 * 3. **`LogoCanvas` is mounted directly, without `LogoStage`.** LogoStage owns
 *    the 7.67s sketch-draw video, and a bench that costs 7.67s per reload is a
 *    bench nobody tunes on. The trade is that the intro's own timing cannot be
 *    judged here — it has /dev/ignition.
 */

// ── the schema ──────────────────────────────────────────────────────
//
// Ranges are deliberately generous. This project has already shipped an
// owner-approved value sitting exactly on its own slider ceiling (the
// ignition's wireSpeed, flagged across three sessions): a slider that stops
// where someone's taste was still heading is a slider that made the decision.

type Row =
  | { kind: 'num'; path: string; label: string; min: number; max: number; step: number }
  | { kind: 'arr'; path: string; label: string; min: number; max: number; step: number }
  | { kind: 'color'; path: string; label: string }
  | { kind: 'weight'; path: string; label: string }
  | { kind: 'expr'; path: string; label: string }

const GROUPS: { title: string; note?: string; rows: Row[] }[] = [
  {
    title: 'gestures',
    note: 'one trackpad flick must stay ONE beat — test with a flick, not a wheel',
    rows: [
      { kind: 'num', path: 'GESTURES.BEATS_TO_COMMIT', label: 'Beats to commit', min: 2, max: 8, step: 1 },
      { kind: 'num', path: 'GESTURES.WHEEL_THRESHOLD', label: 'Wheel threshold', min: 20, max: 600, step: 5 },
      { kind: 'num', path: 'GESTURES.COOLDOWN_MS', label: 'Cooldown ms', min: 80, max: 1500, step: 10 },
      { kind: 'num', path: 'GESTURES.QUIET_MS', label: 'Quiet ms', min: 20, max: 800, step: 10 },
      { kind: 'num', path: 'GESTURES.TOUCH_THRESHOLD', label: 'Touch threshold', min: 10, max: 400, step: 5 },
    ],
  },
  {
    title: 'freeze',
    note: 'beat 1 must be unmistakable — a motionless page reads as broken',
    rows: [
      { kind: 'arr', path: 'FREEZE.SHAKE_PX_PER_BEAT', label: 'Shake px, beat', min: 0, max: 40, step: 0.5 },
      { kind: 'num', path: 'FREEZE.SHAKE_HZ', label: 'Shake Hz', min: 1, max: 40, step: 0.5 },
      { kind: 'arr', path: 'FREEZE.CHARGE_PER_BEAT', label: 'Charge, beat', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'transit',
    note: 'the fall must stay the longest phase, or the arc reads as a stutter',
    rows: [
      { kind: 'num', path: 'TRANSIT.HALF_ORBIT_MS', label: 'Sweep to far point ms', min: 0, max: 3000, step: 25 },
      { kind: 'num', path: 'TRANSIT.FALL_MS', label: 'Fall ms', min: 200, max: 4000, step: 25 },
      { kind: 'num', path: 'TRANSIT.BOUNCE_COUNT', label: 'Bounces', min: 0, max: 3, step: 1 },
      { kind: 'num', path: 'TRANSIT.RESTITUTION', label: 'Restitution', min: 0.05, max: 0.95, step: 0.01 },
      { kind: 'arr', path: 'TRANSIT.BOUNCE_MS', label: 'Bounce ms', min: 60, max: 1600, step: 10 },
      { kind: 'num', path: 'TRANSIT.SETTLE_MS', label: 'Settle ms', min: 60, max: 2000, step: 10 },
    ],
  },
  {
    title: 'landing',
    note: 'owner: 40% of viewport height, right on desktop, upper area on mobile',
    rows: [
      { kind: 'num', path: 'LANDING.SIZE_FRAC', label: 'Size × vh', min: 0.1, max: 0.9, step: 0.005 },
      { kind: 'num', path: 'LANDING.X_FRAC', label: 'Centre x × vw', min: 0, max: 1, step: 0.005 },
      { kind: 'num', path: 'LANDING.Y_FRAC', label: 'Centre y × vh', min: 0, max: 1, step: 0.005 },
      { kind: 'num', path: 'LANDING.MOBILE_SIZE_FRAC', label: 'Mobile size × vh', min: 0.1, max: 0.9, step: 0.005 },
      { kind: 'num', path: 'LANDING.MOBILE_X_FRAC', label: 'Mobile x × vw', min: 0, max: 1, step: 0.005 },
      { kind: 'num', path: 'LANDING.MOBILE_Y_FRAC', label: 'Mobile y × vh', min: 0, max: 1, step: 0.005 },
      { kind: 'num', path: 'LANDING.HOVER_BOB_PX', label: 'Hover bob px', min: 0, max: 60, step: 0.5 },
      { kind: 'num', path: 'LANDING.HOVER_BOB_MS', label: 'Hover bob ms', min: 400, max: 9000, step: 50 },
    ],
  },
  {
    title: 'parked orientation',
    note:
      'where the face points once landed. 0/0/0 is frontal and level. ' +
      'drag SAMSARA directly to find an angle, then read it back off these.',
    rows: [
      { kind: 'num', path: 'LANDING.ROT_X_DEG', label: 'Pitch ° (nod)', min: -180, max: 180, step: 1 },
      { kind: 'num', path: 'LANDING.ROT_Y_DEG', label: 'Yaw ° (turn)', min: -180, max: 180, step: 1 },
      { kind: 'num', path: 'LANDING.ROT_Z_DEG', label: 'Roll ° (tilt)', min: -180, max: 180, step: 1 },
    ],
  },
  {
    title: 'drag to turn',
    note:
      'RETURN DELAY 0 = stays where you put it, for inspecting the far side. ' +
      'non-zero = springs back to the parked pose, which is what a visitor should get.',
    rows: [
      { kind: 'num', path: 'DRAG.SENSITIVITY_DEG_PER_PX', label: '° per pixel', min: 0.05, max: 3, step: 0.05 },
      { kind: 'num', path: 'DRAG.MAX_PITCH_DEG', label: 'Max pitch °', min: 0, max: 180, step: 5 },
      { kind: 'num', path: 'DRAG.DAMPING', label: 'Spin-down (kept/sec)', min: 0, max: 0.9, step: 0.01 },
      { kind: 'num', path: 'DRAG.RETURN_DELAY_MS', label: 'Return delay ms (0 = stay)', min: 0, max: 10000, step: 100 },
      { kind: 'num', path: 'DRAG.RETURN_MS', label: 'Return ms', min: 100, max: 4000, step: 50 },
    ],
  },
  {
    title: 'room',
    note: 'DEPTH is geometry — changing it rebuilds the room, which is why it is not instant',
    rows: [
      { kind: 'color', path: 'ROOM.BG_COLOR', label: 'Backdrop' },
      { kind: 'color', path: 'ROOM.FLOOR_COLOR', label: 'Floor' },
      { kind: 'color', path: 'ROOM.WALL_COLOR', label: 'Walls' },
      { kind: 'color', path: 'ROOM.KEY_LIGHT_COLOR', label: 'Key light' },
      { kind: 'num', path: 'ROOM.KEY_LIGHT_INTENSITY', label: 'Key intensity', min: 0, max: 12, step: 0.05 },
      { kind: 'num', path: 'ROOM.AMBIENT_INTENSITY', label: 'Ambient', min: 0, max: 3, step: 0.01 },
      { kind: 'num', path: 'ROOM.CAMERA_FOV_DEG', label: 'Camera FOV °', min: 8, max: 100, step: 1 },
      { kind: 'num', path: 'ROOM.DEPTH', label: 'Room depth', min: 6, max: 200, step: 1 },
      { kind: 'num', path: 'ROOM.EXTENT', label: 'Surface extent', min: 1, max: 32, step: 0.25 },
    ],
  },
  {
    title: 'SAMSARA material (room only)',
    note:
      'starts OFF (strength 0) — the hero material at 12.6–70px is untouched at any setting. ' +
      'lighting alone cannot fix chrome-vs-brass or add verdigris; this is a real material control.',
    rows: [
      { kind: 'color', path: 'ROOM.MASCOT_TINT_COLOR', label: 'Tint colour' },
      { kind: 'num', path: 'ROOM.MASCOT_TINT_STRENGTH', label: 'Tint strength', min: 0, max: 1, step: 0.01 },
      { kind: 'num', path: 'ROOM.MASCOT_ROUGHNESS_BOOST', label: 'Roughness boost', min: -0.5, max: 0.5, step: 0.01 },
      { kind: 'color', path: 'ROOM.ENV_COLOR', label: 'Reflected env colour' },
      { kind: 'num', path: 'ROOM.ENV_INTENSITY', label: 'Reflected env strength', min: 0, max: 4, step: 0.05 },
      { kind: 'num', path: 'ROOM.MASCOT_STRETCH_X', label: 'Shape — width ×', min: 0.7, max: 1.3, step: 0.005 },
      { kind: 'num', path: 'ROOM.MASCOT_STRETCH_Y', label: 'Shape — height ×', min: 0.7, max: 1.3, step: 0.005 },
    ],
  },
  {
    title: 'idle eyes — the room expression loop',
    note:
      'weights are RELATIVE, not percentages. one slider per expression, generated from ' +
      'eyes.ts so a new expression can never be silently missing. 0 removes it from the ' +
      'random pool — which is what you want for whatever press-and-hold plays, or the ' +
      'interaction stops being a reward.',
    rows: [
      // Generated, not listed. A hand-written list is how an expression ends up
      // untunable: it exists in eyes.ts, has a weight in the config, plays on
      // screen, and has no control here — with nothing to indicate the gap.
      ...EXPRESSION_ORDER.map(
        (name): Row => ({
          kind: 'weight',
          path: `IDLE_EYES.WEIGHTS.${name}`,
          label: name === 'happy' ? 'happy (smile)' : name,
        }),
      ),
      { kind: 'num', path: 'IDLE_EYES.INTERVAL_MS', label: 'Interval ms', min: 200, max: 12000, step: 100 },
      { kind: 'num', path: 'IDLE_EYES.SMILE_SHAKE_PX', label: 'Smile shake px', min: 0, max: 80, step: 1 },
      { kind: 'num', path: 'IDLE_EYES.SMILE_SHAKE_MS', label: 'Smile shake ms', min: 100, max: 3000, step: 20 },
      { kind: 'expr', path: 'IDLE_EYES.HOLD_EXPRESSION', label: 'Press & hold plays' },
    ],
  },
  {
    title: 'golden smoke burst',
    note: 'shed from BEHIND the parked body, on a timer. distances are in body radii, so it holds its scale at every viewport. few + large + faint + growing reads as smoke; many + small + bright reads as dust.',
    rows: [
      { kind: 'num', path: 'BURST.INTERVAL_MS', label: 'Every ms', min: 400, max: 20000, step: 100 },
      { kind: 'num', path: 'BURST.COUNT', label: 'Motes per burst', min: 0, max: 400, step: 5 },
      { kind: 'num', path: 'BURST.SECONDS', label: 'Mote life s', min: 0.2, max: 5, step: 0.05 },
      { kind: 'num', path: 'BURST.SPEED', label: 'Outward speed', min: 0, max: 4, step: 0.05 },
      { kind: 'num', path: 'BURST.GROWTH', label: 'Billow (x size)', min: 0.2, max: 6, step: 0.05 },
      { kind: 'num', path: 'BURST.SWIRL', label: 'Curl', min: 0, max: 3, step: 0.02 },
      { kind: 'num', path: 'BURST.DRAG', label: 'Slow-down /s', min: 0, max: 6, step: 0.05 },
      { kind: 'num', path: 'BURST.RISE', label: 'Rise', min: -2, max: 2, step: 0.02 },
      { kind: 'num', path: 'BURST.SPREAD', label: 'Spawn spread', min: 0, max: 2, step: 0.05 },
      { kind: 'num', path: 'BURST.BACK_OFFSET', label: 'How far behind', min: 0, max: 3, step: 0.05 },
      { kind: 'num', path: 'BURST.SIZE', label: 'Puff px at body', min: 1, max: 180, step: 1 },
      { kind: 'num', path: 'BURST.OPACITY', label: 'Opacity', min: 0, max: 1, step: 0.01 },
      { kind: 'num', path: 'BURST.GLOW', label: 'Hot core', min: 0, max: 2, step: 0.05 },
      { kind: 'color', path: 'BURST.COLOR', label: 'Dust colour' },
      { kind: 'color', path: 'BURST.CORE_COLOR', label: 'Core colour' },
    ],
  },
  {
    title: 'emitter orbs — near',
    rows: [
      { kind: 'num', path: 'EMITTERS.SIZE_FRAC', label: 'Orb size (vh)', min: 0.02, max: 0.45, step: 0.005 },
      { kind: 'num', path: 'EMITTERS.NEAR.X_FRAC', label: 'Near x', min: -0.4, max: 1.4, step: 0.01 },
      { kind: 'num', path: 'EMITTERS.NEAR.Y_FRAC', label: 'Near y', min: -0.4, max: 1.4, step: 0.01 },
      { kind: 'num', path: 'EMITTERS.NEAR.DEPTH_FRAC', label: 'Near depth', min: 0.05, max: 0.95, step: 0.01 },
      { kind: 'num', path: 'EMITTERS.FAR.X_FRAC', label: 'Far x', min: -0.4, max: 1.4, step: 0.01 },
      { kind: 'num', path: 'EMITTERS.FAR.Y_FRAC', label: 'Far y', min: -0.4, max: 1.4, step: 0.01 },
      { kind: 'num', path: 'EMITTERS.FAR.DEPTH_FRAC', label: 'Far depth', min: 0.05, max: 0.95, step: 0.01 },
    ],
  },
  {
    title: 'emitter orbs — entry, float, smoke',
    rows: [
      { kind: 'num', path: 'EMITTERS.ENTRY_MS', label: 'Entry ms', min: 200, max: 6000, step: 50 },
      { kind: 'num', path: 'EMITTERS.ENTRY_STAGGER_MS', label: 'Far orb lag ms', min: 0, max: 3000, step: 20 },
      { kind: 'num', path: 'EMITTERS.BOB_AMP', label: 'Float amp (radii)', min: 0, max: 0.6, step: 0.005 },
      { kind: 'num', path: 'EMITTERS.BOB_MS', label: 'Float ms', min: 400, max: 12000, step: 50 },
      { kind: 'num', path: 'EMITTERS.THRUST_RATE', label: 'Thrust /s/port (entry)', min: 0, max: 200, step: 1 },
      { kind: 'num', path: 'EMITTERS.THRUST_SPREAD', label: 'Thrust spread', min: 0, max: 3, step: 0.02 },
      { kind: 'num', path: 'EMITTERS.CADENCE_MS', label: 'Burst every ms', min: 400, max: 20000, step: 50 },
      { kind: 'num', path: 'EMITTERS.CADENCE_PUFFS', label: 'Puffs per port', min: 1, max: 24, step: 1 },
      { kind: 'num', path: 'EMITTERS.PUFF_SIZE', label: 'Puff size (radii)', min: 0.02, max: 2, step: 0.01 },
      { kind: 'num', path: 'EMITTERS.PUFF_LIFE_MS', label: 'Puff life ms', min: 100, max: 8000, step: 25 },
      { kind: 'num', path: 'EMITTERS.PUFF_OPACITY', label: 'Puff opacity', min: 0, max: 1, step: 0.01 },
      { kind: 'color', path: 'EMITTERS.PUFF_COLOR', label: 'Puff colour' },
    ],
  },
  {
    title: 'hologram — placement',
    rows: [
      { kind: 'num', path: 'HOLOGRAM.X_FRAC', label: 'Screen x', min: -0.2, max: 1.2, step: 0.005 },
      { kind: 'num', path: 'HOLOGRAM.Y_FRAC', label: 'Screen y', min: -0.2, max: 1.2, step: 0.005 },
      { kind: 'num', path: 'HOLOGRAM.W_FRAC', label: 'Screen width', min: 0.05, max: 1.2, step: 0.005 },
      { kind: 'num', path: 'HOLOGRAM.H_FRAC', label: 'Screen height', min: 0.05, max: 1.2, step: 0.005 },
    ],
  },
  {
    title: 'hologram — look and flicker',
    rows: [
      { kind: 'num', path: 'HOLOGRAM.FORM_MS', label: 'Form ms', min: 100, max: 8000, step: 25 },
      { kind: 'num', path: 'HOLOGRAM.FLICKER_MS', label: 'Flicker every ms', min: 500, max: 30000, step: 100 },
      { kind: 'num', path: 'HOLOGRAM.FLICKER_DUR_MS', label: 'Flicker ms', min: 20, max: 2000, step: 10 },
      { kind: 'num', path: 'HOLOGRAM.FLICKER_DEPTH', label: 'Flicker depth', min: 0, max: 0.95, step: 0.01 },
      { kind: 'num', path: 'HOLOGRAM.GLASS_OPACITY', label: 'Glass opacity', min: 0, max: 1, step: 0.01 },
      { kind: 'color', path: 'HOLOGRAM.GLASS_COLOR', label: 'Glass colour' },
      { kind: 'num', path: 'HOLOGRAM.SHAFT_OPACITY', label: 'Shaft opacity', min: 0, max: 1, step: 0.01 },
      { kind: 'num', path: 'HOLOGRAM.SHAFT_SPREAD', label: 'Shaft spread', min: 0.02, max: 3, step: 0.01 },
      { kind: 'color', path: 'HOLOGRAM.SHAFT_COLOR', label: 'Shaft colour' },
    ],
  },
  {
    title: 'exit',
    rows: [
      { kind: 'num', path: 'EXIT_MS', label: 'Exit ms', min: 100, max: 4000, step: 25 },
    ],
  },
]

// ── path helpers ────────────────────────────────────────────────────

type Any = Record<string, unknown>

function getPath(obj: Any, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Any)?.[k], obj)
}

/** Structurally clones only the spine down to `path`, so React sees a change. */
function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.')
  const clone = (node: unknown, i: number): unknown => {
    if (i === keys.length) return value
    const k = keys[i]
    if (Array.isArray(node)) {
      const next = node.slice()
      next[Number(k)] = clone(node[Number(k)], i + 1)
      return next
    }
    const src = (node ?? {}) as Any
    return { ...src, [k]: clone(src[k], i + 1) }
  }
  return clone(obj, 0) as T
}

const btn = (bg: string): React.CSSProperties => ({
  flex: 1,
  padding: '5px 8px',
  background: bg,
  color: '#F6F1E7',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  font: 'inherit',
})

const MODE_COLOR: Record<Mode, string> = {
  idle: 'rgba(43,42,39,0.55)',
  charge1: '#7A6A18',
  charge2: '#9A7A12',
  charge3: '#B8860B',
  committed: '#8E1114',
  landed: '#1E6B4F',
  exiting: '#3A4F7A',
}

export default function SamsaraLab({
  separation,
  ignition,
  satellites,
  mascot,
  eyes: eyesInitial,
  words,
}: {
  separation: SeparationConfig
  ignition: IgnitionConfig
  satellites: SatelliteConfig
  mascot: MascotConfig
  eyes: MascotEyesConfig
  words: string[]
}) {
  const [cfg, setCfg] = useState<SequenceConfig>(() => structuredClone(DEFAULT_SEQUENCE))
  /**
   * The eye config is tunable HERE too, not just at /dev/mascot.
   *
   * The socket cover is the one eye control whose correct value can only be
   * judged in the ROOM: at the hero's 12.6-70px there is no monogram plaque or
   * chin band to see it overrun, which is exactly how it shipped covering both.
   */
  const [eyes, setEyes] = useState<MascotEyesConfig>(() => ({ ...eyesInitial }))
  const setEye = useCallback(
    <K extends keyof MascotEyesConfig>(k: K, v: MascotEyesConfig[K]) =>
      setEyes((e) => ({ ...e, [k]: v })),
    [],
  )
  const [mode, setMode] = useState<Mode>('idle')
  const [engine, setEngine] = useState<MascotEngine | null>(null)
  const [shakePx, setShakePx] = useState(0)
  const [holdEnabled, setHoldEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showLogo, setShowLogo] = useState(true)
  const [showSats, setShowSats] = useState(true)
  const [parkSpin, setParkSpin] = useState(true)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('loading…')

  const stageRef = useRef<HTMLDivElement>(null)
  const mascotRootRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<SequenceControls | null>(null)
  const chargeRef = useRef<(() => number) | null>(null)
  const labelBoxRef = useRef<(() => LabelBox | null) | null>(null)
  const seqChargeRef = useRef(0)
  const mergedChargeRef = useRef<(() => number) | null>(null)
  mergedChargeRef.current = () => Math.max(chargeRef.current?.() ?? 0, seqChargeRef.current)
  // The mark's separation charge. Separate from the belt's, and deliberately
  // NOT merged back in — see the same pair in HeroBlock for why.
  const seqLogoChargeRef = useRef(0)
  const logoChargeGetterRef = useRef<(() => number) | null>(null)
  logoChargeGetterRef.current = () => seqLogoChargeRef.current

  const onChargeSource = useCallback((get: (() => number) | null) => {
    chargeRef.current = get
  }, [])

  const set = useCallback((path: string, value: unknown) => {
    setCfg((c) => setPath(c, path, value))
  }, [])

  // The bench has no video, so nothing else would ever arm the sequence.
  useEffect(() => {
    const t = setTimeout(() => setActive(true), 800)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStatus('⚠ reduced motion is ON — the sequence is disabled by design (spec §5.9)')
    } else {
      setStatus('scroll over the stage, or use the beat buttons')
    }
  }, [])

  /**
   * ⚠️ ROOM.DEPTH and ROOM.EXTENT are GEOMETRY. `setRoomConfig` reaches colours
   * and light intensities, which are uniforms and update live; the floor, walls
   * and backdrop are all SIZED at build time and cannot be. So a change to
   * either throws the room away and lets the next reveal build a fresh one.
   *
   * The camera needs no equivalent: the sequence re-solves it every frame while
   * promoted, which is also what keeps a mid-fall resize from stranding it.
   */
  useEffect(() => {
    if (!engine) return
    // 220ms debounce, and it is not cosmetic: dragging a range input fires an
    // `input` event per pixel, so an undebounced rebuild disposes and
    // reconstructs the floor, four walls, the backdrop and their materials
    // dozens of times per second while the owner is still deciding. The other
    // benches debounce their whole rebuild for the same reason; here only this
    // one control needs it, because everything else is a uniform.
    const t = setTimeout(() => engine.rebuildRoom(), 220)
    return () => clearTimeout(t)
  }, [engine, cfg.ROOM.DEPTH, cfg.ROOM.EXTENT])

  /**
   * Parking the spin, per plan Task 12.
   *
   * Spec §6.5 wants SAMSARA stationary and front-facing in the room, and Task
   * 11 did not wire it — the spin runs through the transit, so the landed
   * rotation is whatever `SPIN_SPEED 113` happened to reach. That makes Task
   * 13's idle-eye tuning impossible: you cannot weight expressions you cannot
   * see.
   *
   * So the BENCH parks it, rather than the landing doing so. Which of the two
   * ships is a Task 13 decision, and this is the surface that lets the owner
   * make it: turn the checkbox off to see exactly what the hero does today.
   */
  useEffect(() => {
    engine?.setSpinParked(parkSpin && (mode === 'landed' || mode === 'exiting'))
  }, [engine, parkSpin, mode])

  /**
   * Any config value can be overridden from the query string, with dotted paths
   * for the nested groups: `?ENABLED=0`, `?LANDING.Y_FRAC=0.62&ROOM.DEPTH=40`.
   *
   * Same reason the mascot bench has this: verification scripts need to drive a
   * specific configuration, and faking input on React-controlled sliders is a
   * fight they should not have to pick. Task 17's kill-switch and reduced-motion
   * checks both need `?ENABLED=0`.
   *
   * ⚠️ `window.location`, not `useSearchParams()`. The latter needs a <Suspense>
   * boundary or `next build` fails outright on static prerendering with
   * missing-suspense-with-csr-bailout — `next dev` compiles it fine, so it only
   * surfaces in CI. This project has already paid for that once.
   */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setCfg((c) => {
      let next = c
      for (const [k, v] of q) {
        const cur = getPath(next as unknown as Any, k)
        if (typeof cur === 'number') next = setPath(next, k, Number(v))
        else if (typeof cur === 'boolean') next = setPath(next, k, v === '1' || v === 'true')
        else if (typeof cur === 'string') next = setPath(next, k, v)
      }
      return next
    })
  }, [])

  /**
   * Dev handle for verification scripts. This page is notFound() in production.
   *
   * `set` takes the same dotted paths the sliders use, so a script can churn a
   * control the way a person would without synthesising input events on a
   * React-controlled range.
   */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__ttSamsaraBench = {
      set: (path: string, value: unknown) => setCfg((c) => setPath(c, path, value)),
      get: () => cfg,
      replay: () => runAllRef.current(),
      reset: () => controlsRef.current?.reset(),
    }
    return () => {
      delete w.__ttSamsaraBench
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg])

  const copyJson = useCallback(() => {
    void navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [cfg])

  /**
   * The socket lives in the EYE config, not the sequence config, so it cannot
   * ride along in `copy json` without changing the shape of what that button
   * emits — and that shape is what gets pasted into DEFAULT_SEQUENCE. A second
   * button keeps both paste targets honest.
   */
  const [copiedEyes, setCopiedEyes] = useState(false)
  const copyEyes = useCallback(() => {
    void navigator.clipboard?.writeText(
      JSON.stringify(
        {
          SOCKET: eyes.SOCKET,
          SOCKET_SPAN: eyes.SOCKET_SPAN,
          SOCKET_SPAN_Y: eyes.SOCKET_SPAN_Y,
          SOCKET_FEATHER: eyes.SOCKET_FEATHER,
        },
        null,
        2,
      ),
    )
    setCopiedEyes(true)
    setTimeout(() => setCopiedEyes(false), 1200)
  }, [eyes])

  /** Four beats, spaced past the cooldown, so one press runs the whole thing. */
  const runAll = useCallback(() => {
    const c = controlsRef.current
    if (!c) return
    c.reset()
    const n = cfg.GESTURES.BEATS_TO_COMMIT
    for (let i = 0; i < n; i++) setTimeout(() => controlsRef.current?.beat('down'), 90 * (i + 1))
  }, [cfg.GESTURES.BEATS_TO_COMMIT])

  // Indirection so the dev handle above can call the latest runAll without
  // re-registering itself every time BEATS_TO_COMMIT changes.
  const runAllRef = useRef(runAll)
  runAllRef.current = runAll

  const beltCfg = useMemo<SatelliteConfig>(
    () => ({ ...satellites, SAT_ENABLED: showSats && satellites.SAT_ENABLED }),
    [satellites, showSats],
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #F6F1E7)', position: 'relative' }}>
      {/* THE STAGE. Mirrors the hero: relative, 100svh, overflow hidden, and
          the three 3D layers in the hero's own DOM order. */}
      <div
        ref={stageRef}
        style={{ position: 'relative', minHeight: '100svh', overflow: 'hidden' }}
      >
        <SatelliteField
          words={words}
          config={beltCfg}
          active={active}
          chargeRef={mergedChargeRef}
          labelBoxRef={labelBoxRef}
        />
        <MascotLayer
          config={mascot}
          belt={satellites}
          active={active}
          enabled={mascot.ENABLED}
          chargeRef={mergedChargeRef}
          labelBoxRef={labelBoxRef}
          eyes={eyes}
          onEngine={setEngine}
          rootElRef={mascotRootRef}
          holdHint={cfg.DRAG.ENABLED ? 'Click & Hold' : undefined}
        />
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: showLogo ? 1 : 0 }}>
          <LogoCanvas
            config={separation}
            ignition={ignition}
            ignite
            armed={holdEnabled}
            onReady={() => setActive(true)}
            onChargeSource={onChargeSource}
            externalChargeRef={logoChargeGetterRef}
          />
        </div>
        {/* The DOM shake, which in the hero lives on the headline and the
            bottom container. Neither exists here, so the bench shows the
            amplitude on a marker instead of pretending it has nowhere to go. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 24,
            zIndex: 1,
            transform: `translate(calc(-50% + ${shakePx}px), 0)`,
            font: '11px/1 ui-monospace, monospace',
            color: 'var(--accent, #8E1114)',
            opacity: shakePx > 0 ? 1 : 0.25,
          }}
        >
          DOM shake ±{shakePx}px
        </div>
      </div>

      <SamsaraSequence
        config={cfg}
        belt={satellites}
        mascot={mascot}
        engine={engine}
        rootElRef={mascotRootRef}
        heroRef={stageRef}
        armed={active && mascot.ENABLED}
        onShake={setShakePx}
        chargeOutRef={seqChargeRef}
        logoChargeOutRef={seqLogoChargeRef}
        onPointerHold={setHoldEnabled}
        onMode={setMode}
        controlsRef={controlsRef}
      />

      {/* SIBLING of the stage, deliberately — see the header. z-index is above
          the promoted canvas (40) so the panel survives the landing.

          ⚠️ `data-lenis-prevent` is REQUIRED, not defensive. Being outside the
          stage keeps the sequence's own wheel handler off this element, but the
          pin is `lenis.stop()`, and Lenis stops scrolling by preventing wheel
          events at the window — which blocks this panel's native overflow
          scrolling as well. MEASURED: without the attribute, a 900px wheel over
          the panel moved scrollTop from 0 to 0. That is not a rough edge, it is
          Task 13 being impossible: the owner cannot reach the sliders below the
          fold once the first beat lands. */}
      <aside
        data-lenis-prevent
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 100,
          width: 310,
          padding: '14px 16px',
          background: 'rgba(246,241,231,0.94)',
          border: '1px solid rgba(43,42,39,0.25)',
          borderRadius: 4,
          font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#2B2A27',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <strong style={{ display: 'block', marginBottom: 8 }}>SAMSARA — transition bench</strong>
        <div style={{ marginBottom: 8, opacity: 0.75 }}>{status}</div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            padding: '4px 8px',
            borderRadius: 3,
            background: MODE_COLOR[mode],
            color: '#F6F1E7',
          }}
        >
          <span>{mode}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>shake {shakePx}px</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={() => controlsRef.current?.beat('down')} style={btn('rgba(43,42,39,0.55)')}>
            beat ↓
          </button>
          <button type="button" onClick={() => controlsRef.current?.beat('up')} style={btn('rgba(43,42,39,0.55)')}>
            beat ↑
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={runAll} style={btn('#8E1114')}>
            replay
          </button>
          <button type="button" onClick={() => controlsRef.current?.reset()} style={btn('rgba(43,42,39,0.35)')}>
            stop
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={copyJson} style={btn('rgba(43,42,39,0.55)')}>
            {copied ? 'copied' : 'copy json'}
          </button>
          <button
            type="button"
            onClick={() => {
              controlsRef.current?.reset()
              setCfg(structuredClone(DEFAULT_SEQUENCE))
              setEyes({ ...eyesInitial })
            }}
            style={btn('rgba(43,42,39,0.35)')}
          >
            reset
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={copyEyes} style={btn('rgba(43,42,39,0.55)')}>
            {copiedEyes ? 'copied' : 'copy eye socket'}
          </button>
        </div>
        <div style={{ marginBottom: 12, opacity: 0.7 }}>
          ⚠ nothing saves. `copy eye socket` → `lib/mascot/eyeTypes.ts`.
          `copy json` → paste into `lib/samsara/types.ts` and update
          `types.check.ts` in the same commit (plan Task 13).
        </div>

        {(
          [
            ['show logo', showLogo, setShowLogo],
            ['show satellites', showSats, setShowSats],
            ['park spin when landed', parkSpin, setParkSpin],
          ] as const
        ).map(([label, value, setter]) => (
          <label key={label} style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={value} onChange={(e) => setter(e.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.DRAG.ENABLED}
            onChange={(e) => set('DRAG.ENABLED', e.target.checked)}
          />
          <span title="Click-hold-drag SAMSARA to turn it. Landed only.">
            drag to turn
          </span>
        </label>
        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.BURST.ENABLED}
            onChange={(e) => set('BURST.ENABLED', e.target.checked)}
          />
          <span title="Golden smoke shed from behind SAMSARA once it has parked. Landed only.">
            golden smoke burst
          </span>
        </label>
        <label style={{ display: 'flex', gap: 6, marginBottom: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.ENABLED}
            onChange={(e) => set('ENABLED', e.target.checked)}
          />
          <span title="The kill switch. Off means ordinary scrolling and no cinematic at all.">
            sequence enabled
          </span>
        </label>

        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginTop: 12 }}>
            <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {g.title}
            </div>
            {g.note ? (
              <div style={{ opacity: 0.55, marginBottom: 6, fontStyle: 'italic' }}>{g.note}</div>
            ) : null}
            {g.rows.map((r) => {
              if (r.kind === 'expr') {
                const v = getPath(cfg as unknown as Any, r.path) as string
                return (
                  <label key={r.path} style={{ display: 'block', marginBottom: 8 }}>
                    <span style={{ display: 'block', marginBottom: 3 }}>{r.label}</span>
                    <select
                      value={v}
                      onChange={(e) => set(r.path, e.target.value)}
                      style={{
                        width: '100%',
                        font: 'inherit',
                        color: 'inherit',
                        background: 'rgba(255,255,255,0.6)',
                        border: '1px solid rgba(43,42,39,0.25)',
                        borderRadius: 3,
                        padding: '3px 5px',
                      }}
                    >
                      <option value="">(none — press does nothing)</option>
                      {EXPRESSION_ORDER.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
              if (r.kind === 'color') {
                const v = getPath(cfg as unknown as Any, r.path) as string
                return (
                  <label
                    key={r.path}
                    style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}
                  >
                    <span>{r.label}</span>
                    <input
                      type="color"
                      value={v}
                      /* UPPERCASE on write: the admin colour swatch writes back
                         uppercase, and a lowercase value marks the form dirty
                         just from loading it. */
                      onChange={(e) => set(r.path, e.target.value.toUpperCase())}
                    />
                  </label>
                )
              }
              if (r.kind === 'arr') {
                const arr = getPath(cfg as unknown as Any, r.path) as number[]
                return (
                  <div key={r.path}>
                    {arr.map((v, i) => (
                      <label key={i} style={{ display: 'block', marginBottom: 6 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            {r.label} {i + 1}
                          </span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                        </span>
                        <input
                          type="range"
                          min={r.min}
                          max={r.max}
                          step={r.step}
                          value={v}
                          onChange={(e) => set(`${r.path}.${i}`, Number(e.target.value))}
                          style={{ width: '100%' }}
                        />
                      </label>
                    ))}
                  </div>
                )
              }
              const v = getPath(cfg as unknown as Any, r.path) as number
              const min = r.kind === 'weight' ? 0 : r.min
              const max = r.kind === 'weight' ? 20 : r.max
              const step = r.kind === 'weight' ? 1 : r.step
              return (
                <label key={r.path} style={{ display: 'block', marginBottom: 6 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={v}
                    onChange={(e) => set(r.path, Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </label>
              )
            })}
          </div>
        ))}

        <div style={{ marginTop: 12 }}>
          <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            eye socket — the darkening cover
          </div>
          <div style={{ opacity: 0.55, marginBottom: 6, fontStyle: 'italic' }}>
            hides the model&apos;s PAINTED amber eyes. an ELLIPSE, because a circle wide enough
            for the gaze also blacks out the forehead plaque and the chin band. widen the
            feather and the painted scanlines start reading through it.
          </div>
          {(
            [
              ['SOCKET_SPAN', 'Span — width', 0.4, 2.4, 0.01],
              ['SOCKET_SPAN_Y', 'Span — height', 0.4, 2.4, 0.01],
              ['SOCKET_FEATHER', 'Edge feather', 0.01, 0.6, 0.005],
            ] as const
          ).map(([k, label, min, max, step]) => (
            <label key={k} style={{ display: 'block', marginBottom: 6 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{eyes[k]}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={eyes[k]}
                onChange={(e) => setEye(k, Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
          ))}
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span>Socket colour</span>
            <input
              type="color"
              value={eyes.SOCKET}
              onChange={(e) => setEye('SOCKET', e.target.value.toUpperCase())}
            />
          </label>
        </div>

        <div style={{ marginTop: 14, opacity: 0.55 }}>
          ⚠ `ROOM.FOG_DENSITY` has no slider on purpose: the room deliberately
          carries NO `scene.fog`, because the scene is SHARED with the orbit and
          fog would tint the mascot while it is still circling the mark. Depth
          falloff comes from the key light&apos;s own distance decay. The field
          stays in the config; nothing reads it.
        </div>
      </aside>
    </div>
  )
}
