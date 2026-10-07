import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './PlanApp.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { runSelfChecks } from './selfChecks.js'
import './v2.css'

runSelfChecks()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
