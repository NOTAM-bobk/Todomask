import React from 'react'
import { StickyNote } from 'lucide-react'

/**
 * Placeholder page for the "Notes" entry under My Apps in the sidebar.
 * Not wired up to anything yet — replace with real content later.
 */
export default function Notes() {
  return (
    <div className="task-list-wrap">
      <div className="empty-state">
        <StickyNote size={32} />
        <h4>Notes</h4>
        <p>Nothing here yet — this app isn't wired up yet.</p>
      </div>
    </div>
  )
}
