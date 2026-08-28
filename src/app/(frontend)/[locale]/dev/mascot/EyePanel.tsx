'use client'

import { useCallback, useState } from 'react'
import {
  DEFAULT_EYE_TUNING,
  EXPRESSION_ORDER,
  cloneEyeTuning,
  type EyeTuning,
} from '@/lib/mascot/eyeTuning'
import type { EyeShape } from '@/lib/mascot/eyes'

/**
 * ⚠️ THROWAWAY. The eye-tuning half of the mascot bench, kept out of
 * MascotLab.tsx so that deleting it later is one file plus one JSX line.
 *
 * Exists so the owner can approve eye values ON SCREEN before a spec is
 * written — the inversion that produced the satellites and the mascot itself.
 * The JSON this panel copies out becomes the spec's source of truth.
 */

type Row = { key: keyof EyeTuning; label: string; min: number; max: number; step: number }

const LOOK: Row[] = [
  { key: 'GLOW', label: 'Glow', min: 0, max: 2, step: 0.05 },
  { key: 'GAP', label: 'Gap between eyes', min: 0, max: 0.9, step: 0.01 },
  { key: 'SOCKET_SPAN', label: 'Socket cover', min: 0.3, max: 2.2, step: 0.02 },
  { key: 'FACE_RADIUS', label: 'Face radius ⚠ measured 0.50', min: 0.3, max: 0.8, step: 0.01 },
]

const SCAN: Row[] = [
  { key: 'SCANLINE_MAX', label: 'Scanlines at full', min: 0, max: 20, step: 0.5 },
  { key: 'SCANLINE_MIN_PX', label: 'Off below body px', min: 0, max: 200, step: 2 },
  { key: 'SCANLINE_RAMP', label: 'px per extra line', min: 1, max: 60, step: 1 },
]

const BEAT: Row[] = [
  { key: 'GLANCE_SECONDS', label: 'Glance length s', min: 0.1, max: 3, step: 0.02 },
  { key: 'GLANCE_PEAK', label: 'Peak at', min: 0.05, max: 0.95, step: 0.01 },
  { key: 'FACING_THRESHOLD', label: 'Counts as facing', min: -0.5, max: 0.95, step: 0.02 },
  { key: 'CHARGE_CROSSOVER', label: 'Hold: wide → shut at', min: 0.05, max: 0.95, step: 0.01 },
]

const SHAPE: { key: keyof EyeShape; label: string; min: number; max: number; step: number }[] = [
  { key: 'dx', label: 'Separation (mirrored)', min: -0.5, max: 0.6, step: 0.01 },
  { key: 'gaze', label: 'Gaze ← → (both eyes)', min: -0.5, max: 0.5, step: 0.01 },
  { key: 'dy', label: 'Height (both eyes)', min: -0.5, max: 0.5, step: 0.01 },
  { key: 'w', label: 'Half width', min: 0.02, max: 0.8, step: 0.01 },
  { key: 'h', label: 'Half height', min: 0.02, max: 0.9, step: 0.01 },
  { key: 'lean', label: 'Lean °', min: -45, max: 45, step: 1 },
  { key: 'crescent', label: 'Crescent (0 = solid)', min: 0, max: 1.6, step: 0.02 },
]

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

const head: React.CSSProperties = {
  opacity: 0.6,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginTop: 12,
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  )
}

export default function EyePanel({
  tuning,
  onChange,
  inspect,
  onInspect,
}: {
  tuning: EyeTuning
  onChange: (t: EyeTuning) => void
  inspect: { on: boolean; angleDeg: number; sizePx: number }
  onInspect: (v: { on: boolean; angleDeg: number; sizePx: number }) => void
}) {
  const [sel, setSel] = useState('neutral')
  const [pinned, setPinned] = useState(false)
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [copied, setCopied] = useState(false)

  const setNum = useCallback(
    (k: keyof EyeTuning, v: number) => onChange({ ...tuning, [k]: v }),
    [tuning, onChange],
  )

  /**
   * The engine publishes __ttMascotExpr at construction; it is the documented
   * dev handle and already used by the verification scripts. Guarded because
   * the panel renders before the mascot has mounted and loaded.
   */
  const pin = useCallback((name: string | null) => {
    const fn = (window as unknown as Record<string, unknown>).__ttMascotExpr as
      | ((n: string | null) => unknown)
      | undefined
    fn?.(name)
  }, [])

  /**
   * Selecting an expression HOLDS it, always.
   *
   * The first version only held when a separate checkbox was ticked, and the
   * bench was unusable as a result: at rest the beat displays `neutral`, and
   * every other expression is on screen for a fraction of a second per orbit
   * pass — so dragging a slider for `happy` looked like it did nothing at all.
   * Only `neutral` appeared to respond, because `neutral` IS the resting face.
   * Picking a thing to tune is already the statement that you want to see it.
   */
  const pick = useCallback(
    (name: string) => {
      setSel(name)
      setSide('left')
      setPinned(true)
      pin(name)
    },
    [pin],
  )

  const shape = tuning.shapes[sel]
  const editing: EyeShape = side === 'right' ? (shape.right ?? shape.left) : shape.left
  const separated = shape.right !== null

  const setShape = useCallback(
    (k: keyof EyeShape, v: number) => {
      const cur = tuning.shapes[sel]
      const next = cloneEyeTuning(tuning)
      if (side === 'right') {
        next.shapes[sel].right = { ...(cur.right ?? cur.left), [k]: v }
      } else {
        next.shapes[sel].left = { ...cur.left, [k]: v }
      }
      onChange(next)
    },
    [tuning, sel, side, onChange],
  )

  const toggleSeparate = useCallback(
    (on: boolean) => {
      const next = cloneEyeTuning(tuning)
      next.shapes[sel].right = on ? { ...tuning.shapes[sel].left } : null
      onChange(next)
      setSide(on ? 'right' : 'left')
    },
    [tuning, sel, onChange],
  )

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [tuning])

  return (
    <aside
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 5,
        width: 300,
        padding: '14px 16px',
        background: 'rgba(246,241,231,0.94)',
        border: '1px solid rgba(43,42,39,0.25)',
        borderRadius: 4,
        font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#2B2A27',
        maxHeight: 'calc(100dvh - 32px)',
        overflowY: 'auto',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 8 }}>EYES — tuning bench</strong>

      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button type="button" onClick={copy} style={btn('rgba(43,42,39,0.55)')}>
          {copied ? 'copied' : 'copy json'}
        </button>
        <button
          type="button"
          onClick={() => onChange(cloneEyeTuning(DEFAULT_EYE_TUNING))}
          style={btn('rgba(43,42,39,0.35)')}
        >
          reset
        </button>
      </div>
      <div style={{ marginBottom: 4, opacity: 0.7 }}>
        Prototype values — nothing here is approved yet. Copy the JSON when it looks right and it
        becomes the spec.
      </div>

      {/* ── view ─────────────────────────────────────────────────────── */}
      <div style={head}>view</div>
      <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={inspect.on}
          onChange={(e) => onInspect({ ...inspect, on: e.target.checked })}
        />
        <span>inspect — parked, face-on, blown up</span>
      </label>
      <div
        style={{
          marginBottom: 8,
          padding: '5px 7px',
          borderRadius: 3,
          background: inspect.on ? 'rgba(142,17,20,0.12)' : 'rgba(43,42,39,0.07)',
        }}
      >
        {inspect.on
          ? '⚠ NOT what ships. Flip this off before approving anything — at real size the body is 12.6–70px and the face is turned toward you about a quarter of the time.'
          : 'truth: real size, real spin, real orbit.'}
      </div>
      {inspect.on && (
        <>
          <Slider
            label="Park at orbit angle °"
            value={inspect.angleDeg}
            min={0}
            max={360}
            step={1}
            onChange={(v) => onInspect({ ...inspect, angleDeg: v })}
          />
          <Slider
            label="Inspect diameter px"
            value={inspect.sizePx}
            min={60}
            max={600}
            step={10}
            onChange={(v) => onInspect({ ...inspect, sizePx: v })}
          />
        </>
      )}

      {/* ── expression ───────────────────────────────────────────────── */}
      <div style={head}>expression</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0 8px' }}>
        {EXPRESSION_ORDER.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => pick(name)}
            style={{
              padding: '3px 6px',
              font: 'inherit',
              cursor: 'pointer',
              borderRadius: 3,
              border: '1px solid rgba(43,42,39,0.25)',
              background: name === sel ? '#8E1114' : 'rgba(255,255,255,0.6)',
              color: name === sel ? '#F6F1E7' : '#2B2A27',
              // A zero-weight expression is out of the glance pool: it will
              // never appear on its own, which is easy to forget while tuning it.
              opacity: (tuning.weights[name] ?? 0) > 0 || name === 'neutral' || name === 'wide' ? 1 : 0.45,
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div
        style={{
          marginBottom: 8,
          padding: '5px 7px',
          borderRadius: 3,
          background: pinned ? 'rgba(142,17,20,0.12)' : 'rgba(43,42,39,0.07)',
        }}
      >
        {pinned ? (
          <>
            holding <strong>{sel}</strong> — the sliders below edit it live.{' '}
            <button
              type="button"
              onClick={() => {
                setPinned(false)
                pin(null)
              }}
              style={{
                font: 'inherit',
                padding: '1px 5px',
                marginTop: 3,
                cursor: 'pointer',
                borderRadius: 3,
                border: '1px solid rgba(43,42,39,0.3)',
                background: 'rgba(255,255,255,0.6)',
                color: 'inherit',
              }}
            >
              release — play the beat
            </button>
          </>
        ) : (
          'beat running — pick an expression to hold and edit it'
        )}
      </div>

      <label style={{ display: 'flex', gap: 6, marginBottom: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={separated}
          onChange={(e) => toggleSeparate(e.target.checked)}
        />
        <span>eyes differ (otherwise mirrored)</span>
      </label>

      {separated && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['left', 'right'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              style={btn(side === s ? '#8E1114' : 'rgba(43,42,39,0.35)')}
            >
              {s} eye
            </button>
          ))}
        </div>
      )}

      {SHAPE.map((r) => (
        <Slider
          key={r.key}
          label={r.label}
          value={editing[r.key]}
          min={r.min}
          max={r.max}
          step={r.step}
          onChange={(v) => setShape(r.key, v)}
        />
      ))}

      <Slider
        label={`Weight in glance pool${(tuning.weights[sel] ?? 0) === 0 ? ' (never plays)' : ''}`}
        value={tuning.weights[sel] ?? 0}
        min={0}
        max={4}
        step={1}
        onChange={(v) => onChange({ ...cloneEyeTuning(tuning), weights: { ...tuning.weights, [sel]: v } })}
      />

      {/* ── look ─────────────────────────────────────────────────────── */}
      <div style={head}>look</div>
      {(
        [
          ['COLOR', 'Eye colour'],
          ['CORE', 'Hot core'],
          ['SOCKET', 'Socket'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span>{label}</span>
          <input
            type="color"
            value={tuning[k]}
            onChange={(e) => onChange({ ...tuning, [k]: e.target.value.toUpperCase() })}
          />
        </label>
      ))}
      <div style={{ height: 6 }} />
      {LOOK.map((r) => (
        <Slider
          key={r.key}
          label={r.label}
          value={tuning[r.key] as number}
          min={r.min}
          max={r.max}
          step={r.step}
          onChange={(v) => setNum(r.key, v)}
        />
      ))}

      <div style={head}>scanlines</div>
      {SCAN.map((r) => (
        <Slider
          key={r.key}
          label={r.label}
          value={tuning[r.key] as number}
          min={r.min}
          max={r.max}
          step={r.step}
          onChange={(v) => setNum(r.key, v)}
        />
      ))}

      {/* ── beat ─────────────────────────────────────────────────────── */}
      <div style={head}>beat</div>
      <label style={{ display: 'flex', gap: 6, margin: '6px 0 8px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={tuning.NO_REPEAT}
          onChange={(e) => onChange({ ...tuning, NO_REPEAT: e.target.checked })}
        />
        <span title="The pool is sampled fresh each pass, so repeats cluster — you can get the same expression three sweeps running.">
          never repeat two passes running
        </span>
      </label>
      {BEAT.map((r) => (
        <Slider
          key={r.key}
          label={r.label}
          value={tuning[r.key] as number}
          min={r.min}
          max={r.max}
          step={r.step}
          onChange={(v) => setNum(r.key, v)}
        />
      ))}
    </aside>
  )
}
