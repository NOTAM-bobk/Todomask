import React from 'react'
import { BookOpen } from 'lucide-react'

/**
 * Placeholder page for the "Journal" entry under My Apps in the sidebar.
 * Not wired up to anything yet — replace with real content later.
 */
export default function Journal() {
  return (
    <div className="task-list-wrap">
      <div className="empty-state">
        <BookOpen size={32} />
        <h4>Journal</h4>
        <p>Nothing here yet — this app isn't wired up yet.</p>
      </div>
    </div>
  )
}
