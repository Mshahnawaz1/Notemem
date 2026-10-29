import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    // Wipes all storage after each test (replaces the old `isolatedStorage` option).
    setupFiles: ['./test/setup.ts'],
  },
})
