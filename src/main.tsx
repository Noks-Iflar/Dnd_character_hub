import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './styles/fonts'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './lib/auth'
import { applyTheme, currentTheme } from './lib/theme'

applyTheme(currentTheme())

// HashRouter: GitHub Pages can't rewrite unknown paths to index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
