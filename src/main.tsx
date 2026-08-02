import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import App from './App'
import { ThemeProvider } from './theme/ThemeContext'
import { installConsoleCapture } from './bugreport/consoleLog'

// Installed before the first render so a bug report carries whatever the app
// logged on the way to the failure, not just what happened after.
installConsoleCapture()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
