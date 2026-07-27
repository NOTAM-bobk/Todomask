import React from 'react'
import { Mail } from 'lucide-react'

/**
 * Placeholder page for the "Email" entry under My Apps in the sidebar.
 * Not wired up to anything yet — replace with real content later.
 */
export default function Email() {
  return (
    <div className="task-list-wrap">
      <div className="empty-state">
        <Mail size={32} />
        <h4> settings</h4>
        <p>Nothing here yet — this app isn't wired up yet.</p>
      </div>
    </div>
  )
}
