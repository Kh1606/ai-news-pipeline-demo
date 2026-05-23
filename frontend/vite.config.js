import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Override with: VITE_PROXY_TARGET=http://localhost:8000
const PROXY_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': {
        target: PROXY_TARGET,
        changeOrigin: true,
      },
      '/health': {
        target: PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
})
