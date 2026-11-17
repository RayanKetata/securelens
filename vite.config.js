import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Component and page tests. Plain logic tests in src/utils
    // (*.test.js) run with Node's built-in runner instead.
    include: ['src/**/*.test.jsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
})
