import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './index.css'

// Some pages and the PDF libraries are separate code chunks, loaded on first
// use (see router.tsx). A deploy replaces every chunk, so a tab opened before
// it asks for files that no longer exist — and Cloudflare's SPA fallback
// answers with index.html, which fails to import. Reloading picks up the new
// build; the router keeps its URL and route state across the reload, so a
// member mid-checkout lands back on the same step. At most one reload per
// 10 seconds, so a genuinely broken chunk falls through to ErrorBoundary
// rather than reloading forever.
const CHUNK_RELOAD_KEY = 'hms_chunk_reload_at'
window.addEventListener('vite:preloadError', (event) => {
  let lastReload = 0
  try {
    lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0
  } catch {
    // Storage unavailable: still worth one reload.
  }
  if (Date.now() - lastReload < 10_000) return
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    // Ignore — see above.
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
