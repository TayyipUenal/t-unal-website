import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run dev` forwards /api to the local PHP test container (see
// RELEASE-2026-09-17.md). The Origin header is rewritten because the endpoint
// only accepts the production hostnames. Production builds are unaffected.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8086',
        headers: { origin: 'https://tayyipuenal.de' },
      },
    },
  },
})
