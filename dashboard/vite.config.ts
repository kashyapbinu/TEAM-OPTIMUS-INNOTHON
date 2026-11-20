import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // vendor split: React and Recharts (+ d3) change rarely and cache separately from app code
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\/](recharts|d3-[^\/]+|victory-vendor|internmap|decimal\.js-light|eventemitter3|lodash)[\/]/.test(id)) return 'charts'
          if (/[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
