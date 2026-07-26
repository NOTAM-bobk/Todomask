import React from 'react'
import { Lock } from 'lucide-react'

/**
 * Placeholder page for the "Passwords" entry under My Apps in the sidebar.
 * Not wired up to anything yet — replace with real content later.
 */
export default function Passwords() {
  return (
    <div className="task-list-wrap">
      <div className="empty-state">
        <Lock size={32} />
        <h4>Passwords</h4>
        <p>Nothing here yet — this app isn't wired up yet.</p>
      </div>
    </div>
  )
}
