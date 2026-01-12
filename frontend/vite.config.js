import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // proxy all /api and /plots requests to backend on localhost:8000
      '/upload': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/analyze': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/plots': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      }
    }
  }
})