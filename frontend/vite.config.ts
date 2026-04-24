import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend built into backend/public so the Node server can serve it.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:7373',
        changeOrigin: true,
      },
    },
  },
})
