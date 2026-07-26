import React from 'react'
import { ListChecks } from 'lucide-react'

/**
 * Placeholder page for the "Lists" entry under My Apps in the sidebar.
 * Lists also has its own expandable arrow in the sidebar (currently empty) —
 * individual lists will show up there once this is built out.
 */
export default function Lists() {
  return (
    <div className="task-list-wrap">
      <div className="empty-state">
        <ListChecks size={32} />
        <h4>Lists</h4>
        <p>Nothing here yet — this app isn't wired up yet.</p>
      </div>
    </div>
  )
}
