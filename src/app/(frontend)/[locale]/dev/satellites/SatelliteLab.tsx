'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SatelliteField } from '@/components/hero/SatelliteField'
import { DEFAULT_SATELLITES, type LabelMode, type SatelliteConfig } from '@/lib/satellites/types'
import type { SeparationConfig } from '@/lib/three/shatter/types'
import type { IgnitionConfig } from '@/lib/three/ignition/types'

const LogoCanvas = dynamic(() => import('@/components/three/LogoCanvas'), { ssr: false })

/**
 * PROTOTYPE tuning bench. Throwaway.
 *
 * Unlike the ignition and shatter benches this never rebuilds an engine on a
 * slider change — the satellite field takes live config updates in place — so
 * there is no WebGL context churn here and no debounce is needed.
 *
 * The words are hard-coded rather than CMS-fed on purpose: this prototype makes
 * zero database or schema changes, so rollback is "delete the branch".
 */

// Used only when the homepage has no hero words to seed from.
const FALLBACK_WORDS = ['Strategy', 'Interface', 'Motion', 'Craft', 'Systems', 'Identity']

/**
 * One word per line, blank lines dropped — the same convention as the CMS's own
 * constellation editor (FloatingWordsField, shipped in PR #2), so whatever is
 * tuned here transfers to /admin without re-learning a second format.
 *
 * The satellite count IS the word count: add a line, get a satellite.
 */
const parseWords = (text: string): string[] =>
  text
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean)

/**
 * Bench state persists to localStorage, not to the CMS.
 *
 * The shatter and ignition benches POST to /api/globals/hero-effects because
 * those features have fields there. The satellites deliberately have none — the
 * prototype makes zero schema changes so rollback stays "delete the branch" —
 * so there is nothing to write. Losing a tuning session to a page reload is a
 * real cost though, hence this.
 */
const STORE_KEY = 'tt-satellites-proto-v1'

type Saved = { cfg: Partial<SatelliteConfig>; wordText: string; at: number }

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Saved
    return parsed && typeof parsed === 'object' && parsed.cfg ? parsed : null
  } catch {
    return null
  }
}

type NumKey = {
  [K in keyof SatelliteConfig]: SatelliteConfig[K] extends number ? K : never
}[keyof SatelliteConfig]

type Row = { key: NumKey; label: string; min: number; max: number; step: number }

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'field geometry',
    rows: [
      { key: 'INNER_RADIUS', label: 'Inner radius (× logo)', min: 0.4, max: 3, step: 0.05 },
      { key: 'OUTER_RADIUS', label: 'Outer radius', min: 0.2, max: 1.6, step: 0.02 },
      { key: 'TILT', label: 'Inclination °', min: 0, max: 90, step: 1 },
      { key: 'TILT_SIDEWAY', label: 'Roll °', min: 0, max: 360, step: 1 },
      { key: 'PERSPECTIVE', label: 'Perspective', min: 300, max: 4000, step: 50 },
    ],
  },
  {
    title: 'dust',
    rows: [
      { key: 'DUST_COUNT', label: 'Count', min: 0, max: 2000, step: 10 },
      { key: 'DUST_SIZE', label: 'Size', min: 0.3, max: 10, step: 0.1 },
      { key: 'DUST_ALPHA', label: 'Opacity', min: 0.02, max: 1, step: 0.01 },
      { key: 'DUST_THICKNESS', label: 'Disk thickness', min: 0, max: 120, step: 1 },
      { key: 'DUST_CLUSTER', label: 'Inner clustering', min: 1, max: 4, step: 0.1 },
      { key: 'TRAIL', label: 'Trail length', min: 0, max: 50, step: 1 },
      { key: 'DUST_STREAK', label: 'Streak (0=dots)', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: 'motion',
    rows: [
      { key: 'ORBIT_SPEED', label: 'Orbit speed', min: 0, max: 20, step: 0.1 },
      { key: 'HOLD_SHAKE_PX', label: 'Hold shake px', min: 0, max: 40, step: 0.5 },
      { key: 'HOLD_SHAKE_SPEED', label: 'Hold shake speed', min: 0.1, max: 4, step: 0.05 },
      { key: 'PULL_SPEED', label: 'Inward pull', min: 0, max: 20, step: 0.1 },
      { key: 'SAT_SPEED_SCALE', label: 'Satellite speed ×', min: 0.1, max: 3, step: 0.05 },
    ],
  },
  {
    title: 'satellites',
    rows: [
      { key: 'SAT_SIZE', label: 'Size', min: 1, max: 40, step: 0.5 },
      { key: 'SAT_ALPHA', label: 'Opacity', min: 0.05, max: 1, step: 0.01 },
      { key: 'SAT_SHADE', label: '3D shading (0=flat)', min: 0, max: 1, step: 0.05 },
      { key: 'SAT_DEPTH_SCALE', label: 'Near/far size boost', min: 0, max: 2, step: 0.05 },
      { key: 'SAT_STREAK', label: 'Trail streak', min: 0, max: 1, step: 0.05 },
      { key: 'SAT_RING', label: 'Ring × size', min: 0, max: 6, step: 0.1 },
      { key: 'SAT_RADIUS_MIN', label: 'Band inner', min: 0.1, max: 1, step: 0.02 },
      { key: 'SAT_RADIUS_MAX', label: 'Band outer', min: 0.1, max: 1.4, step: 0.02 },
      { key: 'SAT_TILT_SPREAD', label: 'Inclination spread °', min: 0, max: 120, step: 1 },
    ],
  },
  {
    title: 'labels',
    rows: [
      { key: 'LABEL_SIZE', label: 'Font px', min: 8, max: 32, step: 1 },
      { key: 'LABEL_OFFSET', label: 'Offset px', min: 0, max: 60, step: 1 },
      { key: 'LABEL_HOVER_RADIUS', label: 'Hover radius px', min: 20, max: 300, step: 5 },
    ],
  },
  {
    title: 'behaviour',
    rows: [{ key: 'ENTRANCE_MS', label: 'Entrance ms', min: 0, max: 5000, step: 100 }],
  },
]

const COLORS: [keyof SatelliteConfig & string, string][] = [
  ['DUST_COLOR', 'Dust'],
  ['SAT_COLOR', 'Satellite'],
  ['LABEL_COLOR', 'Label'],
]

// Three readings of "3D satellites orbiting the logo", dust-free per the
// owner's 2026-08-26 call. They differ in the geometry question that is still
// genuinely open: one shared orbital plane, or many inclinations.
const PRESETS: { name: string; note: string; patch: Partial<SatelliteConfig> }[] = [
  {
    name: 'Ring',
    note: 'one shared plane, near edge-on — a single orbital belt',
    patch: {
      DUST_COUNT: 0,
      TILT: 18,
      TILT_SIDEWAY: 160,
      OUTER_RADIUS: 0.72,
      TRAIL: 44,
      ORBIT_SPEED: 3.2,
      SAT_TILT_SPREAD: 6,
      SAT_RADIUS_MIN: 0.82,
      SAT_RADIUS_MAX: 1,
      SAT_SIZE: 11,
      SAT_SHADE: 1,
      SAT_DEPTH_SCALE: 0.5,
      SAT_RING: 0,
    },
  },
  {
    name: 'Orbits',
    note: 'staggered radii, mild inclination spread — distinct orbital tracks',
    patch: {
      DUST_COUNT: 0,
      TILT: 32,
      TILT_SIDEWAY: 168,
      OUTER_RADIUS: 0.78,
      TRAIL: 46,
      ORBIT_SPEED: 2.6,
      SAT_TILT_SPREAD: 26,
      SAT_RADIUS_MIN: 0.45,
      SAT_RADIUS_MAX: 1,
      SAT_SIZE: 12,
      SAT_SHADE: 1,
      SAT_DEPTH_SCALE: 0.6,
      SAT_RING: 0,
    },
  },
  {
    name: 'Swarm',
    note: 'many inclinations — satellites around a planet, not a belt',
    patch: {
      DUST_COUNT: 0,
      TILT: 34,
      TILT_SIDEWAY: 150,
      OUTER_RADIUS: 0.7,
      TRAIL: 40,
      ORBIT_SPEED: 2.8,
      SAT_TILT_SPREAD: 90,
      SAT_RADIUS_MIN: 0.5,
      SAT_RADIUS_MAX: 1,
      SAT_SIZE: 10,
      SAT_SHADE: 1,
      SAT_DEPTH_SCALE: 0.5,
      SAT_RING: 0,
    },
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

export default function SatelliteLab({
  separation,
  ignition,
  initialWords,
}: {
  separation: SeparationConfig
  ignition: IgnitionConfig
  initialWords: string[]
}) {
  const [cfg, setCfg] = useState<SatelliteConfig>({ ...DEFAULT_SATELLITES })
  const [active, setActive] = useState(false)
  const [showLogo, setShowLogo] = useState(true)
  const [wordText, setWordText] = useState(
    (initialWords.length ? initialWords : FALLBACK_WORDS).join('\n'),
  )
  const [status, setStatus] = useState('loading logo…')
  const [copied, setCopied] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const chargeRef = useRef<(() => number) | null>(null)
  const onChargeSource = useCallback((get: (() => number) | null) => {
    chargeRef.current = get
  }, [])

  const words = useMemo(() => parseWords(wordText), [wordText])

  const set = useCallback(<K extends keyof SatelliteConfig>(k: K, v: SatelliteConfig[K]) => {
    setCfg((c) => ({ ...c, [k]: v }))
    setDirty(true)
  }, [])

  // Restore after mount, never during render: the server has no localStorage,
  // so seeding state from it inline would be a hydration mismatch. Merged OVER
  // the current defaults rather than replacing them, so a save taken before a
  // new knob existed still loads instead of arriving with that knob undefined.
  useEffect(() => {
    const saved = loadSaved()
    if (!saved) return
    setCfg((c) => ({ ...c, ...saved.cfg }))
    if (typeof saved.wordText === 'string') setWordText(saved.wordText)
    setSavedAt(saved.at)
    setDirty(false)
  }, [])

  const save = useCallback(() => {
    try {
      const at = Date.now()
      localStorage.setItem(STORE_KEY, JSON.stringify({ cfg, wordText, at } satisfies Saved))
      setSavedAt(at)
      setDirty(false)
    } catch (err) {
      console.error('bench: could not save', err)
      setStatus('save failed — see console')
    }
  }, [cfg, wordText])

  const clearSaved = useCallback(() => {
    localStorage.removeItem(STORE_KEY)
    setSavedAt(null)
    setDirty(false)
    setCfg({ ...DEFAULT_SATELLITES })
    setWordText((initialWords.length ? initialWords : FALLBACK_WORDS).join('\n'))
  }, [initialWords])

  // Entrance rides the real ignition cue, exactly as the hero's words do. The
  // timeout is a bench-only safety net so a disabled or failed ignition still
  // leaves something on screen to look at.
  useEffect(() => {
    if (active) return
    const t = setTimeout(() => setActive(true), 3500)
    return () => clearTimeout(t)
  }, [active])

  const replayEntrance = useCallback(() => {
    setActive(false)
    setTimeout(() => setActive(true), 60)
  }, [])

  const copyJson = useCallback(() => {
    void navigator.clipboard?.writeText(JSON.stringify(cfg, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [cfg])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStatus('⚠ reduced motion is ON — the field is static by design')
    }
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #F6F1E7)', position: 'relative' }}>
      {/* DOM order is load-bearing: the back canvas and the logo are both at
          z 0, so the logo must come LATER to paint over it. */}
      <SatelliteField words={words} config={cfg} active={active} chargeRef={chargeRef} />

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
        <strong style={{ display: 'block', marginBottom: 8 }}>SATELLITES — prototype bench</strong>
        <div style={{ marginBottom: 10, opacity: 0.75 }}>{status}</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" onClick={save} style={btn(dirty ? '#8E1114' : 'rgba(43,42,39,0.55)')}>
            {dirty ? 'save •' : 'save'}
          </button>
          <button type="button" onClick={copyJson} style={btn('rgba(43,42,39,0.55)')}>
            {copied ? 'copied' : 'copy json'}
          </button>
          <button type="button" onClick={clearSaved} style={btn('rgba(43,42,39,0.25)')}>
            reset
          </button>
        </div>
        <div style={{ marginBottom: 8, opacity: 0.7 }}>
          {dirty
            ? 'unsaved changes'
            : savedAt
              ? `saved ${new Date(savedAt).toLocaleTimeString()} — restores on reload`
              : 'saves to this browser, not the CMS'}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={replayEntrance} style={btn('rgba(43,42,39,0.35)')}>
            replay entrance
          </button>
        </div>

        <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          presets
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.note}
              onClick={() => {
                setCfg((c) => ({ ...c, ...p.patch }))
                setDirty(true)
              }}
              style={btn('rgba(43,42,39,0.35)')}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 10 }} />

        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showLogo}
            onChange={(e) => setShowLogo(e.target.checked)}
          />
          <span>show logo</span>
        </label>
        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.SAT_ENABLED}
            onChange={(e) => set('SAT_ENABLED', e.target.checked)}
          />
          <span>show satellites</span>
        </label>
        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.ORBIT_DIR < 0}
            onChange={(e) => set('ORBIT_DIR', e.target.checked ? -1 : 1)}
          />
          <span>counter-clockwise</span>
        </label>
        <label style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.HOLD_FREEZE}
            onChange={(e) => set('HOLD_FREEZE', e.target.checked)}
          />
          <span>freeze + shake on hold</span>
        </label>

        <div style={{ marginBottom: 10 }}>
          <span
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
          >
            <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              words
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {words.length} satellite{words.length === 1 ? '' : 's'}
            </span>
          </span>
          <textarea
            value={wordText}
            onChange={(e) => {
              setWordText(e.target.value)
              setDirty(true)
            }}
            spellCheck={false}
            rows={8}
            placeholder="one word per line"
            style={{
              width: '100%',
              marginTop: 3,
              font: 'inherit',
              color: 'inherit',
              background: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(43,42,39,0.25)',
              borderRadius: 3,
              padding: '4px 6px',
              resize: 'vertical',
            }}
          />
          <div style={{ opacity: 0.6, marginTop: 2 }}>
            one per line — the count follows the list
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
            <button
              type="button"
              onClick={() => {
                setWordText((initialWords.length ? initialWords : FALLBACK_WORDS).join('\n'))
                setDirty(true)
              }}
              style={btn('rgba(43,42,39,0.35)')}
            >
              reset words
            </button>
            <button
              type="button"
              onClick={() => {
                setWordText('')
                setDirty(true)
              }}
              style={btn('rgba(43,42,39,0.2)')}
            >
              clear
            </button>
          </div>
        </div>

        <label style={{ display: 'block', marginBottom: 10 }}>
          <span>Labels</span>
          <select
            value={cfg.LABEL_MODE}
            onChange={(e) => set('LABEL_MODE', e.target.value as LabelMode)}
            style={{ width: '100%', font: 'inherit', marginTop: 2 }}
          >
            <option value="hover">on hover (nearest)</option>
            <option value="always">always visible</option>
            <option value="none">hidden</option>
          </select>
        </label>

        <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          colours
        </div>
        {COLORS.map(([key, label]) => (
          <label
            key={key}
            style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}
          >
            <span>{label}</span>
            <input
              type="color"
              value={cfg[key] as string}
              onChange={(e) => set(key as 'DUST_COLOR', e.target.value)}
            />
          </label>
        ))}

        <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          per-satellite colour
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '2px 8px',
            marginBottom: 10,
          }}
        >
          {words.map((w, i) => (
            <label
              key={`${w}-${i}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              title={w}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 84,
                }}
              >
                {i + 1}. {w}
              </span>
              <input
                type="color"
                value={cfg.SAT_COLORS[i] ?? cfg.SAT_COLOR}
                onChange={(e) => {
                  const next = [...cfg.SAT_COLORS]
                  while (next.length < words.length) next.push(cfg.SAT_COLOR)
                  next[i] = e.target.value
                  set('SAT_COLORS', next)
                }}
                style={{ width: 30, height: 18, padding: 0, border: 'none', background: 'none' }}
              />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => set('SAT_COLORS', words.map(() => cfg.SAT_COLOR))}
            style={btn('rgba(43,42,39,0.35)')}
          >
            all → base
          </button>
          <button
            type="button"
            onClick={() =>
              set(
                'SAT_COLORS',
                words.map((_, i) => (i % 2 ? '#2B2A27' : '#8E1114')),
              )
            }
            style={btn('rgba(43,42,39,0.35)')}
          >
            alternate
          </button>
        </div>

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
