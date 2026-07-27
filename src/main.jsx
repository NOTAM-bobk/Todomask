import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Onboarding, { hasOnboarded } from './Onboarding.jsx'
import './index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  })
}

function Root() {
  // Checks localStorage to see if they've completed onboarding before the first render
  const [onboarded, setOnboarded] = useState(hasOnboarded)
  
  if (!onboarded) {
    return (
      <Onboarding
        onComplete={() => setOnboarded(true)}
        onLogin={() => { 
          // You can add your route to your login screen here
          console.log("Routing to login...") 
        }}
      />
    )
  }
  
  // If they have onboarded, show the main app
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
