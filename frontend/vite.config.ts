import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Dev only: the FastAPI backend started by scripts/dev. In Docker, nginx does the proxying.
const backend = 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // reachable from a phone on the local network
    port: 5173,
    proxy: { '/api': backend },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
