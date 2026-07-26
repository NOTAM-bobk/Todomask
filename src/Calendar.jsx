import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Plus, Trash2, Pencil, Check, CalendarDays } from 'lucide-react'

/**
 * Standalone full-month calendar with its own event storage.
 * Drop this file into src/ and render <CalendarView /> anywhere
 * (App.jsx already wires it up behind the "Calendar" nav item).
 */

const CAL_STORAGE_KEY = 'todoist-clone-calendar-events-v1'
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Small, Todoist-flavored color set for tagging events.
const EVENT_COLORS = {
  red:    { dot: '#db4c3f', bg: '#fdeeed', text: '#c2372b', label: 'Red' },
  orange: { dot: '#eb8909', bg: '#fef3e6', text: '#b3660a', label: 'Orange' },
  blue:   { dot: '#246fe0', bg: '#eef4fd', text: '#1d59b3', label: 'Blue' },
  green:  { dot: '#058527', bg: '#e8f7ec', text: '#046b1f', label: 'Green' },
  gray:   { dot: '#808080', bg: '#f0f0f0', text: '#5c5c5c', label: 'Gray' },
}
const COLOR_KEYS = Object.keys(EVENT_COLORS)

function pad(n) { return String(n).padStart(2, '0') }
function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function todayISO() { return toISODate(new Date()) }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)) }

function formatTime12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${period}`
}

function formatAgendaDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  if (iso === todayISO()) return 'Today'
  if (iso === toISODate(new Date(Date.now() + 86400000))) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(CAL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Migrate legacy entries (no time/color yet) so older saved data keeps working.
      const migrated = {}
      for (const [date, evs] of Object.entries(parsed)) {
        migrated[date] = (evs || []).map(e => ({
          id: e.id || uid(),
          title: e.title || '',
          time: e.time || '',
          color: EVENT_COLORS[e.color] ? e.color : 'red',
        }))
      }
      return migrated
    }
  } catch (e) { /* ignore */ }
  return {}
}

function sortDayEvents(evs) {
  return [...evs].sort((a, b) => {
    if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0
    if (a.time && !b.time) return -1
    if (!a.time && b.time) return 1
    return a.title.localeCompare(b.title)
  })
}

/** Builds a 6-week grid (42 days) for the given month, including lead/trail days. */
function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = firstOfMonth.getDay() // 0=Sun
  const gridStart = new Date(year, month, 1 - startOffset)
  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }
  return days
}

function ColorDots({ value, onChange }) {
  return (
    <div className="event-color-dots">
      {COLOR_KEYS.map(key => (
        <button
          key={key}
          type="button"
          className={`event-color-dot ${value === key ? 'selected' : ''}`}
          style={{ background: EVENT_COLORS[key].dot, width: 17, height: 17 }}
          onClick={() => onChange(key)}
          aria-label={EVENT_COLORS[key].label}
          aria-pressed={value === key}
          title={EVENT_COLORS[key].label}
        />
      ))}
    </div>
  )
}

function DayEventsPopover({ dateISO, dateLabel, events, onAdd, onDelete, onEdit, onClose }) {
  const [text, setText] = useState('')
  const [time, setTime] = useState('')
  const [color, setColor] = useState('red')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editColor, setEditColor] = useState('red')
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(dateISO, { title: trimmed, time, color })
    setText('')
    setTime('')
    setColor('red')
  }

  function startEdit(ev) {
    setEditingId(ev.id)
    setEditText(ev.title)
    setEditTime(ev.time || '')
    setEditColor(ev.color || 'red')
  }

  function saveEdit() {
    const trimmed = editText.trim()
    if (!trimmed) { setEditingId(null); return }
    onEdit(dateISO, editingId, { title: trimmed, time: editTime, color: editColor })
    setEditingId(null)
  }

  const sorted = sortDayEvents(events)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()} ref={ref}>
        <div className="modal-header">
          <h3>{dateLabel}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close" type="button"><X size={16} /></button>
        </div>
        <div className="modal-body">
          {sorted.length === 0 && (
            <div style={{ color: 'var(--text-faint)', fontSize: 13.5, marginBottom: 12 }}>No events yet.</div>
          )}

          {sorted.map(ev => (
            <div key={ev.id} className="day-event-row">
              {editingId === ev.id ? (
                <div className="event-edit-form">
                  <input
                    type="text"
                    autoFocus
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    className="event-edit-input"
                  />
                  <div className="event-edit-row2">
                    <input
                      type="time"
                      value={editTime}
                      onChange={e => setEditTime(e.target.value)}
                      className="event-time-input"
                      aria-label="Event time"
                    />
                    <ColorDots value={editColor} onChange={setEditColor} />
                    <button className="icon-btn" onClick={saveEdit} aria-label="Save event" type="button"><Check size={15} /></button>
                    <button className="icon-btn" onClick={() => setEditingId(null)} aria-label="Cancel edit" type="button"><X size={15} /></button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="event-color-mark" style={{ background: EVENT_COLORS[ev.color]?.dot }} />
                  <div className="day-event-text" onClick={() => startEdit(ev)}>
                    {ev.time && <span className="day-event-time">{formatTime12(ev.time)}</span>}
                    <span>{ev.title}</span>
                  </div>
                  <button className="icon-btn" onClick={() => startEdit(ev)} aria-label="Edit event" type="button"><Pencil size={13} /></button>
                  <button className="icon-btn danger" onClick={() => onDelete(dateISO, ev.id)} aria-label="Delete event" type="button">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}

          <div className="add-event-form">
            <input
              type="text"
              autoFocus={sorted.length === 0}
              placeholder="Add an event..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              className="event-edit-input"
            />
            <div className="event-edit-row2">
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="event-time-input"
                aria-label="Event time (optional)"
              />
              <ColorDots value={color} onChange={setColor} />
              <button className="btn primary" onClick={submit} type="button" disabled={!text.trim()}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CalendarView() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [events, setEvents] = useState(loadEvents)
  const [openDay, setOpenDay] = useState(null) // ISO date string | null
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const pickerRef = useRef(null)
  const touchX = useRef(null)

  useEffect(() => {
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(events))
  }, [events])

  useEffect(() => {
    if (!monthPickerOpen) return
    function onDoc(e) { if (pickerRef.current && !pickerRef.current.contains(e.target)) setMonthPickerOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [monthPickerOpen])

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])

  const prevMonth = useCallback(() => {
    setCursor(c => {
      const m = c.month - 1
      return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m }
    })
  }, [])
  const nextMonth = useCallback(() => {
    setCursor(c => {
      const m = c.month + 1
      return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m }
    })
  }, [])
  function goToday() {
    const now = new Date()
    setCursor({ year: now.getFullYear(), month: now.getMonth() })
  }

  function addEvent(dateISO, { title, time, color }) {
    setEvents(ev => ({
      ...ev,
      [dateISO]: [...(ev[dateISO] || []), { id: uid(), title, time: time || '', color: color || 'red' }],
    }))
  }

  function deleteEvent(dateISO, id) {
    setEvents(ev => ({
      ...ev,
      [dateISO]: (ev[dateISO] || []).filter(e => e.id !== id),
    }))
  }

  function editEvent(dateISO, id, patch) {
    setEvents(ev => ({
      ...ev,
      [dateISO]: (ev[dateISO] || []).map(e => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }

  function jumpToDate(dateISO) {
    const d = new Date(dateISO + 'T00:00:00')
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setOpenDay(dateISO)
  }

  // Keyboard nav: arrow keys change month, "t" jumps to today, Escape closes popovers.
  function handleKeyDown(e) {
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === 'ArrowLeft') prevMonth()
    else if (e.key === 'ArrowRight') nextMonth()
    else if (e.key === 'Escape') { setMonthPickerOpen(false); setOpenDay(null) }
    else if (e.key.toLowerCase() === 't') goToday()
  }

  // Swipe nav for mobile: swipe left/right across the grid to change months.
  function handleTouchStart(e) { touchX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchX.current == null) return
    const delta = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(delta) > 50) { delta > 0 ? prevMonth() : nextMonth() }
    touchX.current = null
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const today = todayISO()
  const maxVisibleEvents = 3

  const monthEventCount = useMemo(() => {
    const prefix = `${cursor.year}-${pad(cursor.month + 1)}`
    return Object.entries(events).reduce((sum, [date, evs]) => (date.startsWith(prefix) ? sum + evs.length : sum), 0)
  }, [events, cursor])

  const agendaItems = useMemo(() => {
    const items = []
    for (const [date, evs] of Object.entries(events)) {
      if (date < today) continue
      for (const ev of evs) items.push({ ...ev, date })
    }
    items.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0
      if (a.time && !b.time) return -1
      if (!a.time && b.time) return 1
      return a.title.localeCompare(b.title)
    })
    return items.slice(0, 8)
  }, [events, today])

  return (
    <div className="calendar-wrap" onKeyDown={handleKeyDown}>
      <div className="calendar-toolbar">
        <div className="calendar-nav-btns">
          <button className="icon-btn" onClick={prevMonth} aria-label="Previous month" type="button"><ChevronLeft size={18} /></button>
          <button className="icon-btn" onClick={nextMonth} aria-label="Next month" type="button"><ChevronRight size={18} /></button>
        </div>

        <div className="month-picker-anchor" ref={pickerRef}>
          <button className="calendar-month-label as-button" onClick={() => setMonthPickerOpen(o => !o)} type="button">
            {monthLabel}
          </button>
          {monthPickerOpen && (
            <div className="popover month-picker-popover">
              <div className="month-picker-year-row">
                <button className="icon-btn" onClick={() => setCursor(c => ({ ...c, year: c.year - 1 }))} aria-label="Previous year" type="button">
                  <ChevronLeft size={15} />
                </button>
                <span>{cursor.year}</span>
                <button className="icon-btn" onClick={() => setCursor(c => ({ ...c, year: c.year + 1 }))} aria-label="Next year" type="button">
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="month-picker-grid">
                {MONTH_SHORT.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    className={`month-picker-cell ${i === cursor.month ? 'selected' : ''}`}
                    onClick={() => { setCursor(c => ({ ...c, month: i })); setMonthPickerOpen(false) }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {monthEventCount > 0 && (
          <span className="calendar-event-count">{monthEventCount} event{monthEventCount === 1 ? '' : 's'}</span>
        )}

        <div className="spacer" />
        <button className="calendar-today-btn" onClick={goToday} type="button">Today</button>
      </div>

      <div className="calendar-grid" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {WEEKDAY_LABELS.map(w => <div className="calendar-weekday" key={w}>{w}</div>)}
        {days.map(d => {
          const iso = toISODate(d)
          const inMonth = d.getMonth() === cursor.month
          const dayEvents = sortDayEvents(events[iso] || [])
          return (
            <div
              key={iso}
              className={`calendar-day ${inMonth ? '' : 'outside'} ${iso === today ? 'today' : ''}`}
              onClick={() => setOpenDay(iso)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenDay(iso) } }}
              role="button"
              tabIndex={0}
              aria-label={`${d.toDateString()}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
            >
              <span className="calendar-day-num">{d.getDate()}</span>

              <div className="calendar-event-chips">
                {dayEvents.slice(0, maxVisibleEvents).map(ev => (
                  <span
                    className="calendar-event"
                    key={ev.id}
                    title={ev.time ? `${formatTime12(ev.time)} — ${ev.title}` : ev.title}
                    style={{ background: EVENT_COLORS[ev.color]?.bg, color: EVENT_COLORS[ev.color]?.text }}
                  >
                    {ev.time && <span className="calendar-event-time">{formatTime12(ev.time)}</span>}
                    {ev.title}
                  </span>
                ))}
                {dayEvents.length > maxVisibleEvents && (
                  <span className="calendar-event-more">+{dayEvents.length - maxVisibleEvents} more</span>
                )}
              </div>

              {dayEvents.length > 0 && (
                <div className="calendar-event-dots">
                  {dayEvents.slice(0, 4).map(ev => (
                    <span key={ev.id} className="calendar-event-dot" style={{ background: EVENT_COLORS[ev.color]?.dot }} />
                  ))}
                  {dayEvents.length > 4 && <span className="calendar-event-dot-more">+{dayEvents.length - 4}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="agenda-section">
        <div className="agenda-header"><CalendarDays size={14} /><span>Upcoming</span></div>
        {agendaItems.length === 0 ? (
          <div className="agenda-empty">No upcoming events. Tap a day to add one.</div>
        ) : (
          <div className="agenda-list">
            {agendaItems.map(item => (
              <button key={item.id} className="agenda-item" onClick={() => jumpToDate(item.date)} type="button">
                <span className="event-color-mark" style={{ background: EVENT_COLORS[item.color]?.dot }} />
                <span className="agenda-date">{formatAgendaDate(item.date)}</span>
                {item.time && <span className="agenda-time">{formatTime12(item.time)}</span>}
                <span className="agenda-title">{item.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {openDay && (
        <DayEventsPopover
          dateISO={openDay}
          dateLabel={new Date(openDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          events={events[openDay] || []}
          onAdd={addEvent}
          onDelete={deleteEvent}
          onEdit={editEvent}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  )
}
