import React, { useEffect, useRef, useState } from 'react'
import {
  Play, Pause, RotateCcw, SkipForward, Settings, X, Check,
  Volume2, VolumeX, Bell, BellOff, Zap, Coffee, Moon, Flame, Plus, Minus,
} from 'lucide-react'
import { registerAppSearch } from './App.jsx'

/* ============================================================
   PANDORA TIMER — a self-contained focus/break interval timer.
   No external CSS or context required: all styling lives in the
   scoped <style> block at the bottom of this file (prefixed "pt-").
   ============================================================ */

const STORAGE_KEY = 'pandora-timer-v1'

const PRESETS = [
  { id: 'classic', name: 'Classic Pomodoro', focus: 25, short: 5, long: 15, sessionsUntilLong: 4 },
  { id: 'deep', name: 'Deep Work', focus: 50, short: 10, long: 30, sessionsUntilLong: 2 },
  { id: 'quick', name: 'Quick Sprint', focus: 15, short: 3, long: 10, sessionsUntilLong: 4 },
  { id: '52-17', name: '52/17 Method', focus: 52, short: 17, long: 17, sessionsUntilLong: 1 },
]

const MODES = {
  focus: { label: 'Focus', color: '#db4c3f', icon: Zap },
  short: { label: 'Short Break', color: '#2f9e44', icon: Coffee },
  long: { label: 'Long Break', color: '#3b82f6', icon: Moon },
}

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function defaultState() {
  return {
    presetId: 'classic',
    custom: { focus: 25, short: 5, long: 15, sessionsUntilLong: 4 },
    soundOn: true,
    notifyOn: false,
    autoStartNext: true,
    completedFocusToday: 0,
    lastCompletedDate: todayISO(),
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...defaultState(), ...parsed, custom: { ...defaultState().custom, ...(parsed.custom || {}) } }
    }
  } catch {
    // ignore corrupt storage
  }
  return defaultState()
}

function getActiveSettings(state) {
  if (state.presetId === 'custom') return state.custom
  return PRESETS.find(p => p.id === state.presetId) || PRESETS[0]
}

function durationMinutes(settings, mode) {
  if (mode === 'focus') return settings.focus
  if (mode === 'short') return settings.short
  return settings.long
}

/** Plays a short two-tone chime using the Web Audio API — no audio file needed. */
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const tone = (freq, startAt, dur) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + dur + 0.05)
    }
    tone(880, 0, 0.35)
    tone(1174.66, 0.22, 0.4)
    setTimeout(() => ctx.close?.(), 1200)
  } catch {
    // audio not available — fail silently
  }
}

function notify(title, body) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted') new Notification(title, { body, silent: true })
  } catch {
    // notifications not available — fail silently
  }
}

/* ------------------------------------------------------------
   Component
   ------------------------------------------------------------ */

export default function PandoraTimer() {
  const [state, setState] = useState(loadState)
  const [mode, setMode] = useState('focus')
  const [running, setRunning] = useState(false)
  const [remainingMs, setRemainingMs] = useState(() => getActiveSettings(loadState()).focus * 60000)
  const [sessionCount, setSessionCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [notifyPermission, setNotifyPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  )

  const endAtRef = useRef(null)
  const originalTitle = useRef(typeof document !== 'undefined' ? document.title : '')

  // Refs mirror the latest state so the interval callback (subscribed once per
  // run) always reads fresh values instead of a stale closure.
  const stateRef = useRef(state)
  const modeRef = useRef(mode)
  const sessionCountRef = useRef(sessionCount)
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { sessionCountRef.current = sessionCount }, [sessionCount])

  // Persist settings + stats.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])

  // Register with global search so "start focus session" etc. surface app-wide.
  useEffect(() => {
    const unregister = registerAppSearch('pandora-timer', (query) => {
      const q = query.toLowerCase()
      const results = []
      if ('start focus session'.includes(q) || 'start timer'.includes(q) || 'focus'.startsWith(q)) {
        results.push({ id: 'pt-start-focus', label: 'Start focus session', onSelect: () => { goToMode('focus', getActiveSettings(stateRef.current), true) } })
      }
      if (running && ('pause timer'.includes(q) || 'pause'.startsWith(q))) {
        results.push({ id: 'pt-pause', label: 'Pause timer', onSelect: () => pause() })
      }
      if ('timer settings'.includes(q) || 'pandora settings'.includes(q) || 'settings'.startsWith(q)) {
        results.push({ id: 'pt-settings', label: 'Open Pandora Timer settings', onSelect: () => setShowSettings(true) })
      }
      return results
    })
    return unregister
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // Resync the displayed duration when settings change while idle.
  useEffect(() => {
    if (running) return
    const settings = getActiveSettings(state)
    setRemainingMs(durationMinutes(settings, mode) * 60000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.presetId, state.custom?.focus, state.custom?.short, state.custom?.long, mode])

  // Ticking loop — drift-free, computed from an absolute end timestamp.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (!endAtRef.current) return
      const rem = Math.max(0, endAtRef.current - Date.now())
      setRemainingMs(rem)
      if (rem <= 0) {
        clearInterval(id)
        handleComplete()
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // Reflect the countdown in the browser tab title while running.
  const totalSeconds = Math.ceil(remainingMs / 1000)
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = running ? `${formatTime(totalSeconds)} \u00b7 ${MODES[mode].label} \u2014 Pandora Timer` : originalTitle.current
  }, [running, totalSeconds, mode])
  useEffect(() => () => { if (typeof document !== 'undefined') document.title = originalTitle.current }, [])

  // Spacebar toggles play/pause, but never while typing somewhere else.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.code !== 'Space') return
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      e.preventDefault()
      running ? pause() : start()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remainingMs, mode])

  /* ---------------- Controls ---------------- */

  function start() {
    if (remainingMs <= 0) return
    endAtRef.current = Date.now() + remainingMs
    setRunning(true)
  }

  function pause() {
    if (endAtRef.current) setRemainingMs(Math.max(0, endAtRef.current - Date.now()))
    endAtRef.current = null
    setRunning(false)
  }

  function resetCurrent() {
    const settings = getActiveSettings(state)
    endAtRef.current = null
    setRunning(false)
    setRemainingMs(durationMinutes(settings, mode) * 60000)
  }

  function goToMode(newMode, settings, autoStart) {
    const mins = durationMinutes(settings, newMode)
    setMode(newMode)
    setRemainingMs(mins * 60000)
    if (autoStart) {
      endAtRef.current = Date.now() + mins * 60000
      setRunning(true)
    } else {
      endAtRef.current = null
      setRunning(false)
    }
  }

  function advance(counted) {
    const cur = modeRef.current
    const settings = getActiveSettings(stateRef.current)
    if (cur === 'focus') {
      if (counted) {
        const today = todayISO()
        setState(s => ({
          ...s,
          completedFocusToday: s.lastCompletedDate === today ? s.completedFocusToday + 1 : 1,
          lastCompletedDate: today,
        }))
      }
      const newCount = sessionCountRef.current + 1
      if (newCount >= settings.sessionsUntilLong) {
        setSessionCount(0)
        goToMode('long', settings, stateRef.current.autoStartNext)
      } else {
        setSessionCount(newCount)
        goToMode('short', settings, stateRef.current.autoStartNext)
      }
    } else {
      goToMode('focus', settings, stateRef.current.autoStartNext)
    }
  }

  function handleComplete() {
    endAtRef.current = null
    setRunning(false)
    if (stateRef.current.soundOn) playChime()
    if (stateRef.current.notifyOn) {
      notify(
        modeRef.current === 'focus' ? 'Focus session complete' : `${MODES[modeRef.current].label} complete`,
        modeRef.current === 'focus' ? 'Nice work — time for a break.' : 'Break\u2019s over. Ready when you are.'
      )
    }
    advance(true)
  }

  function skip() {
    endAtRef.current = null
    setRunning(false)
    advance(false)
  }

  function selectPreset(id) {
    setState(s => ({ ...s, presetId: id }))
  }

  function updateCustomField(field, value) {
    setState(s => {
      const base = s.presetId === 'custom' ? s.custom : getActiveSettings(s)
      return { ...s, presetId: 'custom', custom: { ...base, [field]: value } }
    })
  }

  async function enableNotifications() {
    try {
      if (!('Notification' in window)) return
      const res = await Notification.requestPermission()
      setNotifyPermission(res)
      if (res === 'granted') setState(s => ({ ...s, notifyOn: true }))
    } catch { /* ignore */ }
  }

  function resetStats() {
    if (!window.confirm('Reset today\u2019s completed session count?')) return
    setState(s => ({ ...s, completedFocusToday: 0, lastCompletedDate: todayISO() }))
  }

  /* ---------------- Derived display values ---------------- */

  const settings = getActiveSettings(state)
  const totalDurationMs = durationMinutes(settings, mode) * 60000
  const progress = totalDurationMs > 0 ? 1 - remainingMs / totalDurationMs : 0
  const modeInfo = MODES[mode]
  const ModeIcon = modeInfo.icon
  const radius = 120
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress)))
  const todayCount = state.lastCompletedDate === todayISO() ? state.completedFocusToday : 0

  return (
    <div className="pt-app">
      <div className="pt-header">
        <h1>Pandora Timer</h1>
        <button type="button" className="pt-icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
          <Settings size={18} />
        </button>
      </div>

      <div className="pt-preset-row">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`pt-chip ${state.presetId === p.id ? 'active' : ''}`}
            onClick={() => selectPreset(p.id)}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          className={`pt-chip ${state.presetId === 'custom' ? 'active' : ''}`}
          onClick={() => setShowSettings(true)}
        >
          Custom
        </button>
      </div>

      <div className="pt-mode-row">
        {Object.entries(MODES).map(([key, info]) => (
          <button
            key={key}
            type="button"
            className={`pt-mode-btn ${mode === key ? 'active' : ''}`}
            style={mode === key ? { color: info.color, borderColor: info.color, background: info.color + '14' } : undefined}
            onClick={() => { if (!running) { setMode(key); setSessionCount(0) } }}
            disabled={running}
          >
            <info.icon size={13} /> {info.label}
          </button>
        ))}
      </div>

      <div className="pt-ring-wrap">
        <svg viewBox="0 0 260 260" className="pt-ring">
          <circle cx="130" cy="130" r={radius} className="pt-ring-track" />
          <circle
            cx="130" cy="130" r={radius}
            className="pt-ring-progress"
            style={{ stroke: modeInfo.color }}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="pt-ring-center">
          <span className="pt-mode-label" style={{ color: modeInfo.color }}>
            <ModeIcon size={14} /> {modeInfo.label}
          </span>
          <span className="pt-time">{formatTime(totalSeconds)}</span>
          <div className="pt-dots">
            {Array.from({ length: settings.sessionsUntilLong }).map((_, i) => (
              <span key={i} className={`pt-dot ${i < sessionCount ? 'filled' : ''}`} style={i < sessionCount ? { background: MODES.focus.color } : undefined} />
            ))}
          </div>
        </div>
      </div>

      <div className="pt-controls">
        <button type="button" className="pt-icon-btn lg" title="Reset" onClick={resetCurrent}>
          <RotateCcw size={20} />
        </button>
        <button
          type="button"
          className="pt-play-btn"
          style={{ background: modeInfo.color }}
          onClick={running ? pause : start}
          title={running ? 'Pause (Space)' : 'Start (Space)'}
        >
          {running ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: 3 }} />}
        </button>
        <button type="button" className="pt-icon-btn lg" title="Skip to next interval" onClick={skip}>
          <SkipForward size={20} />
        </button>
      </div>

      <div className="pt-stats">
        <Flame size={15} style={{ color: todayCount > 0 ? '#db4c3f' : '#9ca3af' }} />
        <span>{todayCount} focus session{todayCount === 1 ? '' : 's'} completed today</span>
      </div>

      {showSettings && (
        <div className="pt-modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="pt-modal" onClick={e => e.stopPropagation()}>
            <div className="pt-modal-header">
              <h3>Timer settings</h3>
              <button type="button" className="pt-icon-btn" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>

            <div className="pt-modal-body">
              <div className="pt-field-label">Preset</div>
              <div className="pt-preset-row wrap">
                {PRESETS.map(p => (
                  <button key={p.id} type="button" className={`pt-chip ${state.presetId === p.id ? 'active' : ''}`} onClick={() => selectPreset(p.id)}>
                    {state.presetId === p.id && <Check size={12} />} {p.name}
                  </button>
                ))}
                <button type="button" className={`pt-chip ${state.presetId === 'custom' ? 'active' : ''}`} onClick={() => setState(s => ({ ...s, presetId: 'custom' }))}>
                  {state.presetId === 'custom' && <Check size={12} />} Custom
                </button>
              </div>

              <div className="pt-field-label" style={{ marginTop: 18 }}>Intervals (minutes)</div>
              <div className="pt-interval-grid">
                <NumberField label="Focus" value={settings.focus} min={1} max={180} onChange={v => updateCustomField('focus', v)} color={MODES.focus.color} />
                <NumberField label="Short break" value={settings.short} min={1} max={60} onChange={v => updateCustomField('short', v)} color={MODES.short.color} />
                <NumberField label="Long break" value={settings.long} min={1} max={90} onChange={v => updateCustomField('long', v)} color={MODES.long.color} />
              </div>

              <div className="pt-field-label" style={{ marginTop: 18 }}>Focus sessions before a long break</div>
              <div className="pt-stepper">
                <button type="button" className="pt-icon-btn" onClick={() => updateCustomField('sessionsUntilLong', Math.max(1, settings.sessionsUntilLong - 1))}><Minus size={15} /></button>
                <span>{settings.sessionsUntilLong}</span>
                <button type="button" className="pt-icon-btn" onClick={() => updateCustomField('sessionsUntilLong', Math.min(12, settings.sessionsUntilLong + 1))}><Plus size={15} /></button>
              </div>

              <div className="pt-toggle-row" onClick={() => setState(s => ({ ...s, autoStartNext: !s.autoStartNext }))}>
                <span>Auto-start next interval</span>
                <Toggle on={state.autoStartNext} />
              </div>

              <div className="pt-toggle-row" onClick={() => setState(s => ({ ...s, soundOn: !s.soundOn }))}>
                <span>{state.soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Sound when interval ends</span>
                <Toggle on={state.soundOn} />
              </div>

              <div className="pt-toggle-row" onClick={() => {
                if (notifyPermission !== 'granted') { enableNotifications(); return }
                setState(s => ({ ...s, notifyOn: !s.notifyOn }))
              }}>
                <span>{state.notifyOn ? <Bell size={15} /> : <BellOff size={15} />} Browser notifications</span>
                {notifyPermission === 'granted' ? <Toggle on={state.notifyOn} /> : (
                  <span className="pt-enable-link">{notifyPermission === 'denied' ? 'Blocked in browser' : 'Enable'}</span>
                )}
              </div>

              <div className="pt-modal-footer">
                <span className="pt-muted">{todayCount} focus session{todayCount === 1 ? '' : 's'} today</span>
                <button type="button" className="pt-text-btn" onClick={resetStats}>Reset today's count</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{PANDORA_TIMER_STYLES}</style>
    </div>
  )
}

/* ------------------------------------------------------------
   Small local primitives (kept in-file so this component needs
   no shared context or imports beyond icons + registerAppSearch)
   ------------------------------------------------------------ */

function NumberField({ label, value, min, max, onChange, color }) {
  return (
    <label className="pt-number-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        style={{ borderColor: color + '55' }}
        onChange={e => {
          const v = parseInt(e.target.value, 10)
          if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
      />
    </label>
  )
}

function Toggle({ on }) {
  return (
    <span className={`pt-toggle ${on ? 'on' : ''}`}>
      <span className="pt-toggle-knob" />
    </span>
  )
}

/* ------------------------------------------------------------
   Scoped styles — Todoist-inspired: clean whites, subtle greys,
   red accent, generous touch targets for mobile.
   ------------------------------------------------------------ */

const PANDORA_TIMER_STYLES = `
.pt-app {
  --pt-border: #e5e5e5;
  --pt-text: #202020;
  --pt-text-faint: #8f8f8f;
  --pt-bg-soft: #fafafa;
  max-width: 480px;
  margin: 0 auto;
  padding: 20px 16px 40px;
  font-family: inherit;
  color: var(--pt-text);
}
.pt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.pt-header h1 { font-size: 18px; font-weight: 700; margin: 0; }

.pt-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px; border: none;
  background: transparent; color: var(--pt-text-faint); cursor: pointer;
}
.pt-icon-btn:hover { background: var(--pt-bg-soft); color: var(--pt-text); }
.pt-icon-btn.lg { width: 44px; height: 44px; }

.pt-preset-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.pt-preset-row::-webkit-scrollbar { display: none; }
.pt-preset-row.wrap { flex-wrap: wrap; overflow: visible; }

.pt-chip {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;
  padding: 7px 12px; border-radius: 999px; border: 1px solid var(--pt-border);
  background: #fff; color: var(--pt-text); font-size: 13px; white-space: nowrap; cursor: pointer;
}
.pt-chip.active { background: #db4c3f; border-color: #db4c3f; color: #fff; }

.pt-mode-row { display: flex; gap: 8px; margin: 14px 0 10px; }
.pt-mode-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 6px; border-radius: 9px; border: 1px solid var(--pt-border);
  background: #fff; color: var(--pt-text-faint); font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.pt-mode-btn:disabled { cursor: default; opacity: 0.55; }

.pt-ring-wrap { position: relative; width: 100%; max-width: 280px; aspect-ratio: 1; margin: 18px auto; }
.pt-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
.pt-ring-track { fill: none; stroke: var(--pt-border); stroke-width: 12; }
.pt-ring-progress { fill: none; stroke-width: 12; stroke-linecap: round; transition: stroke-dashoffset 0.2s linear; }
.pt-ring-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; text-align: center;
}
.pt-mode-label { display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.pt-time { font-size: 46px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.pt-dots { display: flex; gap: 5px; margin-top: 2px; }
.pt-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pt-border); }
.pt-dot.filled { background: #db4c3f; }

.pt-controls { display: flex; align-items: center; justify-content: center; gap: 22px; margin: 8px 0 22px; }
.pt-play-btn {
  display: flex; align-items: center; justify-content: center;
  width: 74px; height: 74px; border-radius: 50%; border: none; color: #fff;
  cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,0.15);
}

.pt-stats {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 13px; color: var(--pt-text-faint); margin-bottom: 4px;
}

.pt-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.35);
  display: flex; align-items: flex-end; justify-content: center; z-index: 1000;
}
.pt-modal {
  background: #fff; width: 100%; max-width: 480px; max-height: 88vh;
  border-radius: 16px 16px 0 0; overflow-y: auto; padding-bottom: env(safe-area-inset-bottom, 0);
}
.pt-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px; border-bottom: 1px solid var(--pt-border); position: sticky; top: 0; background: #fff;
}
.pt-modal-header h3 { margin: 0; font-size: 16px; }
.pt-modal-body { padding: 16px; }
.pt-field-label { font-size: 12.5px; font-weight: 700; color: var(--pt-text-faint); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 8px; }

.pt-interval-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pt-number-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--pt-text-faint); }
.pt-number-field input {
  font-size: 16px; padding: 10px; border-radius: 8px; border: 1px solid var(--pt-border);
  width: 100%; box-sizing: border-box; color: var(--pt-text); font-variant-numeric: tabular-nums;
}

.pt-stepper { display: flex; align-items: center; gap: 14px; }
.pt-stepper span { font-size: 16px; font-weight: 700; min-width: 20px; text-align: center; }

.pt-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 2px; border-bottom: 1px solid var(--pt-border); cursor: pointer; font-size: 14px;
}
.pt-toggle-row span:first-child { display: flex; align-items: center; gap: 7px; }
.pt-toggle-row:last-of-type { border-bottom: none; }

.pt-toggle { width: 38px; height: 22px; border-radius: 999px; background: var(--pt-border); position: relative; flex-shrink: 0; transition: background 0.15s; }
.pt-toggle.on { background: #db4c3f; }
.pt-toggle-knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
.pt-toggle.on .pt-toggle-knob { transform: translateX(16px); }

.pt-enable-link { font-size: 12.5px; font-weight: 700; color: #db4c3f; }

.pt-modal-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--pt-border); }
.pt-muted { font-size: 12.5px; color: var(--pt-text-faint); }
.pt-text-btn { background: none; border: none; color: #db4c3f; font-size: 13px; font-weight: 600; cursor: pointer; padding: 4px; }

@media (max-width: 480px) {
  .pt-app { padding: 16px 12px 32px; }
  .pt-time { font-size: 40px; }
  .pt-play-btn { width: 68px; height: 68px; }
  .pt-controls { gap: 18px; }
}
`
