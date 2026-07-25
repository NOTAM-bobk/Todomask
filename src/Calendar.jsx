import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Plus, Trash2 } from 'lucide-react'

/**
 * Standalone full-month calendar with its own event storage.
 * Drop this file into src/ and render <CalendarView /> anywhere
 * (App.jsx already wires it up behind the "Calendar" nav item).
 */

const CAL_STORAGE_KEY = 'todoist-clone-calendar-events-v1'
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pad(n) { return String(n).padStart(2, '0') }
function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function todayISO() { return toISODate(new Date()) }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)) }

function loadEvents() {
  try {
    const raw = localStorage.getItem(CAL_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  return {}
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

function DayEventsPopover({ dateISO, dateLabel, events, onAdd, onDelete, onClose }) {
  const [text, setText] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(dateISO, trimmed)
    setText('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()} ref={ref}>
        <div className="modal-header">
          <h3>{dateLabel}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close" type="button"><X size={16} /></button>
        </div>
        <div className="modal-body">
          {events.length === 0 && (
            <div style={{ color: 'var(--text-faint)', fontSize: 13.5, marginBottom: 12 }}>No events yet.</div>
          )}
          {events.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ flex: 1, fontSize: 14 }}>{ev.title}</span>
              <button className="icon-btn danger" onClick={() => onDelete(dateISO, ev.id)} aria-label="Delete event" type="button">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <input
              type="text"
              autoFocus
              placeholder="Add an event..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, outline: 'none' }}
            />
            <button className="btn primary" onClick={submit} type="button" disabled={!text.trim()}>
              <Plus size={14} />
            </button>
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

  useEffect(() => {
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(events))
  }, [events])

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])

  function prevMonth() {
    setCursor(c => {
      const m = c.month - 1
      return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m }
    })
  }
  function nextMonth() {
    setCursor(c => {
      const m = c.month + 1
      return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m }
    })
  }
  function goToday() {
    const now = new Date()
    setCursor({ year: now.getFullYear(), month: now.getMonth() })
  }

  function addEvent(dateISO, title) {
    setEvents(ev => ({
      ...ev,
      [dateISO]: [...(ev[dateISO] || []), { id: uid(), title }],
    }))
  }

  function deleteEvent(dateISO, id) {
    setEvents(ev => ({
      ...ev,
      [dateISO]: (ev[dateISO] || []).filter(e => e.id !== id),
    }))
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const today = todayISO()
  const maxVisibleEvents = 3

  return (
    <div className="calendar-wrap">
      <div className="calendar-toolbar">
        <div className="calendar-nav-btns">
          <button className="icon-btn" onClick={prevMonth} aria-label="Previous month" type="button"><ChevronLeft size={18} /></button>
          <button className="icon-btn" onClick={nextMonth} aria-label="Next month" type="button"><ChevronRight size={18} /></button>
        </div>
        <div className="calendar-month-label">{monthLabel}</div>
        <button className="calendar-today-btn" onClick={goToday} type="button">Today</button>
      </div>

      <div className="calendar-grid">
        {WEEKDAY_LABELS.map(w => <div className="calendar-weekday" key={w}>{w}</div>)}
        {days.map(d => {
          const iso = toISODate(d)
          const inMonth = d.getMonth() === cursor.month
          const dayEvents = events[iso] || []
          return (
            <div
              key={iso}
              className={`calendar-day ${inMonth ? '' : 'outside'} ${iso === today ? 'today' : ''}`}
              onClick={() => setOpenDay(iso)}
            >
              <span className="calendar-day-num">{d.getDate()}</span>
              {dayEvents.slice(0, maxVisibleEvents).map(ev => (
                <span className="calendar-event" key={ev.id} title={ev.title}>
                  {ev.title}
                </span>
              ))}
              {dayEvents.length > maxVisibleEvents && (
                <span className="calendar-event-more">+{dayEvents.length - maxVisibleEvents} more</span>
              )}
            </div>
          )
        })}
      </div>

      {openDay && (
        <DayEventsPopover
          dateISO={openDay}
          dateLabel={new Date(openDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          events={events[openDay] || []}
          onAdd={addEvent}
          onDelete={deleteEvent}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  )
}
