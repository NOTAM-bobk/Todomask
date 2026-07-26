import React from 'react'
import { Database } from 'lucide-react'

/**
 * Placeholder page for the "Storage" entry under My Apps in the sidebar.
 * Not wired up to anything yet — replace with real content later.
 */
export default function Storage() {
  return (
    <div className="task-list-wrap">
      <div className="empty-state">
        <Database size={32} />
        <h4>Storage</h4>
        <p>Nothing here yet — this app isn't wired up yet.</p>
      </div>
    </div>
  )
}
