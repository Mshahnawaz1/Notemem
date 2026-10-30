import { render } from 'preact'
import { Router } from 'wouter'
import './index.css'
import { App } from './app.tsx'
import { headFor } from './lib/site'

// Prerendering imports this module in Node, where there is no document.
if (typeof window !== 'undefined') {
  const root = document.getElementById('app')!
  // The Worker answers a failed request with the prerendered 500 page at the failed URL; keep
  // showing it there instead of the route that URL would match.
  const serverErrorAt = root.querySelector('[data-server-error]') ? window.location.pathname : undefined
  // The server puts the agent page text, or the prerendered page, in #app; the UI replaces it.
  root.textContent = ''
  render(<App serverErrorAt={serverErrorAt} />, root)
}

/** Called by the prerender plugin at build time for each route in `vite.config.ts`. */
export async function prerender({ url }: { url: string }) {
  const { renderToString } = await import('preact-render-to-string')
  const path = url.replace(/\.html$/, '') || '/'
  // A memory location, since the plugin's global `location` still has the `.html` file name.
  const { memoryLocation } = await import('wouter/memory-location')
  const html = renderToString(<Router hook={memoryLocation({ path, static: true }).hook}><App /></Router>)
  return { html, head: headFor(path) }
}
