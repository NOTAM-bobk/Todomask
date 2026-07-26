import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Plus, Inbox as InboxIcon, CalendarDays, CalendarRange, Hash,
  Tag, Check, Flag, ChevronDown, ChevronRight, MoreHorizontal, Trash2,
  Pencil, GripVertical, Calendar, CalendarPlus, Repeat, FolderPlus, User, Circle,
  Search, ArrowUpDown, Filter as FilterIcon, PanelLeftClose, PanelLeftOpen,
  Mail, StickyNote, ListChecks, BookOpen, Lock, Timer, Database, Eye, EyeOff, Flame,
} from 'lucide-react'
import CalendarView from './Calendar.jsx'
import AccountMenu from './AccountMenu.jsx'
import Email from './Email.jsx'
import Notes from './Notes.jsx'
import Lists from './Lists.jsx'
import Journal from './Journal.jsx'
import Passwords from './Passwords.jsx'
import PandoraTimer from './PandoraTimer.jsx'
import Storage from './Storage.jsx'

/** "My Apps" sidebar entries: each maps to its own standalone page component. */
const APPS = [
  { key: 'email', label: 'Email', icon: Mail, component: Email },
  { key: 'notes', label: 'Notes', icon: StickyNote, component: Notes },
  { key: 'lists', label: 'Lists', icon: ListChecks, component: Lists },
  { key: 'journal', label: 'Journal', icon: BookOpen, component: Journal },
  { key: 'passwords', label: 'Passwords', icon: Lock, component: Passwords },
  { key: 'pandora-timer', label: 'Pandora Timer', icon: Timer, component: PandoraTimer },
  { key: 'storage', label: 'Storage', icon: Database, component: Storage },
]

/** Registry that lets each "My Apps" page register its own search provider, so global
 *  search picks up new apps automatically without editing App.jsx again.
 *  From inside an app component (e.g. Notes.jsx), call:
 *    import { registerAppSearch } from './App.jsx'
 *    useEffect(() => registerAppSearch('notes', (query) => {
 *      return myNotes
 *        .filter(n => n.title.toLowerCase().includes(query.toLowerCase()))
 *        .map(n => ({ id: n.id, label: n.title, onSelect: () => openNote(n.id) }))
 *    }), [myNotes])
 *  The search function receives the raw query string and should return an array of
 *  { id, label, onSelect } results (onSelect is optional; falls back to opening the app). */
const appSearchRegistry = {}
export function registerAppSearch(appKey, searchFn) {
  appSearchRegistry[appKey] = searchFn
  return () => { if (appSearchRegistry[appKey] === searchFn) delete appSearchRegistry[appKey] }
}

/* ============================================================
   CONSTANTS & HELPERS
   ============================================================ */

const STORAGE_KEY = 'todoist-clone-data-v1'

const PROJECT_COLORS = [
  '#db4c3f', '#ff9933', '#fad000', '#299438', '#6accbc',
  '#158fad', '#14aaf5', '#7ecc49', '#96c3eb', '#4073ff',
  '#884dff', '#af38eb', '#eb96eb', '#e05194', '#ff8d85',
  '#808080',
]

const PRIORITIES = [
  { value: 1, label: 'Priority 1', color: 'var(--p1)' },
  { value: 2, label: 'Priority 2', color: 'var(--p2)' },
  { value: 3, label: 'Priority 3', color: 'var(--p3)' },
  { value: 4, label: 'Priority 4', color: 'var(--p4)' },
]

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)) 
}

function pad(n) { return String(n).padStart(2, '0') }

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayISO() { return toISODate(new Date()) }

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

function dateFromISO(iso) { return new Date(iso + 'T00:00:00') }

function isBeforeToday(iso) { return iso < todayISO() }

/** Given a list of ISO dates the user completed at least one task on, returns the
 *  current daily streak. If today has no activity yet, the streak still counts
 *  (using yesterday as the anchor) so it doesn't zero out the moment midnight passes —
 *  it's up to the caller to grey out the badge until today's activity lands. */
function computeStreak(activeDays) {
  const set = new Set(activeDays)
  const today = todayISO()
  let cursor = set.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (set.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

function formatDueLabel(iso) {
  if (!iso) return ''
  const t = todayISO()
  if (iso === t) return 'Today'
  const tmr = addDays(t, 1)
  if (iso === tmr) return 'Tomorrow'
  const yst = addDays(t, -1)
  if (iso === yst) return 'Yesterday'
  const d = dateFromISO(iso)
  const diffDays = Math.round((d - dateFromISO(t)) / 86400000)
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function computeNextRecurrence(iso, rule) {
  if (!rule) return iso
  const base = iso < todayISO() ? todayISO() : iso
  if (rule === 'day') return addDays(base, 1)
  if (rule === 'week') return addDays(base, 7)
  if (rule === 'month') {
    const d = dateFromISO(base)
    d.setMonth(d.getMonth() + 1)
    return toISODate(d)
  }
  if (rule === 'weekday') {
    let next = addDays(base, 1)
    while ([0, 6].includes(dateFromISO(next).getDay())) next = addDays(next, 1)
    return next
  }
  if (WEEKDAYS.includes(rule)) {
    let next = addDays(base, 1)
    while (dateFromISO(next).getDay() !== WEEKDAYS.indexOf(rule)) next = addDays(next, 1)
    return next
  }
  return addDays(base, 1)
}

function recurrenceLabel(rule) {
  if (!rule) return ''
  if (rule === 'day') return 'Every day'
  if (rule === 'week') return 'Every week'
  if (rule === 'month') return 'Every month'
  if (rule === 'weekday') return 'Every weekday'
  if (WEEKDAYS.includes(rule)) return 'Every ' + rule[0].toUpperCase() + rule.slice(1)
  return 'Recurring'
}

/** Evaluates a simple Todoist-style filter query against a task.
 *  Supports: p1-p4, today, overdue, no date, #project, @label, plain text (matches content). */
function evaluateFilterQuery(task, query, projects) {
  if (!query || !query.trim()) return true
  const conditions = query.split('&').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (conditions.length === 0) return true
  return conditions.every(cond => {
    if (/^p[1-4]$/.test(cond)) return task.priority === parseInt(cond[1], 10)
    if (cond === 'today') return !!(task.due && task.due.date === todayISO())
    if (cond === 'overdue') return !!(task.due && !task.due.recurring && isBeforeToday(task.due.date))
    if (cond === 'no date' || cond === 'nodate') return !task.due
    if (cond === 'recurring') return !!task.due?.recurring
    if (cond.startsWith('#')) {
      const name = cond.slice(1).trim()
      const project = projects.find(p => p.name.toLowerCase() === name)
      return project ? task.projectId === project.id : false
    }
    if (cond.startsWith('@')) {
      const name = cond.slice(1).trim()
      return !!task.labels?.some(l => l.toLowerCase() === name)
    }
    return task.content.toLowerCase().includes(cond)
  })
}

const SORT_OPTIONS = [
  { value: 'manual', label: 'Manual order' },
  { value: 'priority', label: 'Priority' },
  { value: 'date', label: 'Due date' },
  { value: 'name', label: 'Name' },
]

/** Returns a comparator for a given sort mode; falls back to manual drag order. */
function compareTasksBy(sortBy) {
  return (a, b) => {
    if (sortBy === 'priority') return a.priority - b.priority || a.order - b.order
    if (sortBy === 'date') {
      const ad = a.due?.date || '9999-12-31'
      const bd = b.due?.date || '9999-12-31'
      return ad.localeCompare(bd) || a.order - b.order
    }
    if (sortBy === 'name') return a.content.localeCompare(b.content) || a.order - b.order
    return a.order - b.order
  }
}

/** Parses Todoist-style quick-add syntax out of free text. */
function parseQuickAdd(raw, projects, labels) {
  let text = raw
  let priority = 4
  let projectId = null
  let labelNames = []
  let due = null

  const pMatch = text.match(/(^|\s)p([1-4])(\s|$)/i)
  if (pMatch) {
    priority = parseInt(pMatch[2], 10)
    text = text.replace(pMatch[0], ' ')
  }

  text = text.replace(/@([\w-]+)/g, (m, name) => {
    labelNames.push(name)
    return ''
  })

  const projMatch = text.match(/#([\w-]+)/)
  if (projMatch) {
    const found = projects.find(p => p.name.toLowerCase() === projMatch[1].toLowerCase())
    if (found) projectId = found.id
    text = text.replace(projMatch[0], '')
  }

  const lower = text.toLowerCase()
  let rule = null
  let dateStr = null

  const everyMatch = lower.match(/\bevery\s+(day|week|month|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (everyMatch) {
    rule = everyMatch[1]
    dateStr = computeNextRecurrence(addDays(todayISO(), -1), rule)
    text = text.replace(new RegExp(everyMatch[0], 'i'), '')
  } else if (/\btoday\b/.test(lower)) {
    dateStr = todayISO()
    text = text.replace(/\btoday\b/i, '')
  } else if (/\btomorrow\b|\btmr\b/.test(lower)) {
    dateStr = addDays(todayISO(), 1)
    text = text.replace(/\btomorrow\b|\btmr\b/i, '')
  } else if (/\bnext week\b/.test(lower)) {
    dateStr = addDays(todayISO(), 7)
    text = text.replace(/\bnext week\b/i, '')
  } else {
    const inMatch = lower.match(/\bin (\d+) days?\b/)
    if (inMatch) {
      dateStr = addDays(todayISO(), parseInt(inMatch[1], 10))
      text = text.replace(inMatch[0], '')
    } else {
      const nextDayMatch = lower.match(/\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
      if (nextDayMatch) {
        const idx = WEEKDAYS.indexOf(nextDayMatch[1])
        let d = addDays(todayISO(), 1)
        while (dateFromISO(d).getDay() !== idx) d = addDays(d, 1)
        d = addDays(d, 7)
        dateStr = d
        text = text.replace(nextDayMatch[0], '')
      } else {
        const dayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
        if (dayMatch) {
          const idx = WEEKDAYS.indexOf(dayMatch[1])
          let d = addDays(todayISO(), 1)
          while (dateFromISO(d).getDay() !== idx) d = addDays(d, 1)
          dateStr = d
          text = text.replace(dayMatch[0], '')
        }
      }
    }
  }

  // Time detection: "3pm", "3:30pm", "3:30 pm", "15:30", "noon", "midnight".
  let timeStr = null
  const afterDateLower = text.toLowerCase()
  if (/\bnoon\b/.test(afterDateLower)) {
    timeStr = '12:00'
    text = text.replace(/\bnoon\b/i, '')
  } else if (/\bmidnight\b/.test(afterDateLower)) {
    timeStr = '00:00'
    text = text.replace(/\bmidnight\b/i, '')
  } else {
    const ampmMatch = afterDateLower.match(/\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/)
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10)
      const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0
      if (ampmMatch[3] === 'pm' && h < 12) h += 12
      if (ampmMatch[3] === 'am' && h === 12) h = 0
      timeStr = `${pad(h)}:${pad(m)}`
      text = text.replace(new RegExp(ampmMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
    } else {
      const militaryMatch = afterDateLower.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/)
      if (militaryMatch) {
        const h = parseInt(militaryMatch[1], 10)
        const m = parseInt(militaryMatch[2], 10)
        timeStr = `${pad(h)}:${pad(m)}`
        text = text.replace(new RegExp(militaryMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
      }
    }
  }

  if (dateStr || timeStr) due = { date: dateStr || todayISO(), recurring: !!rule, rule, time: timeStr }

  text = text.replace(/\s{2,}/g, ' ').trim()

  return { content: text, priority, projectId, labelNames, due }
}

/** Formats a 24h "HH:MM" time string as "3:30 PM". */
function formatTimeLabel(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${pad(m)} ${period}`
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  const inboxId = uid()
  return {
    projects: [{ id: inboxId, name: 'Inbox', color: '#808080', sections: [], isInbox: true }],
    tasks: [],
    labels: [],
    labelColors: {},
    filters: [],
    streakDays: [],
  }
}

/** Tracks whether the viewport is mobile-width. Native HTML5 drag (used for manual
 *  reordering) fights with tap-to-complete on touch devices, so we use this to turn
 *  dragging off below the mobile breakpoint. */
function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= breakpoint)
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= breakpoint) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}

/* ============================================================
   SMALL UI PRIMITIVES
   ============================================================ */

function IconBtn({ icon: Icon, onClick, title, danger, size = 16, className = '' }) {
  return (
    <button className={`icon-btn ${danger ? 'danger' : ''} ${className}`} onClick={onClick} title={title} aria-label={title} type="button">
      <Icon size={size} />
    </button>
  )
}

function Popover({ children, onClose, style }) {
  const ref = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [onClose])
  return <div className="popover" ref={ref} style={style} onClick={e => e.stopPropagation()}>{children}</div>
}

/* ============================================================
   DUE DATE PICKER POPOVER
   ============================================================ */
function DueDatePicker({ value, onChange, onClose, style }) {
  const [customDate, setCustomDate] = useState(value?.date || '')
  const quick = [
    { label: 'Today', date: todayISO() },
    { label: 'Tomorrow', date: addDays(todayISO(), 1) },
    { label: 'Next week', date: addDays(todayISO(), 7) },
  ]
  const recurOpts = [
    { label: 'Every day', rule: 'day' },
    { label: 'Every weekday', rule: 'weekday' },
    { label: 'Every week', rule: 'week' },
    { label: 'Every month', rule: 'month' },
  ]
  return (
    <Popover onClose={onClose} style={{ minWidth: 230, ...style }}>
      {quick.map(q => (
        <button key={q.label} className="popover-item" onClick={() => { onChange({ date: q.date, recurring: false, rule: null }); onClose() }}>
          <Calendar size={15} /> {q.label}
        </button>
      ))}
      <div style={{ padding: '6px 8px' }}>
        <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }} />
        <button className="btn primary" style={{ width: '100%', marginTop: 6 }}
          onClick={() => { if (customDate) { onChange({ date: customDate, recurring: false, rule: null }); onClose() } }}>
          Set date
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--border-light)', margin: '6px 0' }} />
      {recurOpts.map(r => (
        <button key={r.rule} className="popover-item" onClick={() => { onChange({ date: computeNextRecurrence(addDays(todayISO(), -1), r.rule), recurring: true, rule: r.rule }); onClose() }}>
          <Repeat size={15} /> {r.label}
        </button>
      ))}
      {value && (
        <button className="popover-item" style={{ color: 'var(--red)' }} onClick={() => { onChange(null); onClose() }}>
          <X size={15} /> Remove date
        </button>
      )}
    </Popover>
  )
}

/* ============================================================
   PRIORITY PICKER POPOVER
   ============================================================ */
function PriorityPicker({ value, onChange, onClose, style }) {
  return (
    <Popover onClose={onClose} style={style}>
      {PRIORITIES.map(p => (
        <button key={p.value} className={`popover-item ${value === p.value ? 'selected' : ''}`}
          onClick={() => { onChange(p.value); onClose() }}>
          <Flag size={14} style={{ color: p.color }} /> {p.label}
        </button>
      ))}
    </Popover>
  )
}

/* ============================================================
   TASK ROW (recursive for subtasks)
   ============================================================ */
function TaskRow({
  task, allTasks, projects, labelColors = {}, depth = 0, onToggle, onDelete, onOpen,
  onUpdate, dragHandlers, isDragging, dragOverEdge,
}) {
  const [showDue, setShowDue] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [completing, setCompleting] = useState(false)

  const subtasks = allTasks.filter(t => t.parentId === task.id).sort((a, b) => a.order - b.order)
  const project = projects.find(p => p.id === task.projectId)
  const overdue = task.due && !task.due.recurring && isBeforeToday(task.due.date)
  const isToday = task.due && task.due.date === todayISO()

  function handleToggle() {
    if (task.completed) { onToggle(task); return }
    if (task.due?.recurring) { onToggle(task); return }
    setCompleting(true)
    setTimeout(() => onToggle(task), 260)
  }

  return (
    <div>
      <div
        className={`task-row ${isDragging ? 'dragging' : ''} ${dragOverEdge === 'top' ? 'drag-over-top' : ''} ${dragOverEdge === 'bottom' ? 'drag-over-bottom' : ''} ${completing ? 'completing' : ''} ${task.completed && !completing ? 'completed' : ''}`}
        style={{ paddingLeft: depth ? 0 : undefined }}
        draggable={!!dragHandlers}
        onDragStart={dragHandlers?.onDragStart}
        onDragOver={dragHandlers?.onDragOver}
        onDrop={dragHandlers?.onDrop}
        onDragEnd={dragHandlers?.onDragEnd}
      >
        {dragHandlers && (
          <span className="drag-handle"><GripVertical size={15} /></span>
        )}
        <button
          className={`checkbox ${task.priority < 4 ? 'p' + task.priority : ''} ${(completing || task.completed) ? 'checked' : ''}`}
          onClick={handleToggle}
          aria-label="Complete task"
          type="button"
        >
          {(completing || task.completed) && <Check size={12} strokeWidth={3} />}
        </button>

        <div className="task-body" onClick={() => onOpen(task)}>
          <div className="task-content">{task.content}</div>
          {(task.due || task.labels?.length > 0 || (!depth && project && !project.isInbox)) && (
            <div className="task-meta">
              {task.due && (
                <span
                  className={`meta-chip due ${overdue ? 'overdue' : isToday ? 'today' : ''}`}
                  onClick={e => { e.stopPropagation(); setShowDue(true) }}
                >
                  {task.due.recurring ? <Repeat size={12} /> : <Calendar size={12} />}
                  {task.due.recurring ? recurrenceLabel(task.due.rule) : formatDueLabel(task.due.date)}
                  {task.due.time ? ` \u00b7 ${formatTimeLabel(task.due.time)}` : ''}
                </span>
              )}
              {task.labels?.map(l => {
                const c = labelColors[l]
                return (
                  <span
                    key={l}
                    className="meta-chip label-chip"
                    style={c ? { color: c, background: c + '1f' } : undefined}
                  >
                    <Tag size={11} />{l}
                  </span>
                )
              })}
              {project && !project.isInbox && (
                <span className="meta-chip project-chip">
                  <span className="project-dot" style={{ background: project.color }} /> {project.name}
                </span>
              )}
            </div>
          )}
          {subtasks.length > 0 && (
            <button className="subtask-toggle" onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}>
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {subtasks.filter(s => !s.completed).length} of {subtasks.length} subtasks
            </button>
          )}
        </div>

        <div className="task-row-actions" style={{ position: 'relative' }}>
          <IconBtn icon={Flag} title="Priority" onClick={e => { e.stopPropagation(); setShowPriority(true) }} />
          {showPriority && (
            <PriorityPicker
              value={task.priority}
              onChange={v => onUpdate(task.id, { priority: v })}
              onClose={() => setShowPriority(false)}
              style={{ right: 0, left: 'auto', top: 32 }}
            />
          )}
          <IconBtn icon={Calendar} title="Due date" onClick={e => { e.stopPropagation(); setShowDue(true) }} />
          {showDue && (
            <DueDatePicker
              value={task.due}
              onChange={v => onUpdate(task.id, { due: v })}
              onClose={() => setShowDue(false)}
              style={{ right: 0, left: 'auto', top: 32 }}
            />
          )}
          <IconBtn icon={Trash2} title="Delete" danger onClick={e => { e.stopPropagation(); onDelete(task.id) }} />
        </div>
      </div>

      {expanded && subtasks.length > 0 && (
        <div className="subtasks">
          {subtasks.map(st => (
            <TaskRow key={st.id} task={st} allTasks={allTasks} projects={projects} labelColors={labelColors} depth={depth + 1}
              onToggle={onToggle} onDelete={onDelete} onOpen={onOpen} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   COMPLETED TASKS TOGGLE (per section / per list)
   ============================================================ */
function CompletedList({ tasks, allTasks, projects, labelColors, onToggle, onDelete, onOpen, onUpdate, open }) {
  if (!open || !tasks || tasks.length === 0) return null
  const sorted = [...tasks].sort((a, b) => a.order - b.order)
  return (
    <div className="completed-tasks">
      {sorted.map(t => (
        <TaskRow
          key={t.id}
          task={t}
          allTasks={allTasks}
          projects={projects}
          labelColors={labelColors}
          onToggle={onToggle}
          onDelete={onDelete}
          onOpen={onOpen}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  )
}

/* ============================================================
   ADD TASK FORM (inline, expandable)
   ============================================================ */
function AddTaskForm({ projects, labels = [], defaultProjectId, defaultSectionId, defaultDue, onAdd, onCancel, autoFocus }) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState(4)
  const [due, setDue] = useState(defaultDue || null)
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [pickedLabels, setPickedLabels] = useState([])
  const [showDue, setShowDue] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [showProject, setShowProject] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const taRef = useRef(null)

  useEffect(() => { if (autoFocus && taRef.current) taRef.current.focus() }, [autoFocus])

  function toggleLabel(name) {
    setPickedLabels(ls => ls.includes(name) ? ls.filter(l => l !== name) : [...ls, name])
  }

  function submit() {
    const parsed = parseQuickAdd(text, projects, [])
    const content = parsed.content || text.trim()
    if (!content) return
    const mergedLabels = [...new Set([...(parsed.labelNames || []), ...pickedLabels])]
    onAdd({
      content,
      priority: parsed.priority !== 4 ? parsed.priority : priority,
      due: parsed.due || due,
      projectId: parsed.projectId || projectId,
      sectionId: defaultSectionId || null,
      labelNames: mergedLabels,
    })
    setText('')
    setDue(defaultDue || null)
    setPriority(4)
    setPickedLabels([])
  }

  const currentProject = projects.find(p => p.id === projectId)

  return (
    <div className="add-task-form">
      <textarea
        ref={taRef}
        rows={2}
        placeholder="Task name"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="add-task-hint">Try: "Call mom tomorrow p1 @family" &middot; Enter to add, Shift+Enter for new line</div>
      <div className="add-task-form-actions" style={{ position: 'relative', flexWrap: 'wrap' }}>
        <button type="button" className={`pill-btn ${due ? 'active' : ''}`} onClick={() => setShowDue(v => !v)}>
          <Calendar size={13} /> {due ? `${due.recurring ? recurrenceLabel(due.rule) : formatDueLabel(due.date)}${due.time ? ' \u00b7 ' + formatTimeLabel(due.time) : ''}` : 'Date'}
        </button>
        {showDue && (
          <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 50 }}>
            <DueDatePicker value={due} onChange={setDue} onClose={() => setShowDue(false)} />
          </div>
        )}
        <button type="button" className={`pill-btn ${priority < 4 ? 'active' : ''}`} onClick={() => setShowPriority(v => !v)}
          style={priority < 4 ? { color: PRIORITIES[priority - 1].color, borderColor: PRIORITIES[priority - 1].color, background: 'transparent' } : {}}>
          <Flag size={13} /> {priority < 4 ? 'P' + priority : 'Priority'}
        </button>
        {showPriority && (
          <div style={{ position: 'absolute', top: 34, left: 90, zIndex: 50 }}>
            <PriorityPicker value={priority} onChange={setPriority} onClose={() => setShowPriority(false)} />
          </div>
        )}
        <button type="button" className="pill-btn" onClick={() => setShowProject(v => !v)}>
          <Hash size={13} /> {currentProject?.name || 'Project'}
        </button>
        {showProject && (
          <div style={{ position: 'absolute', top: 34, left: 180, zIndex: 50 }}>
            <Popover onClose={() => setShowProject(false)}>
              {projects.map(p => (
                <button key={p.id} className="popover-item" onClick={() => { setProjectId(p.id); setShowProject(false) }}>
                  <span className="project-dot" style={{ background: p.color }} /> {p.name}
                </button>
              ))}
            </Popover>
          </div>
        )}
        <button type="button" className={`pill-btn ${pickedLabels.length ? 'active' : ''}`} onClick={() => setShowLabels(v => !v)}>
          <Tag size={13} /> {pickedLabels.length ? pickedLabels.join(', ') : 'Labels'}
        </button>
        {showLabels && (
          <div style={{ position: 'absolute', top: 34, left: 270, zIndex: 50 }}>
            <Popover onClose={() => setShowLabels(false)}>
              {labels.length === 0 && <div className="popover-item" style={{ color: 'var(--text-faint)' }}>No labels yet</div>}
              {labels.map(l => (
                <button key={l} type="button" className="popover-item" onClick={() => toggleLabel(l)}>
                  {pickedLabels.includes(l) ? <Check size={13} /> : <Tag size={13} />} {l}
                </button>
              ))}
            </Popover>
          </div>
        )}
      </div>
      <div className="add-task-form-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={onCancel} type="button">Cancel</button>
        <button className="btn primary" onClick={submit} disabled={!text.trim()} type="button">Add task</button>
      </div>
    </div>
  )
}

/* ============================================================
   TASK DETAIL MODAL
   ============================================================ */
function TaskDetailModal({ task, projects, allTasks, onClose, onUpdate, onDelete, onAddSubtask, onToggle }) {
  const [content, setContent] = useState(task.content)
  const [labelsText, setLabelsText] = useState((task.labels || []).join(', '))
  const subtasks = allTasks.filter(t => t.parentId === task.id)
  const [addingSub, setAddingSub] = useState(false)

  function save() {
    const labels = labelsText.split(',').map(s => s.trim()).filter(Boolean)
    onUpdate(task.id, { content: content.trim() || task.content, labels })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <button className={`checkbox ${task.priority < 4 ? 'p' + task.priority : ''}`} onClick={() => onToggle(task)} style={{ marginRight: 10, marginTop: 0 }} />
          <h3>Task details</h3>
          <IconBtn icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Task name</label>
            <textarea rows={2} value={content} onChange={e => setContent(e.target.value)} />
          </div>
          <div className="field">
            <label>Project</label>
            <select value={task.projectId} onChange={e => onUpdate(task.id, { projectId: e.target.value, sectionId: null })}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <div className="priority-grid">
              {PRIORITIES.map(p => (
                <button key={p.value} type="button" className={`priority-opt ${task.priority === p.value ? 'selected' : ''}`}
                  style={{ color: p.color }} onClick={() => onUpdate(task.id, { priority: p.value })}>
                  <Flag size={14} /> P{p.value}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Due date</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="date" value={task.due?.date || ''} onChange={e => onUpdate(task.id, { due: e.target.value ? { ...task.due, date: e.target.value, recurring: false, rule: null } : null })} />
              {task.due && (
                <input type="time" value={task.due?.time || ''} onChange={e => onUpdate(task.id, { due: { ...task.due, time: e.target.value || null } })} />
              )}
              {task.due && (
                <button className="btn ghost" type="button" onClick={() => onUpdate(task.id, { due: null })}>Clear</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {['day', 'weekday', 'week', 'month'].map(rule => (
                <button key={rule} type="button" className={`toggle-chip ${task.due?.rule === rule ? 'selected' : ''}`}
                  onClick={() => onUpdate(task.id, { due: { date: computeNextRecurrence(addDays(todayISO(), -1), rule), recurring: true, rule } })}>
                  <Repeat size={12} /> {recurrenceLabel(rule)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Labels (comma separated)</label>
            <input type="text" value={labelsText} onChange={e => setLabelsText(e.target.value)} placeholder="errands, home" />
          </div>

          <div className="field">
            <label>Sub-tasks</label>
            {subtasks.map(st => (
              <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <button className={`checkbox ${st.completed ? 'checked' : ''}`} style={{ width: 16, height: 16, marginTop: 0 }} onClick={() => onToggle(st)}>
                  {st.completed && <Check size={10} strokeWidth={3} />}
                </button>
                <span style={{ fontSize: 13.5, textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? 'var(--text-faint)' : 'var(--text)' }}>{st.content}</span>
              </div>
            ))}
            {addingSub ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input type="text" autoFocus placeholder="Sub-task name"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.target.value.trim()) { onAddSubtask(task, e.target.value.trim()); e.target.value = ''; setAddingSub(false) }
                  }}
                />
                <button className="btn ghost" onClick={() => setAddingSub(false)} type="button">Done</button>
              </div>
            ) : (
              <button className="btn ghost" style={{ marginTop: 6, paddingLeft: 0 }} onClick={() => setAddingSub(true)} type="button">
                + Add sub-task
              </button>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn ghost" onClick={() => { onDelete(task.id); onClose() }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Delete task</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   PROJECT MODAL (create/edit)
   ============================================================ */
function ProjectModal({ project, onClose, onSave, onDelete }) {
  const [name, setName] = useState(project?.name || '')
  const [color, setColor] = useState(project?.color || PROJECT_COLORS[0])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="modal-header">
          <h3>{project ? 'Edit project' : 'Add project'}</h3>
          <IconBtn icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Project name" />
          </div>
          <div className="field">
            <label>Color</label>
            <div className="color-grid">
              {PROJECT_COLORS.map(c => (
                <button key={c} type="button" className={`color-swatch ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {project && !project.isInbox && (
            <button className="btn ghost" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => { onDelete(project.id); onClose() }}>Delete</button>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => { onSave({ id: project?.id, name: name.trim(), color }); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   LABEL MODAL (create/edit)
   ============================================================ */
function LabelModal({ label, existingLabels, existingColor, onClose, onSave, onDelete }) {
  const [name, setName] = useState(label || '')
  const [color, setColor] = useState(existingColor || PROJECT_COLORS[0])
  const trimmed = name.trim()
  const conflict = trimmed && trimmed !== label && existingLabels.includes(trimmed)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <h3>{label ? 'Edit label' : 'Add label'}</h3>
          <IconBtn icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="label-name" />
            {conflict && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>A label with that name already exists.</div>}
          </div>
          <div className="field">
            <label>Color</label>
            <div className="color-grid">
              {PROJECT_COLORS.map(c => (
                <button key={c} type="button" className={`color-swatch ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {label && (
            <button className="btn ghost" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => { onDelete(label); onClose() }}>Delete</button>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!trimmed || conflict} onClick={() => { onSave(label || null, trimmed, color); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   FILTER MODAL (create/edit saved filters)
   ============================================================ */
function FilterModal({ filter, onClose, onSave, onDelete }) {
  const [name, setName] = useState(filter?.name || '')
  const [query, setQuery] = useState(filter?.query || '')
  const [color, setColor] = useState(filter?.color || PROJECT_COLORS[0])
  const trimmedName = name.trim()
  const trimmedQuery = query.trim()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>{filter ? 'Edit filter' : 'Add filter'}</h3>
          <IconBtn icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Filter name" />
          </div>
          <div className="field">
            <label>Query</label>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="p1 & today" />
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.5 }}>
              Combine conditions with "&amp;". Supports <code>p1</code>-<code>p4</code>, <code>today</code>, <code>overdue</code>, <code>no date</code>, <code>recurring</code>, <code>#project</code>, <code>@label</code>, or plain text to match task names.
            </div>
          </div>
          <div className="field">
            <label>Color</label>
            <div className="color-grid">
              {PROJECT_COLORS.map(c => (
                <button key={c} type="button" className={`color-swatch ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {filter && (
            <button className="btn ghost" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => { onDelete(filter.id); onClose() }}>Delete</button>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!trimmedName || !trimmedQuery}
            onClick={() => { onSave({ id: filter?.id, name: trimmedName, query: trimmedQuery, color }); onClose() }}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   SORT MENU
   ============================================================ */
function SortMenu({ value, onChange, onClose }) {
  return (
    <Popover onClose={onClose} style={{ right: 0, left: 'auto', top: 32 }}>
      {SORT_OPTIONS.map(o => (
        <button key={o.value} className={`popover-item ${value === o.value ? 'selected' : ''}`}
          onClick={() => { onChange(o.value); onClose() }}>
          {o.label}
        </button>
      ))}
    </Popover>
  )
}

function ShowCompletedButton({ value, onChange }) {
  return (
    <button type="button" className={`pill-btn ${value ? 'active' : ''}`} onClick={() => onChange(!value)}>
      {value ? <EyeOff size={13} /> : <Eye size={13} />} {value ? 'Hide completed' : 'Show completed'}
    </button>
  )
}

function SortMenuButton({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const current = SORT_OPTIONS.find(o => o.value === value)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className={`pill-btn ${value !== 'manual' ? 'active' : ''}`} onClick={() => setOpen(v => !v)}>
        <ArrowUpDown size={13} /> {value === 'manual' ? 'Sort' : current?.label}
      </button>
      {open && <SortMenu value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}

/* ============================================================
   SEARCH MODAL (popup with live results)
   ============================================================ */
function SearchModal({ tasks, projects, labelColors, onOpenTask, onGoTo, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const trimmed = query.trim()
  const lower = trimmed.toLowerCase()

  let results = []
  if (trimmed) {
    if (lower.startsWith('#')) {
      const term = lower.slice(1)
      results = tasks.filter(t => {
        const p = projects.find(pr => pr.id === t.projectId)
        return p && p.name.toLowerCase().includes(term)
      })
    } else if (lower.startsWith('@')) {
      const term = lower.slice(1)
      results = tasks.filter(t => t.labels?.some(l => l.toLowerCase().includes(term)))
    } else {
      results = tasks.filter(t => t.content.toLowerCase().includes(lower))
    }
  }

  // Navigation targets: core views plus every "My Apps" page, so search can jump to any of them.
  const navItems = [
    { icon: InboxIcon, label: 'Go to Inbox', action: () => onGoTo({ type: 'inbox' }) },
    { icon: CalendarDays, label: 'Go to Today', action: () => onGoTo({ type: 'today' }) },
    { icon: CalendarRange, label: 'Go to Upcoming', action: () => onGoTo({ type: 'upcoming' }) },
    { icon: CalendarPlus, label: 'Go to Calendar', action: () => onGoTo({ type: 'calendar' }) },
    ...APPS.map(app => ({ icon: app.icon, label: 'Go to ' + app.label, action: () => onGoTo({ type: 'app', id: app.key }) })),
  ]
  const matchedNavItems = trimmed ? navItems.filter(n => n.label.toLowerCase().includes(lower)) : navItems

  // Content results from any app that has registered a search provider (see registerAppSearch
  // above) — new apps show up here automatically once they self-register, no edits needed here.
  let appResults = []
  if (trimmed) {
    for (const app of APPS) {
      const searchFn = appSearchRegistry[app.key]
      if (!searchFn) continue
      try {
        const hits = searchFn(trimmed) || []
        hits.forEach(h => appResults.push({ ...h, appKey: app.key, appLabel: app.label, appIcon: app.icon }))
      } catch (err) {
        console.error(`Search provider for "${app.key}" failed:`, err)
      }
    }
  }

  return (
    <div className="modal-backdrop search-backdrop" onClick={onClose}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tasks, #project, @label..."
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          />
          {query && <IconBtn icon={X} title="Clear" onClick={() => setQuery('')} />}
        </div>

        {!trimmed ? (
          <div className="search-section">
            <div className="search-section-label">Navigation</div>
            {navItems.map(n => (
              <button key={n.label} type="button" className="search-result-item" onClick={() => { n.action(); onClose() }}>
                <n.icon size={15} /> {n.label}
              </button>
            ))}
          </div>
        ) : (
          <>
            {matchedNavItems.length > 0 && (
              <div className="search-section">
                <div className="search-section-label">Go to</div>
                {matchedNavItems.map(n => (
                  <button key={n.label} type="button" className="search-result-item" onClick={() => { n.action(); onClose() }}>
                    <n.icon size={15} /> {n.label}
                  </button>
                ))}
              </div>
            )}
            <div className="search-section">
              <div className="search-section-label">{results.length} task result{results.length !== 1 ? 's' : ''}</div>
              {results.length === 0 && <div className="search-empty">No matching tasks.</div>}
              {results.slice(0, 40).map(t => {
                const project = projects.find(p => p.id === t.projectId)
                return (
                  <button key={t.id} type="button" className="search-result-item" onClick={() => { onOpenTask(t); onClose() }}>
                    <span className={`search-result-check ${t.completed ? 'checked' : ''}`}>
                      {t.completed && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="search-result-text" style={{ textDecoration: t.completed ? 'line-through' : 'none' }}>
                      {t.content}
                    </span>
                    {t.labels?.slice(0, 2).map(l => (
                      <span key={l} className="meta-chip label-chip" style={labelColors[l] ? { color: labelColors[l], background: labelColors[l] + '1f' } : undefined}>
                        <Tag size={10} />{l}
                      </span>
                    ))}
                    {project && <span className="search-result-meta">{project.name}</span>}
                  </button>
                )
              })}
            </div>
            {appResults.length > 0 && (
              <div className="search-section">
                <div className="search-section-label">{appResults.length} result{appResults.length !== 1 ? 's' : ''} in apps</div>
                {appResults.slice(0, 40).map((r, i) => (
                  <button key={r.id ?? i} type="button" className="search-result-item"
                    onClick={() => { r.onSelect ? r.onSelect() : onGoTo({ type: 'app', id: r.appKey }); onClose() }}>
                    <r.appIcon size={15} />
                    <span className="search-result-text">{r.label}</span>
                    <span className="search-result-meta">{r.appLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   EMPTY STATE
   ============================================================ */
const EMPTY_STATE_MESSAGES = [
  { title: 'All clear!', body: "Your list is emptier than a gym on New Year's Day, week three." },
  { title: 'Nothing to do here', body: "Suspiciously peaceful. Enjoy it, or go stir something up." },
  { title: 'Look at that', body: "You've out-organized yourself. There's nothing left to check off." },
  { title: 'Blissfully empty', body: "No tasks, no chaos, no problem. Add one whenever you're ready." },
]

function EmptyState({ onAdd }) {
  const [msg] = useState(() => EMPTY_STATE_MESSAGES[Math.floor(Math.random() * EMPTY_STATE_MESSAGES.length)])
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Check size={22} /></div>
      <h4>{msg.title}</h4>
      <p>{msg.body}</p>
      <button type="button" className="btn primary empty-state-btn" onClick={onAdd}>
        <Plus size={15} /> Add a task
      </button>
    </div>
  )
}

/* ============================================================
   TASK LIST (handles drag & drop reorder + sections)
   ============================================================ */
function TaskListView({
  tasks, allTasks, projects, labelColors, labels = [], completedTasks = [], sortBy = 'manual', sections, showSections, showAddPerSection,
  showCompleted,
  onToggle, onDelete, onOpen, onUpdate, onReorder, onAddSection,
  addFormDefaults, onAddTask,
}) {
  const [dragId, setDragId] = useState(null)
  const [overInfo, setOverInfo] = useState(null) // {id, edge}
  const [openAddFor, setOpenAddFor] = useState(null) // sectionId or 'root' or null
  const isMobile = useIsMobile()

  function makeDragHandlers(task) {
    return {
      onDragStart: (e) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move' },
      onDragOver: (e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const edge = (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom'
        setOverInfo({ id: task.id, edge })
      },
      onDrop: (e) => {
        e.preventDefault()
        if (dragId && dragId !== task.id) onReorder(dragId, task.id, overInfo?.edge || 'top', task.sectionId ?? null)
        setDragId(null); setOverInfo(null)
      },
      onDragEnd: () => { setDragId(null); setOverInfo(null) },
    }
  }

  function renderTasks(list) {
    return list.filter(t => !t.parentId).sort(compareTasksBy(sortBy)).map(t => (
      <TaskRow
        key={t.id}
        task={t}
        allTasks={allTasks}
        projects={projects}
        labelColors={labelColors}
        onToggle={onToggle}
        onDelete={onDelete}
        onOpen={onOpen}
        onUpdate={onUpdate}
        dragHandlers={sortBy === 'manual' && !isMobile ? makeDragHandlers(t) : undefined}
        isDragging={dragId === t.id}
        dragOverEdge={overInfo?.id === t.id ? overInfo.edge : null}
      />
    ))
  }

  if (!showSections) {
    const isEmpty = tasks.length === 0 && completedTasks.length === 0
    return (
      <div className="section-block">
        {isEmpty && (
          <EmptyState onAdd={() => setOpenAddFor('root')} />
        )}
        {renderTasks(tasks)}
        <CompletedList
          tasks={completedTasks}
          allTasks={allTasks}
          projects={projects}
          labelColors={labelColors}
          onToggle={onToggle}
          onDelete={onDelete}
          onOpen={onOpen}
          onUpdate={onUpdate}
          open={showCompleted}
        />
        {(!isEmpty || openAddFor === 'root') && (
          <div className="add-task-inline" style={isEmpty ? { marginTop: 14 } : undefined}>
            {openAddFor === 'root' ? (
              <AddTaskForm
                projects={projects}
                labels={labels}
                defaultProjectId={addFormDefaults.projectId}
                defaultDue={addFormDefaults.due}
                autoFocus
                onAdd={(data) => { onAddTask({ ...data, sectionId: null }); }}
                onCancel={() => setOpenAddFor(null)}
              />
            ) : (
              <button className="add-task-trigger" onClick={() => setOpenAddFor('root')}>
                <Plus size={16} /> Add task
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const unsectioned = tasks.filter(t => !t.sectionId)
  const completedUnsectioned = completedTasks.filter(t => !t.sectionId)
  const totallyEmpty = sections.length === 0 && unsectioned.length === 0 && completedUnsectioned.length === 0

  return (
    <div>
      {totallyEmpty && <EmptyState onAdd={() => setOpenAddFor('root')} />}
      {(unsectioned.length > 0 || completedUnsectioned.length > 0) && (
        <div className="section-block">
          {renderTasks(unsectioned)}
          <CompletedList
            tasks={completedUnsectioned}
            allTasks={allTasks}
            projects={projects}
            labelColors={labelColors}
            onToggle={onToggle}
            onDelete={onDelete}
            onOpen={onOpen}
            onUpdate={onUpdate}
            open={showCompleted}
          />
        </div>
      )}
      {(!totallyEmpty || openAddFor === 'root') && (
        <div className="add-task-inline" style={{ marginBottom: 8, ...(totallyEmpty ? { marginTop: 14 } : {}) }}>
          {openAddFor === 'root' ? (
            <AddTaskForm projects={projects} labels={labels} defaultProjectId={addFormDefaults.projectId} autoFocus
              onAdd={(data) => onAddTask({ ...data, sectionId: null })} onCancel={() => setOpenAddFor(null)} />
          ) : (
            <button className="add-task-trigger" onClick={() => setOpenAddFor('root')}><Plus size={16} /> Add task</button>
          )}
        </div>
      )}

      {sections.map(sec => {
        const secTasks = tasks.filter(t => t.sectionId === sec.id)
        const secCompleted = completedTasks.filter(t => t.sectionId === sec.id)
        return (
          <div className="section-block" key={sec.id}>
            <div className="section-title-row">
              <span className="section-title">{sec.name}</span>
              <span className="section-count">{secTasks.filter(t => !t.completed).length}</span>
            </div>
            {secTasks.length === 0 && secCompleted.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '4px 4px 8px' }}>No tasks</div>}
            {renderTasks(secTasks)}
            <CompletedList
              tasks={secCompleted}
              allTasks={allTasks}
              projects={projects}
              labelColors={labelColors}
              onToggle={onToggle}
              onDelete={onDelete}
              onOpen={onOpen}
              onUpdate={onUpdate}
              open={showCompleted}
            />
            <div className="add-task-inline">
              {openAddFor === sec.id ? (
                <AddTaskForm projects={projects} labels={labels} defaultProjectId={addFormDefaults.projectId} defaultSectionId={sec.id} autoFocus
                  onAdd={(data) => onAddTask({ ...data, sectionId: sec.id })} onCancel={() => setOpenAddFor(null)} />
              ) : (
                <button className="add-task-trigger" onClick={() => setOpenAddFor(sec.id)}><Plus size={16} /> Add task</button>
              )}
            </div>
          </div>
        )
      })}

      <button className="add-task-trigger" style={{ marginTop: 10, color: 'var(--text-secondary)' }} onClick={() => {
        const name = prompt('Section name')
        if (name && name.trim()) onAddSection(name.trim())
      }}>
        <Plus size={16} /> Add section
      </button>
    </div>
  )
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function Sidebar({
  projects, view, setView, onAddTaskClick, onAddProject, onEditProject, onDeleteProject,
  counts, open, onToggle, labels, labelColors = {}, onAddLabel, onEditLabel,
  onSearchClick, streakCount = 0, streakToday = false,
}) {
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [appsOpen, setAppsOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar-apps-open')
      return saved === null ? true : saved === 'true'
    } catch {
      return true
    }
  })
  const [listsOpen, setListsOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('sidebar-apps-open', String(appsOpen)) } catch {}
  }, [appsOpen])

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={onToggle} />
      <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
        <div className="sidebar-header" style={{ position: 'relative' }} onClick={() => setShowAccountMenu(v => !v)}>
          <div className="avatar"><User size={15} /></div>
          <div className="workspace-name">My Todoist</div>
          <ChevronDown size={14} className="account-caret" />
          {showAccountMenu && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 60 }}>
              <AccountMenu onClose={() => setShowAccountMenu(false)} />
            </div>
          )}
        </div>

        <button className="add-task-row" onClick={onAddTaskClick}>
          <Plus size={19} /> Add task
        </button>

        <div className="nav-list">
          <button className={`nav-item ${view.type === 'search' ? 'active' : ''}`} onClick={onSearchClick}>
            <span className="nav-icon"><Search size={17} /></span>
            <span className="nav-label">Search</span>
          </button>
          <button className={`nav-item ${view.type === 'inbox' ? 'active' : ''}`} onClick={() => setView({ type: 'inbox' })}>
            <span className="nav-icon"><InboxIcon size={17} /></span>
            <span className="nav-label">Inbox</span>
            {counts.inbox > 0 && <span className="count">{counts.inbox}</span>}
          </button>
          <button className={`nav-item ${view.type === 'today' ? 'active' : ''}`} onClick={() => setView({ type: 'today' })}>
            <span className="nav-icon"><CalendarDays size={17} /></span>
            <span className="nav-label">Today</span>
            {counts.today > 0 && <span className="count">{counts.today}</span>}
          </button>
          <button className={`nav-item ${view.type === 'upcoming' ? 'active' : ''}`} onClick={() => setView({ type: 'upcoming' })}>
            <span className="nav-icon"><CalendarRange size={17} /></span>
            <span className="nav-label">Upcoming</span>
          </button>
          <button className={`nav-item ${view.type === 'calendar' ? 'active' : ''}`} onClick={() => setView({ type: 'calendar' })}>
            <span className="nav-icon"><CalendarPlus size={17} /></span>
            <span className="nav-label">Calendar</span>
          </button>
        </div>

        <div className="sidebar-section apps-section">
          <button type="button" className="nav-item apps-toggle" onClick={() => setAppsOpen(v => !v)}>
            <span className="nav-icon">{appsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
            <span className="nav-label">My Apps</span>
          </button>
          {appsOpen && (
            <div className="nav-list nav-sub-list">
              {APPS.map(app => (
                app.key === 'lists' ? (
                  <div key={app.key}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <button className={`nav-item ${view.type === 'app' && view.id === app.key ? 'active' : ''}`} style={{ flex: 1 }}
                        onClick={() => setView({ type: 'app', id: app.key })}>
                        <span className="nav-icon"><app.icon size={17} /></span>
                        <span className="nav-label">{app.label}</span>
                      </button>
                      <IconBtn
                        icon={listsOpen ? ChevronDown : ChevronRight}
                        title={listsOpen ? 'Collapse lists' : 'Expand lists'}
                        size={13}
                        onClick={(e) => { e.stopPropagation(); setListsOpen(v => !v) }}
                      />
                    </div>
                    {listsOpen && (
                      <div className="nav-sub-list">
                        <div className="nav-sub-empty">No lists yet</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button key={app.key} className={`nav-item ${view.type === 'app' && view.id === app.key ? 'active' : ''}`}
                    onClick={() => setView({ type: 'app', id: app.key })}>
                    <span className="nav-icon"><app.icon size={17} /></span>
                    <span className="nav-label">{app.label}</span>
                  </button>
                )
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span>Projects</span>
            <button className="add-mini" onClick={onAddProject} title="Add project"><Plus size={15} /></button>
          </div>
          <div className="nav-list">
            {projects.filter(p => !p.isInbox).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button className={`nav-item ${view.type === 'project' && view.id === p.id ? 'active' : ''}`} style={{ flex: 1 }}
                  onClick={() => setView({ type: 'project', id: p.id })}>
                  <span className="nav-icon"><span className="project-dot" style={{ background: p.color }} /></span>
                  <span className="nav-label">{p.name}</span>
                  {counts.byProject[p.id] > 0 && <span className="count">{counts.byProject[p.id]}</span>}
                </button>
                <IconBtn icon={Pencil} title="Edit project" size={13} onClick={() => onEditProject(p)} />
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span>Labels</span>
            <button className="add-mini" onClick={onAddLabel} title="Add label"><Plus size={15} /></button>
          </div>
          {labels.length > 0 && (
            <div className="nav-list">
              {labels.map(l => (
                <div key={l} style={{ display: 'flex', alignItems: 'center' }}>
                  <button className={`nav-item ${view.type === 'label' && view.id === l ? 'active' : ''}`} style={{ flex: 1 }}
                    onClick={() => setView({ type: 'label', id: l })}>
                    <span className="nav-icon"><Tag size={17} style={labelColors[l] ? { color: labelColors[l] } : undefined} /></span>
                    <span className="nav-label">{l}</span>
                  </button>
                  <IconBtn icon={Pencil} title="Edit label" size={13} onClick={() => onEditLabel(l)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className={`sidebar-streak ${streakToday ? 'active' : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', margin: '8px 6px 4px',
            borderTop: '1px solid var(--border, #e5e5e5)',
            paddingTop: 14,
          }}
          title={streakToday
            ? `${streakCount} day streak \u2014 today's task is done, keep it going!`
            : `${streakCount} day streak \u2014 complete a task today to keep it alive`}
        >
          <Flame
            size={18}
            style={{ color: streakToday ? 'var(--red, #db4c3f)' : 'var(--text-faint, #9ca3af)', flexShrink: 0 }}
            fill={streakToday ? 'var(--red, #db4c3f)' : 'none'}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: streakToday ? 'var(--red, #db4c3f)' : 'var(--text-faint, #9ca3af)' }}>
            {streakCount}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-faint, #9ca3af)' }}>
            day streak
          </span>
        </div>
      </aside>
    </>
  )
}

/* ============================================================
   ROOT APP
   ============================================================ */
export default function App() {
  const [data, setData] = useState(loadData)
  const [view, setView] = useState({ type: 'inbox' })
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 860)
  const [openTask, setOpenTask] = useState(null)
  const [projectModal, setProjectModal] = useState(null) // {mode:'new'|'edit', project}
  const [labelModal, setLabelModal] = useState(null) // {label} | 'new' | null
  const [filterModal, setFilterModal] = useState(null) // {filter} | {filter: null} | null
  const [mobileAddOpen, setMobileAddOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sortBy, setSortBy] = useState('date')
  const [showCompleted, setShowCompleted] = useState(false)
  const [toast, setToast] = useState(null) // {message, onUndo}
  const toastTimer = useRef(null)

  function showToast(message, onUndo) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, onUndo })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const { projects, tasks, labels } = data
  const labelColors = data.labelColors || {}
  const filters = data.filters || []
  const streakDays = data.streakDays || []
  const streakCount = computeStreak(streakDays)
  const streakToday = streakDays.includes(todayISO())

  function updateTasks(fn) {
    setData(d => ({ ...d, tasks: fn(d.tasks) }))
  }

  function addTask({ content, priority, due, projectId, sectionId, labelNames }) {
    const newLabels = (labelNames || []).filter(l => !labels.includes(l))
    setData(d => {
      const siblingOrders = d.tasks.filter(t => t.projectId === (projectId || d.projects[0].id) && t.sectionId === (sectionId || null) && !t.parentId).map(t => t.order)
      const order = siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0
      const task = {
        id: uid(),
        content,
        projectId: projectId || d.projects.find(p => p.isInbox).id,
        sectionId: sectionId || null,
        parentId: null,
        completed: false,
        priority: priority || 4,
        due: due || null,
        labels: labelNames || [],
        order,
      }
      return { ...d, tasks: [...d.tasks, task], labels: [...d.labels, ...newLabels] }
    })
  }

  function addSubtask(parent, content) {
    setData(d => {
      const siblingOrders = d.tasks.filter(t => t.parentId === parent.id).map(t => t.order)
      const order = siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0
      const task = {
        id: uid(), content, projectId: parent.projectId, sectionId: parent.sectionId,
        parentId: parent.id, completed: false, priority: 4, due: null, labels: [], order,
      }
      return { ...d, tasks: [...d.tasks, task] }
    })
  }

  function toggleTask(task) {
    if (task.due?.recurring) {
      updateTasks(ts => ts.map(t => t.id === task.id ? { ...t, due: { ...t.due, date: computeNextRecurrence(t.due.date, t.due.rule) } } : t))
      return
    }
    const willComplete = !task.completed
    setData(d => ({
      ...d,
      tasks: d.tasks.map(t => t.id === task.id ? { ...t, completed: willComplete } : t),
      streakDays: willComplete && !(d.streakDays || []).includes(todayISO())
        ? [...(d.streakDays || []), todayISO()]
        : (d.streakDays || []),
    }))
    if (willComplete) {
      showToast('Task completed', () => {
        updateTasks(ts => ts.map(t => t.id === task.id ? { ...t, completed: false } : t))
      })
    }
  }

  function deleteTask(id) {
    updateTasks(ts => ts.filter(t => t.id !== id && t.parentId !== id))
    setOpenTask(null)
  }

  function updateTask(id, patch) {
    updateTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))
    setData(d => {
      if (patch.labels) {
        const newLabels = patch.labels.filter(l => !d.labels.includes(l))
        if (newLabels.length) return { ...d, labels: [...d.labels, ...newLabels] }
      }
      return d
    })
  }

  function reorderTasks(dragId, targetId, edge, targetSectionId) {
    updateTasks(ts => {
      const dragTask = ts.find(t => t.id === dragId)
      const targetTask = ts.find(t => t.id === targetId)
      if (!dragTask || !targetTask) return ts
      const moved = { ...dragTask, projectId: targetTask.projectId, sectionId: targetSectionId }
      const rest = ts.filter(t => t.id !== dragId)
      const siblings = rest.filter(t => t.projectId === targetTask.projectId && t.sectionId === targetSectionId && !t.parentId).sort((a, b) => a.order - b.order)
      const others = rest.filter(t => !(t.projectId === targetTask.projectId && t.sectionId === targetSectionId && !t.parentId))
      const targetIdx = siblings.findIndex(t => t.id === targetId)
      const insertAt = edge === 'top' ? targetIdx : targetIdx + 1
      siblings.splice(insertAt, 0, moved)
      const reOrdered = siblings.map((t, i) => ({ ...t, order: i }))
      return [...others, ...reOrdered]
    })
  }

  function addProject({ id, name, color }) {
    setData(d => {
      if (id) return { ...d, projects: d.projects.map(p => p.id === id ? { ...p, name, color } : p) }
      return { ...d, projects: [...d.projects, { id: uid(), name, color, sections: [] }] }
    })
  }

  function deleteProject(id) {
    setData(d => ({
      ...d,
      projects: d.projects.filter(p => p.id !== id),
      tasks: d.tasks.filter(t => t.projectId !== id),
    }))
    if (view.type === 'project' && view.id === id) setView({ type: 'inbox' })
  }

  function addSection(projectId, name) {
    setData(d => ({
      ...d,
      projects: d.projects.map(p => p.id === projectId ? { ...p, sections: [...p.sections, { id: uid(), name }] } : p),
    }))
  }

  function saveLabel(oldName, newName, color) {
    setData(d => {
      const prevColors = d.labelColors || {}
      if (oldName) {
        // renaming an existing label: update the label list, its color, and every task referencing it
        const { [oldName]: _old, ...restColors } = prevColors
        return {
          ...d,
          labels: d.labels.map(l => l === oldName ? newName : l),
          labelColors: { ...restColors, [newName]: color || prevColors[oldName] },
          tasks: d.tasks.map(t => t.labels?.includes(oldName)
            ? { ...t, labels: t.labels.map(l => l === oldName ? newName : l) }
            : t),
        }
      }
      if (d.labels.includes(newName)) return d
      return { ...d, labels: [...d.labels, newName], labelColors: { ...prevColors, [newName]: color } }
    })
    if (oldName && view.type === 'label' && view.id === oldName) setView({ type: 'label', id: newName })
  }

  function deleteLabel(name) {
    setData(d => {
      const prevColors = d.labelColors || {}
      const { [name]: _removed, ...restColors } = prevColors
      return {
        ...d,
        labels: d.labels.filter(l => l !== name),
        labelColors: restColors,
        tasks: d.tasks.map(t => t.labels?.includes(name) ? { ...t, labels: t.labels.filter(l => l !== name) } : t),
      }
    })
    if (view.type === 'label' && view.id === name) setView({ type: 'inbox' })
  }

  function saveFilter({ id, name, query, color }) {
    setData(d => {
      const existing = d.filters || []
      if (id) return { ...d, filters: existing.map(f => f.id === id ? { ...f, name, query, color } : f) }
      return { ...d, filters: [...existing, { id: uid(), name, query, color }] }
    })
  }

  function deleteFilterFn(id) {
    setData(d => ({ ...d, filters: (d.filters || []).filter(f => f.id !== id) }))
    if (view.type === 'filter' && view.id === id) setView({ type: 'inbox' })
  }

  const inbox = projects.find(p => p.isInbox)

  const counts = useMemo(() => {
    const byProject = {}
    projects.forEach(p => { byProject[p.id] = tasks.filter(t => t.projectId === p.id && !t.completed && !t.parentId).length })
    return {
      inbox: byProject[inbox?.id] || 0,
      today: tasks.filter(t => !t.completed && t.due && t.due.date <= todayISO()).length,
      byProject,
    }
  }, [tasks, projects, inbox])

  const activeProject = view.type === 'project' ? projects.find(p => p.id === view.id) : null

  let viewTasks = []
  let completedViewTasks = []
  let title = ''
  let showSections = false
  let addDefaults = { projectId: inbox?.id, due: null }

  if (view.type === 'inbox') {
    viewTasks = tasks.filter(t => t.projectId === inbox?.id && !t.completed)
    completedViewTasks = tasks.filter(t => t.projectId === inbox?.id && t.completed && !t.parentId)
    title = 'Inbox'
    addDefaults = { projectId: inbox?.id, due: null }
  } else if (view.type === 'today') {
    viewTasks = tasks.filter(t => !t.completed && t.due && t.due.date <= todayISO())
    completedViewTasks = tasks.filter(t => t.completed && !t.parentId && t.due && t.due.date <= todayISO())
    title = 'Today'
    addDefaults = { projectId: inbox?.id, due: { date: todayISO(), recurring: false, rule: null } }
  } else if (view.type === 'project') {
    viewTasks = tasks.filter(t => t.projectId === view.id && !t.completed)
    completedViewTasks = tasks.filter(t => t.projectId === view.id && t.completed && !t.parentId)
    title = activeProject?.name || ''
    showSections = true
    addDefaults = { projectId: view.id, due: null }
  } else if (view.type === 'label') {
    viewTasks = tasks.filter(t => !t.completed && t.labels?.includes(view.id))
    completedViewTasks = tasks.filter(t => t.completed && !t.parentId && t.labels?.includes(view.id))
    title = '@' + view.id
    addDefaults = { projectId: inbox?.id, due: null }
  } else if (view.type === 'filter') {
    const activeFilter = filters.find(f => f.id === view.id)
    viewTasks = tasks.filter(t => !t.completed && !t.parentId && activeFilter && evaluateFilterQuery(t, activeFilter.query, projects))
    completedViewTasks = tasks.filter(t => t.completed && !t.parentId && activeFilter && evaluateFilterQuery(t, activeFilter.query, projects))
    title = activeFilter?.name || 'Filter'
    addDefaults = { projectId: inbox?.id, due: null }
  }

  const days = view.type === 'upcoming' ? Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i)) : []

  function closeMobileSidebar() { if (window.innerWidth <= 860) setSidebarOpen(false) }

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        view={view}
        setView={(v) => { setView(v); closeMobileSidebar() }}
        onAddTaskClick={() => { setMobileAddOpen(true); closeMobileSidebar() }}
        onAddProject={() => setProjectModal({ mode: 'new' })}
        onEditProject={(p) => setProjectModal({ mode: 'edit', project: p })}
        onDeleteProject={deleteProject}
        counts={counts}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
        labels={labels}
        labelColors={labelColors}
        onAddLabel={() => setLabelModal({ label: null })}
        onEditLabel={(l) => setLabelModal({ label: l })}
        onSearchClick={() => { setSearchOpen(true); closeMobileSidebar() }}
        streakCount={streakCount}
        streakToday={streakToday}
      />

      <div className="main-col">
        <div className="topbar">
          <IconBtn
            icon={sidebarOpen ? PanelLeftClose : PanelLeftOpen}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={() => setSidebarOpen(v => !v)}
          />
          <span className="topbar-title">
            {view.type === 'inbox' && 'Inbox'}
            {view.type === 'today' && 'Today'}
            {view.type === 'upcoming' && 'Upcoming'}
            {view.type === 'calendar' && 'Calendar'}
            {view.type === 'project' && activeProject?.name}
            {view.type === 'label' && '@' + view.id}
            {view.type === 'filter' && title}
            {view.type === 'app' && (APPS.find(a => a.key === view.id)?.label || 'App')}
          </span>
        </div>

        <div className="content-scroll">
          {view.type === 'calendar' ? (
            <CalendarView />
          ) : view.type === 'app' ? (
            (() => {
              const ActiveApp = APPS.find(a => a.key === view.id)?.component
              return ActiveApp ? <ActiveApp /> : (
                <div className="task-list-wrap">
                  <div className="empty-state">
                    <h4>Not found</h4>
                    <p>This app isn't wired up yet.</p>
                  </div>
                </div>
              )
            })()
          ) : view.type === 'upcoming' ? (
            <>
              <div className="view-header">
                <div className="view-title"><CalendarRange size={20} /> Upcoming</div>
                <ShowCompletedButton value={showCompleted} onChange={setShowCompleted} />
              </div>
              <div className="task-list-wrap">
                {days.map(day => {
                  const dayTasks = tasks.filter(t => !t.completed && t.due && t.due.date === day && !t.parentId)
                  const dayCompleted = tasks.filter(t => t.completed && !t.parentId && t.due && t.due.date === day)
                  const dayLabel = formatDueLabel(day)
                  return (
                    <div className="section-block" key={day}>
                      <div className="day-group-title">
                        {dayLabel}
                        {dayLabel === 'Today' && (
                          <span className="day-sub">{dateFromISO(day).toLocaleDateString(undefined, { weekday: 'long' })}</span>
                        )}
                      </div>
                      {dayTasks.length === 0 && dayCompleted.length === 0 ? (
                        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '2px 4px 10px' }}>No tasks</div>
                      ) : dayTasks.sort((a, b) => a.order - b.order).map(t => (
                        <TaskRow key={t.id} task={t} allTasks={tasks} projects={projects} labelColors={labelColors}
                          onToggle={toggleTask} onDelete={deleteTask} onOpen={setOpenTask} onUpdate={updateTask} />
                      ))}
                      <CompletedList
                        tasks={dayCompleted}
                        allTasks={tasks}
                        projects={projects}
                        labelColors={labelColors}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        onOpen={setOpenTask}
                        onUpdate={updateTask}
                        open={showCompleted}
                      />
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="view-header">
                <div>
                  <div className="view-title">
                    {view.type === 'inbox' && <InboxIcon size={20} />}
                    {view.type === 'today' && <CalendarDays size={20} />}
                    {view.type === 'project' && <span className="project-dot" style={{ background: activeProject?.color, width: 12, height: 12 }} />}
                    {view.type === 'label' && <Tag size={20} />}
                    {view.type === 'filter' && <FilterIcon size={20} />}
                    {title}
                  </div>
                  {view.type === 'today' && (
                    <div className="view-subtitle">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <ShowCompletedButton value={showCompleted} onChange={setShowCompleted} />
                  <SortMenuButton value={sortBy} onChange={setSortBy} />
                </div>
              </div>
              <div className="task-list-wrap">
                <TaskListView
                  tasks={viewTasks}
                  allTasks={tasks}
                  projects={projects}
                  labelColors={labelColors}
                  labels={labels}
                  completedTasks={completedViewTasks}
                  sortBy={sortBy}
                  sections={activeProject?.sections || []}
                  showSections={showSections}
                  showCompleted={showCompleted}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onOpen={setOpenTask}
                  onUpdate={updateTask}
                  onReorder={reorderTasks}
                  onAddSection={(name) => addSection(view.id, name)}
                  addFormDefaults={addDefaults}
                  onAddTask={(data) => addTask({ ...data, projectId: data.projectId || addDefaults.projectId, due: data.due || addDefaults.due })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <button className="fab" onClick={() => setMobileAddOpen(true)} aria-label="Add task">
        <Plus size={24} />
      </button>

      {mobileAddOpen && (
        <div className="modal-backdrop" onClick={() => setMobileAddOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Add task</h3>
              <IconBtn icon={X} title="Close" onClick={() => setMobileAddOpen(false)} />
            </div>
            <div className="modal-body">
              <AddTaskForm
                projects={projects}
                labels={labels}
                defaultProjectId={addDefaults.projectId}
                defaultDue={addDefaults.due}
                autoFocus
                onAdd={(d) => { addTask(d); setMobileAddOpen(false) }}
                onCancel={() => setMobileAddOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {openTask && (
        <TaskDetailModal
          task={tasks.find(t => t.id === openTask.id) || openTask}
          projects={projects}
          allTasks={tasks}
          onClose={() => setOpenTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddSubtask={addSubtask}
          onToggle={toggleTask}
        />
      )}

      {projectModal && (
        <ProjectModal
          project={projectModal.mode === 'edit' ? projectModal.project : null}
          onClose={() => setProjectModal(null)}
          onSave={addProject}
          onDelete={deleteProject}
        />
      )}

      {labelModal && (
        <LabelModal
          label={labelModal.label}
          existingLabels={labels}
          existingColor={labelModal.label ? labelColors[labelModal.label] : undefined}
          onClose={() => setLabelModal(null)}
          onSave={saveLabel}
          onDelete={deleteLabel}
        />
      )}

      {filterModal && (
        <FilterModal
          filter={filterModal.filter}
          onClose={() => setFilterModal(null)}
          onSave={saveFilter}
          onDelete={deleteFilterFn}
        />
      )}

      {searchOpen && (
        <SearchModal
          tasks={tasks}
          projects={projects}
          labelColors={labelColors}
          onOpenTask={(t) => setOpenTask(t)}
          onGoTo={(v) => setView(v)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button type="button" className="toast-undo" onClick={() => { toast.onUndo(); setToast(null) }}>Undo</button>
          )}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  )
}
