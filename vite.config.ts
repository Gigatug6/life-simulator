/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['app', 'vite', 'localhost'],
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
