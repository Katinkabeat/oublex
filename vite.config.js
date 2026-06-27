import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/oublex/',
  server: {
    port: 5189,
    strictPort: true,
  },
})
