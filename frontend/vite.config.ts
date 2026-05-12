import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Shared Vitest setup for custom matchers and DOM assertions.
    setupFiles: './src/test/setup.ts',
    css: true
  }
})
