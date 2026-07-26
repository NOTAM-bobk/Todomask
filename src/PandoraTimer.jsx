import React from 'react'
import { Timer } from 'lucide-react'

/**
 * Placeholder page for the "Pandora Timer" entry under My Apps in the sidebar.
 * Not wired up to anything yet — replace with real content later.
 */
export default function PandoraTimer() {
  return (
    <div className="task-list-wrap">
      <div className="empty-state">
        <Timer size={32} />
        <h4>Pandora Timer</h4>
        <p>Nothing here yet — this app isn't wired up yet.</p>
      </div>
    </div>
  )
}
