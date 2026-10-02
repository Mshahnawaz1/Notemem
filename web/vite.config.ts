import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/r': 'http://localhost:8787',
      '/mcp': 'http://localhost:8787'
    }
  }
})
