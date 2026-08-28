'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SatelliteField } from '@/components/hero/SatelliteField'
import { MascotLayer } from '@/components/hero/MascotLayer'
import { DEFAULT_MASCOT, type MascotConfig } from '@/lib/mascot/types'
import type { SatelliteConfig } from '@/lib/satellites/types'
import type { LabelBox } from '@/lib/satellites/labels'
import type { SeparationConfig } from '@/lib/three/shatter/types'
import type { IgnitionConfig } from '@/lib/three/ignition/types'

const LogoCanvas = dynamic(() => import('@/components/three/LogoCanvas'), { ssr: false })

/**
 * Tuning bench for the orbiting mascot.
 *
 * ⚠️ PROTOTYPE — nothing here saves to the CMS, because there is no mascot CMS
 * group yet. Tune, then hit "copy json" and the approved numbers become the
 * spec's frozen defaults. This is the same order that worked for the
 * satellites: numbers approved on screen first, spec written around them.
 *
 * The real satellites and the real logo are both mounted, unmodified, so what
 * is being judged is the mascot against the actual belt it has to share —
 * not against a mock-up of one.
 */

type NumKey = {
  [K in keyof MascotConfig]: MascotConfig[K] extends number ? K : never
}[keyof MascotConfig]

type Row = { key: NumKey; label: string; min: number; max: number; step: number }

// Ranges are deliberately generous. This project has already shipped an
// owner-approved value sitting exactly on its own slider ceiling (the
// ignition's wireSpeed, flagged across three sessions) — a slider that stops
// where someone's taste was still heading is a slider that made the decision.
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'orbit',
    rows: [
      { key: 'RADIUS', label: 'Radius (× belt outer)', min: 0.3, max: 2.5, step: 0.01 },
      { key: 'MOBILE_RADIUS', label: 'Mobile radius', min: 0.3, max: 2.5, step: 0.01 },
      { key: 'SPEED_SCALE', label: 'Speed × belt', min: 0, max: 3, step: 0.01 },
      { key: 'PHASE', label: 'Start angle °', min: 0, max: 360, step: 1 },
      { key: 'HEIGHT', label: 'Height off plane px', min: -300, max: 300, step: 2 },
      { key: 'TILT_OFFSET', label: 'Own inclination °', min: -60, max: 60, step: 1 },
    ],
  },
  {
    title: 'size & look',
    rows: [
      { key: 'SIZE', label: 'Diameter px', min: 20, max: 420, step: 2 },
      { key: 'MOBILE_SIZE', label: 'Mobile diameter px', min: 16, max: 300, step: 2 },
      { key: 'DEPTH_SCALE', label: 'Near/far size boost', min: 0, max: 3, step: 0.05 },
      { key: 'OPACITY', label: 'Opacity', min: 0.05, max: 1, step: 0.01 },
      { key: 'ENV_INTENSITY', label: 'Reflection strength', min: 0, max: 4, step: 0.05 },
      { key: 'LIGHT_INTENSITY', label: 'Key light', min: 0, max: 6, step: 0.05 },
    ],
  },
  {
    title: 'spin',
    rows: [
      { key: 'SPIN_SPEED', label: 'Spin °/sec', min: -180, max: 180, step: 1 },
      { key: 'SPIN_TILT', label: 'Spin axis tilt °', min: -90, max: 90, step: 1 },
      { key: 'BOB_PX', label: 'Bob px', min: 0, max: 80, step: 1 },
      { key: 'BOB_SECONDS', label: 'Bob period s', min: 0.5, max: 20, step: 0.1 },
    ],
  },
  {
    title: 'trail — gold dust',
    rows: [
      { key: 'TRAIL_SECONDS', label: 'Mote lifetime s', min: 0.05, max: 5, step: 0.05 },
      { key: 'TRAIL_DENSITY', label: 'Motes per second', min: 0, max: 400, step: 5 },
      { key: 'TRAIL_SIZE', label: 'Mote size px', min: 1, max: 40, step: 0.5 },
      { key: 'TRAIL_SPREAD', label: 'Emission scatter px', min: 0, max: 60, step: 0.5 },
      { key: 'TRAIL_DRIFT', label: 'Drift px/sec', min: 0, max: 160, step: 1 },
      { key: 'TRAIL_GLOW', label: 'Core glow', min: 0, max: 1, step: 0.01 },
      { key: 'TRAIL_TWINKLE', label: 'Twinkle', min: 0, max: 1, step: 0.01 },
      { key: 'TRAIL_OPACITY', label: 'Opacity', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'label',
    rows: [
      { key: 'LABEL_SIZE', label: 'Font px', min: 8, max: 40, step: 1 },
      { key: 'LABEL_OFFSET', label: 'Gap from body px', min: 0, max: 80, step: 1 },
      // Fixes the word going illegible where it crosses the mark's red stroke.
      { key: 'LABEL_HALO', label: 'Paper halo px', min: 0, max: 6, step: 0.25 },
    ],
  },
  {
    title: 'hold + behaviour',
    rows: [
      { key: 'HOLD_SHAKE_PX', label: 'Hold shake px', min: 0, max: 40, step: 0.5 },
      { key: 'HOLD_SHAKE_SPEED', label: 'Hold shake speed', min: 0.1, max: 4, step: 0.05 },
      { key: 'ENTRANCE_MS', label: 'Entrance ms', min: 0, max: 5000, step: 100 },
      { key: 'SCROLL_FADE_VH', label: 'Scroll fade (vh)', min: 0, max: 3, step: 0.1 },
    ],
  },
]

const PRESETS: { name: string; note: string; patch: Partial<MascotConfig> }[] = [
  {
    name: 'Close',
    note: 'just outside the beads, small and quick — reads as one of the belt',
    patch: { RADIUS: 0.88, SIZE: 64, SPEED_SCALE: 0.8, SPIN_SPEED: 20, TRAIL_SECONDS: 0.8 },
  },
  {
    name: 'Wide',
    note: 'a wide slow sweep well clear of the belt — reads as its own body',
    patch: { RADIUS: 1.15, SIZE: 110, SPEED_SCALE: 0.45, SPIN_SPEED: 10, TRAIL_SECONDS: 1.4 },
  },
  {
    name: 'Flyby',
    note: 'wide enough to leave frame at the extremes — it visits, then goes',
    patch: { RADIUS: 1.5, SIZE: 150, SPEED_SCALE: 0.6, SPIN_SPEED: 16, TRAIL_SECONDS: 2 },
  },
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

export default function MascotLab({
  separation,
  ignition,
  satellites,
  words,
}: {
  separation: SeparationConfig
  ignition: IgnitionConfig
  satellites: SatelliteConfig
  words: string[]
}) {
  const [cfg, setCfg] = useState<MascotConfig>({ ...DEFAULT_MASCOT })
  const [active, setActive] = useState(false)
  const [showLogo, setShowLogo] = useState(true)
  const [showSats, setShowSats] = useState(true)
  const [status, setStatus] = useState('loading logo…')
  const [mascotStatus, setMascotStatus] = useState('')
  const [copied, setCopied] = useState(false)
  /**
   * Gates the mascot's first mount until the query-string overrides have
   * landed. Without it the layer mounts with ENABLED still true, fires the
   * 530 KB model fetch, and only then gets switched off — which made the
   * kill-switch check pass for the wrong reason (canvas gone, bytes already on
   * the wire). Found by that check, not by reading the code.
   *
   * Applying the overrides in a useState initialiser instead would read
   * `window` during the server render and desync hydration.
   */
  const [overridesApplied, setOverridesApplied] = useState(false)
  const chargeRef = useRef<(() => number) | null>(null)
  /** Carries the mascot's label box to the satellites' collision pass. */
  const labelBoxRef = useRef<(() => LabelBox | null) | null>(null)
  const onChargeSource = useCallback((get: (() => number) | null) => {
    chargeRef.current = get
  }, [])

  const set = useCallback(<K extends keyof MascotConfig>(k: K, v: MascotConfig[K]) => {
    setCfg((c) => ({ ...c, [k]: v }))
  }, [])

  // Entrance rides the real ignition cue, exactly as the hero's belt does. The
  // timeout is a bench-only safety net so a disabled or failed ignition still
  // leaves something on screen to look at.
  useEffect(() => {
    if (active) return
    const t = setTimeout(() => setActive(true), 3500)
    return () => clearTimeout(t)
  }, [active])

  const copyJson = useCallback(() => {
    void navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [cfg])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStatus('⚠ reduced motion is ON — the mascot is a single static frame by design')
    }
  }, [])

  /**
   * Any config key can be overridden from the query string
   * (?RADIUS=0.25&SIZE=200&TRAIL_ENABLED=0), so verification scripts can drive
   * a specific configuration instead of trying to fake React-controlled slider
   * input.
   *
   * window.location rather than useSearchParams(): the latter needs a
   * <Suspense> boundary or `next build` fails outright on static prerendering
   * with missing-suspense-with-csr-bailout — `next dev` compiles it fine, so
   * it only shows up in CI. This project has already paid for that once.
   */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setCfg((c) => {
      const next = { ...c } as Record<string, unknown>
      for (const [k, v] of q) {
        const cur = next[k]
        if (typeof cur === 'number') next[k] = Number(v)
        else if (typeof cur === 'boolean') next[k] = v === '1' || v === 'true'
        else if (typeof cur === 'string') next[k] = v
      }
      return next as MascotConfig
    })
    setOverridesApplied(true)
  }, [])

  // The satellite belt with its own satellites optionally hidden, so the
  // mascot can be judged alone without changing the belt geometry it shares.
  const beltCfg = useMemo<SatelliteConfig>(
    () => ({ ...satellites, SAT_ENABLED: showSats && satellites.SAT_ENABLED }),
    [satellites, showSats],
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #F6F1E7)', position: 'relative' }}>
      {/* DOM order is load-bearing: everything at z 0 must come BEFORE the logo
          so the logo paints over it. */}
      <SatelliteField
        words={words}
        config={beltCfg}
        active={active}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
      />
      <MascotLayer
        config={cfg}
        belt={satellites}
        active={active}
        enabled={overridesApplied && cfg.ENABLED}
        chargeRef={chargeRef}
        labelBoxRef={labelBoxRef}
        onStatus={setMascotStatus}
      />

      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: showLogo ? 1 : 0 }}>
        <LogoCanvas
          config={separation}
          ignition={ignition}
          ignite
          armed
          onReady={() => setStatus('logo ready — press and hold the mark')}
          onIgnitionCue={() => setActive(true)}
          onChargeSource={onChargeSource}
        />
      </div>

      <aside
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
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
        <strong style={{ display: 'block', marginBottom: 8 }}>MASCOT — tuning bench</strong>
        <div style={{ marginBottom: 4, opacity: 0.75 }}>{status}</div>
        <div style={{ marginBottom: 10, opacity: 0.75 }}>{mascotStatus}</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={copyJson} style={btn('#8E1114')}>
            {copied ? 'copied' : 'copy json'}
          </button>
          <button
            type="button"
            onClick={() => setCfg({ ...DEFAULT_MASCOT })}
            style={btn('rgba(43,42,39,0.35)')}
          >
            reset
          </button>
        </div>
        <div style={{ marginBottom: 10, opacity: 0.7 }}>
          prototype — nothing saves to the CMS yet
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => {
              setActive(false)
              setTimeout(() => setActive(true), 60)
            }}
            style={btn('rgba(43,42,39,0.35)')}
          >
            replay entrance
          </button>
        </div>

        <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          presets
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.note}
              onClick={() => setCfg((c) => ({ ...c, ...p.patch }))}
              style={btn('rgba(43,42,39,0.35)')}
            >
              {p.name}
            </button>
          ))}
        </div>

        {[
          ['show logo', showLogo, setShowLogo] as const,
          ['show satellites', showSats, setShowSats] as const,
        ].map(([label, value, setter]) => (
          <label key={label} style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={value} onChange={(e) => setter(e.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.ENABLED}
            onChange={(e) => set('ENABLED', e.target.checked)}
          />
          <span>show mascot</span>
        </label>
        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.TRAIL_ENABLED}
            onChange={(e) => set('TRAIL_ENABLED', e.target.checked)}
          />
          <span>trail</span>
        </label>
        <label style={{ display: 'flex', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.HOLD_FREEZE}
            onChange={(e) => set('HOLD_FREEZE', e.target.checked)}
          />
          <span>freeze + shake on hold</span>
        </label>

        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.LABEL_ENABLED}
            onChange={(e) => set('LABEL_ENABLED', e.target.checked)}
          />
          <span>label</span>
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span style={{ opacity: 0.7 }}>label text</span>
          <input
            type="text"
            value={cfg.LABEL_TEXT}
            spellCheck={false}
            onChange={(e) => set('LABEL_TEXT', e.target.value)}
            style={{
              width: '100%',
              marginTop: 3,
              font: 'inherit',
              color: 'inherit',
              background: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(43,42,39,0.25)',
              borderRadius: 3,
              padding: '3px 5px',
            }}
          />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span>Label colour</span>
          <input
            type="color"
            value={cfg.LABEL_COLOR}
            onChange={(e) => set('LABEL_COLOR', e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.TRAIL_ADDITIVE}
            onChange={(e) => set('TRAIL_ADDITIVE', e.target.checked)}
          />
          <span title="On #F6F1E7 paper additive has little headroom left and tends to wash toward white rather than read as gold — worth seeing rather than taking on trust.">
            additive blending
          </span>
        </label>

        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span>Dust colour</span>
          <input
            type="color"
            value={cfg.TRAIL_COLOR}
            onChange={(e) => set('TRAIL_COLOR', e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span>Hot core</span>
          <input
            type="color"
            value={cfg.TRAIL_CORE_COLOR}
            onChange={(e) => set('TRAIL_CORE_COLOR', e.target.value)}
          />
        </label>

        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginTop: 12 }}>
            <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {g.title}
            </div>
            {g.rows.map((r) => (
              <label key={r.key} style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cfg[r.key]}</span>
                </span>
                <input
                  type="range"
                  min={r.min}
                  max={r.max}
                  step={r.step}
                  value={cfg[r.key]}
                  onChange={(e) => set(r.key, Number(e.target.value) as never)}
                  style={{ width: '100%' }}
                />
              </label>
            ))}
          </div>
        ))}
      </aside>
    </div>
  )
}
