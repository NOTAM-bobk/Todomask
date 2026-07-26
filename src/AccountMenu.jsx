import React, { useEffect, useRef } from 'react'

/**
 * Dropdown menu shown when the user clicks the account/workspace name
 * in the sidebar header. Currently just a placeholder shell with
 * Profile / Settings entries — wire up real content later.
 */
export default function AccountMenu({ onClose, onSelect }) {
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
    }
  }, [onClose])

  const items = [
    { key: 'profile', label: 'Profile' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <div className="popover account-menu" ref={ref} onClick={e => e.stopPropagation()}>
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          className="popover-item"
          onClick={() => { onSelect?.(item.key); onClose?.() }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
