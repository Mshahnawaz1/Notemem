import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      // ws: the room's live-update socket at /r/{id}/{secret}/ws.
      '/r': { target: 'http://localhost:8787', ws: true },
      '/mcp': 'http://localhost:8787'
    }
  }
})
