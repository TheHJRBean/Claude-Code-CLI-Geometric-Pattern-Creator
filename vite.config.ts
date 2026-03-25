import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const commitMsg = (() => {
  try {
    return execSync('git log -1 --pretty=format:"%h: %s"').toString().trim()
  } catch { return 'no commit info' }
})()

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_COMMIT_MSG': JSON.stringify(commitMsg),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
