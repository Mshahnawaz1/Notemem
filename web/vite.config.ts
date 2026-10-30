import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact({
      // Writes static HTML for the public pages (PAGES in src/lib/site.ts) so crawlers get content
      // without running scripts. `/` becomes index.html; `.html` routes are served without the extension.
      prerender: {
        enabled: true,
        renderTarget: '#app',
        additionalPrerenderRoutes: ['/about.html', '/contact.html', '/privacy.html', '/terms.html', '/404.html', '/500.html'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      // ws: the room's live-update socket at /r/{id}/{secret}/ws.
      '/r': { target: 'http://localhost:8787', ws: true },
      '/mcp': 'http://localhost:8787'
    }
  }
})
