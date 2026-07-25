import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Menu, X, Plus, Inbox as InboxIcon, CalendarDays, CalendarRange, Hash,
  Tag, Check, Flag, ChevronDown, ChevronRight, ChevronLeft, MoreHorizontal, Trash2,
  Pencil, GripVertical, Calendar, CalendarPlus, Repeat, FolderPlus, User, Circle,
} from 'lucide-react'
import CalendarView from './Calendar.jsx'

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

  if (dateStr) due = { date: dateStr, recurring: !!rule, rule }

  text = text.replace(/\s{2,}/g, ' ').trim()

  return { content: text, priority, projectId, labelNames, due }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  const inboxId = uid()
  return {
    projects: [{ id: inboxId, name: 'Inbox', color: '#808080', sections: [], isInbox: true }],
    tasks: [
      { id: uid(), content: 'Welcome to your Todoist clone \u2014 tap here to edit', projectId: inboxId, sectionId: null, parentId: null, completed: false, priority: 4, due: { date: todayISO(), recurring: false, rule: null }, labels: ['getting-started'], order: 0 },
      { id: uid(), content: 'Try typing "Buy milk tomorrow p1 @errands"', projectId: inboxId, sectionId: null, parentId: null, completed: false, priority: 4, due: null, labels: [], order: 1 },
    ],
    labels: ['getting-started', 'errands'],
  }
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
function DueDatePicker({ value, onChange, onClose }) {
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
    <Popover onClose={onClose} style={{ minWidth: 230 }}>
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
function PriorityPicker({ value, onChange, onClose }) {
  return (
    <Popover onClose={onClose}>
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
  task, allTasks, projects, depth = 0, onToggle, onDelete, onOpen,
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
    if (task.due?.recurring) { onToggle(task); return }
    setCompleting(true)
    setTimeout(() => onToggle(task), 260)
  }

  return (
    <div>
      <div
        className={`task-row ${isDragging ? 'dragging' : ''} ${dragOverEdge === 'top' ? 'drag-over-top' : ''} ${dragOverEdge === 'bottom' ? 'drag-over-bottom' : ''} ${completing ? 'completing' : ''}`}
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
          className={`checkbox ${task.priority < 4 ? 'p' + task.priority : ''} ${completing ? 'checked' : ''}`}
          onClick={handleToggle}
          aria-label="Complete task"
          type="button"
        >
          {completing && <Check size={12} strokeWidth={3} />}
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
                </span>
              )}
              {task.labels?.map(l => (
                <span key={l} className="meta-chip label-chip"><Tag size={11} />{l}</span>
              ))}
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
            <div style={{ position: 'absolute', right: 0, top: 32 }}>
              <PriorityPicker value={task.priority} onChange={v => onUpdate(task.id, { priority: v })} onClose={() => setShowPriority(false)} />
            </div>
          )}
          <IconBtn icon={Calendar} title="Due date" onClick={e => { e.stopPropagation(); setShowDue(true) }} />
          {showDue && (
            <div style={{ position: 'absolute', right: 0, top: 32 }}>
              <DueDatePicker value={task.due} onChange={v => onUpdate(task.id, { due: v })} onClose={() => setShowDue(false)} />
            </div>
          )}
          <IconBtn icon={Trash2} title="Delete" danger onClick={e => { e.stopPropagation(); onDelete(task.id) }} />
        </div>
      </div>

      {expanded && subtasks.length > 0 && (
        <div className="subtasks">
          {subtasks.map(st => (
            <TaskRow key={st.id} task={st} allTasks={allTasks} projects={projects} depth={depth + 1}
              onToggle={onToggle} onDelete={onDelete} onOpen={onOpen} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   ADD TASK FORM (inline, expandable)
   ============================================================ */
function AddTaskForm({ projects, defaultProjectId, defaultSectionId, defaultDue, onAdd, onCancel, autoFocus }) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState(4)
  const [due, setDue] = useState(defaultDue || null)
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [showDue, setShowDue] = useState(false)
  const [showPriority, setShowPriority] = useState(false)
  const [showProject, setShowProject] = useState(false)
  const taRef = useRef(null)

  useEffect(() => { if (autoFocus && taRef.current) taRef.current.focus() }, [autoFocus])

  function submit() {
    const parsed = parseQuickAdd(text, projects, [])
    const content = parsed.content || text.trim()
    if (!content) return
    onAdd({
      content,
      priority: parsed.priority !== 4 ? parsed.priority : priority,
      due: parsed.due || due,
      projectId: parsed.projectId || projectId,
      sectionId: defaultSectionId || null,
      labelNames: parsed.labelNames,
    })
    setText('')
    setDue(defaultDue || null)
    setPriority(4)
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
          <Calendar size={13} /> {due ? (due.recurring ? recurrenceLabel(due.rule) : formatDueLabel(due.date)) : 'Date'}
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
              <input type="date" value={task.due?.date || ''} onChange={e => onUpdate(task.id, { due: e.target.value ? { date: e.target.value, recurring: false, rule: null } : null })} />
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
function LabelModal({ label, existingLabels, onClose, onSave, onDelete }) {
  const [name, setName] = useState(label || '')
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
        </div>
        <div className="modal-footer">
          {label && (
            <button className="btn ghost" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => { onDelete(label); onClose() }}>Delete</button>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!trimmed || conflict} onClick={() => { onSave(label || null, trimmed); onClose() }}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   TASK LIST (handles drag & drop reorder + sections)
   ============================================================ */
function TaskListView({
  tasks, allTasks, projects, sections, showSections, showAddPerSection,
  onToggle, onDelete, onOpen, onUpdate, onReorder, onAddSection,
  addFormDefaults, onAddTask,
}) {
  const [dragId, setDragId] = useState(null)
  const [overInfo, setOverInfo] = useState(null) // {id, edge}
  const [openAddFor, setOpenAddFor] = useState(null) // sectionId or 'root' or null

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
    return list.filter(t => !t.parentId).sort((a, b) => a.order - b.order).map(t => (
      <TaskRow
        key={t.id}
        task={t}
        allTasks={allTasks}
        projects={projects}
        onToggle={onToggle}
        onDelete={onDelete}
        onOpen={onOpen}
        onUpdate={onUpdate}
        dragHandlers={makeDragHandlers(t)}
        isDragging={dragId === t.id}
        dragOverEdge={overInfo?.id === t.id ? overInfo.edge : null}
      />
    ))
  }

  if (!showSections) {
    return (
      <div className="section-block">
        {tasks.length === 0 && (
          <div className="empty-state">
            <Check size={32} />
            <h4>All clear</h4>
            <p>Nothing here. Enjoy the calm.</p>
          </div>
        )}
        {renderTasks(tasks)}
        <div className="add-task-inline">
          {openAddFor === 'root' ? (
            <AddTaskForm
              projects={projects}
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
      </div>
    )
  }

  const unsectioned = tasks.filter(t => !t.sectionId)

  return (
    <div>
      {unsectioned.length > 0 && (
        <div className="section-block">
          {renderTasks(unsectioned)}
        </div>
      )}
      <div className="add-task-inline" style={{ marginBottom: 8 }}>
        {openAddFor === 'root' ? (
          <AddTaskForm projects={projects} defaultProjectId={addFormDefaults.projectId} autoFocus
            onAdd={(data) => onAddTask({ ...data, sectionId: null })} onCancel={() => setOpenAddFor(null)} />
        ) : (
          <button className="add-task-trigger" onClick={() => setOpenAddFor('root')}><Plus size={16} /> Add task</button>
        )}
      </div>

      {sections.map(sec => {
        const secTasks = tasks.filter(t => t.sectionId === sec.id)
        return (
          <div className="section-block" key={sec.id}>
            <div className="section-title-row">
              <span className="section-title">{sec.name}</span>
              <span className="section-count">{secTasks.filter(t => !t.completed).length}</span>
            </div>
            {secTasks.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '4px 4px 8px' }}>No tasks</div>}
            {renderTasks(secTasks)}
            <div className="add-task-inline">
              {openAddFor === sec.id ? (
                <AddTaskForm projects={projects} defaultProjectId={addFormDefaults.projectId} defaultSectionId={sec.id} autoFocus
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
  counts, open, onToggle, labels, onAddLabel, onEditLabel,
}) {
  return (
    <>
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={onToggle} />
      <aside className={`sidebar ${open ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="avatar"><User size={15} /></div>
          <div className="workspace-name">My Todoist</div>
        </div>

        <button className="add-task-row" onClick={onAddTaskClick}>
          <Plus size={18} /> Add task
        </button>

        <div className="nav-list">
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

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span>Projects</span>
            <button className="add-mini" onClick={onAddProject} title="Add project"><Plus size={15} /></button>
          </div>
          <div className="nav-list">
            {projects.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button className={`nav-item ${view.type === 'project' && view.id === p.id ? 'active' : ''}`} style={{ flex: 1 }}
                  onClick={() => setView({ type: 'project', id: p.id })}>
                  <span className="nav-icon"><span className="project-dot" style={{ background: p.color }} /></span>
                  <span className="nav-label">{p.name}</span>
                  {counts.byProject[p.id] > 0 && <span className="count">{counts.byProject[p.id]}</span>}
                </button>
                {!p.isInbox && (
                  <IconBtn icon={Pencil} title="Edit project" size={13} onClick={() => onEditProject(p)} />
                )}
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
                    <span className="nav-icon"><Tag size={15} /></span>
                    <span className="nav-label">{l}</span>
                  </button>
                  <IconBtn icon={Pencil} title="Edit label" size={13} onClick={() => onEditLabel(l)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <button
        className={`sidebar-toggle-tab ${open ? '' : 'collapsed'}`}
        onClick={onToggle}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        title={open ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
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
  const [mobileAddOpen, setMobileAddOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const { projects, tasks, labels } = data

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
    updateTasks(ts => ts.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t))
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

  function saveLabel(oldName, newName) {
    setData(d => {
      if (oldName) {
        // renaming an existing label: update the label list and every task referencing it
        return {
          ...d,
          labels: d.labels.map(l => l === oldName ? newName : l),
          tasks: d.tasks.map(t => t.labels?.includes(oldName)
            ? { ...t, labels: t.labels.map(l => l === oldName ? newName : l) }
            : t),
        }
      }
      if (d.labels.includes(newName)) return d
      return { ...d, labels: [...d.labels, newName] }
    })
    if (oldName && view.type === 'label' && view.id === oldName) setView({ type: 'label', id: newName })
  }

  function deleteLabel(name) {
    setData(d => ({
      ...d,
      labels: d.labels.filter(l => l !== name),
      tasks: d.tasks.map(t => t.labels?.includes(name) ? { ...t, labels: t.labels.filter(l => l !== name) } : t),
    }))
    if (view.type === 'label' && view.id === name) setView({ type: 'inbox' })
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
  let title = ''
  let showSections = false
  let addDefaults = { projectId: inbox?.id, due: null }

  if (view.type === 'inbox') {
    viewTasks = tasks.filter(t => t.projectId === inbox?.id && !t.completed)
    title = 'Inbox'
    addDefaults = { projectId: inbox?.id, due: null }
  } else if (view.type === 'today') {
    viewTasks = tasks.filter(t => !t.completed && t.due && t.due.date <= todayISO())
    title = 'Today'
    addDefaults = { projectId: inbox?.id, due: { date: todayISO(), recurring: false, rule: null } }
  } else if (view.type === 'project') {
    viewTasks = tasks.filter(t => t.projectId === view.id && !t.completed)
    title = activeProject?.name || ''
    showSections = true
    addDefaults = { projectId: view.id, due: null }
  } else if (view.type === 'label') {
    viewTasks = tasks.filter(t => !t.completed && t.labels?.includes(view.id))
    title = '@' + view.id
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
        onAddLabel={() => setLabelModal({ label: null })}
        onEditLabel={(l) => setLabelModal({ label: l })}
      />

      <div className="main-col">
        <div className="topbar">
          <IconBtn icon={Menu} title="Menu" onClick={() => setSidebarOpen(true)} />
          <span className="topbar-title">
            {view.type === 'inbox' && 'Inbox'}
            {view.type === 'today' && 'Today'}
            {view.type === 'upcoming' && 'Upcoming'}
            {view.type === 'calendar' && 'Calendar'}
            {view.type === 'project' && activeProject?.name}
            {view.type === 'label' && '@' + view.id}
          </span>
        </div>

        <div className="content-scroll">
          {view.type === 'calendar' ? (
            <CalendarView />
          ) : view.type === 'upcoming' ? (
            <>
              <div className="view-header">
                <div className="view-title"><CalendarRange size={20} /> Upcoming</div>
              </div>
              <div className="task-list-wrap">
                {days.map(day => {
                  const dayTasks = tasks.filter(t => !t.completed && t.due && t.due.date === day && !t.parentId)
                  return (
                    <div className="section-block" key={day}>
                      <div className="day-group-title">
                        {formatDueLabel(day)}
                        <span className="day-sub">{dateFromISO(day).toLocaleDateString(undefined, { weekday: 'long' })}</span>
                      </div>
                      {dayTasks.length === 0 ? (
                        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '2px 4px 10px' }}>No tasks</div>
                      ) : dayTasks.sort((a, b) => a.order - b.order).map(t => (
                        <TaskRow key={t.id} task={t} allTasks={tasks} projects={projects}
                          onToggle={toggleTask} onDelete={deleteTask} onOpen={setOpenTask} onUpdate={updateTask} />
                      ))}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="view-header">
                <div className="view-title">
                  {view.type === 'inbox' && <InboxIcon size={20} />}
                  {view.type === 'today' && <CalendarDays size={20} />}
                  {view.type === 'project' && <span className="project-dot" style={{ background: activeProject?.color, width: 12, height: 12 }} />}
                  {view.type === 'label' && <Tag size={20} />}
                  {title}
                </div>
                {view.type === 'today' && (
                  <div className="view-subtitle">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                )}
              </div>
              <div className="task-list-wrap">
                <TaskListView
                  tasks={viewTasks}
                  allTasks={tasks}
                  projects={projects}
                  sections={activeProject?.sections || []}
                  showSections={showSections}
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
          onClose={() => setLabelModal(null)}
          onSave={saveLabel}
          onDelete={deleteLabel}
        />
      )}
    </div>
  )
}
