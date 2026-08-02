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
  server: {
    // Pinned, and `strictPort` so a busy 5173 is a LOUD failure rather than a
    // silent hop to 5174.
    //
    // Browser storage is keyed to the origin, port included — so landing on a
    // different port silently presents an empty app: no saved patterns, no
    // thumbnails, no Generator dataset, no bug reports. Nothing is lost, but
    // it looks exactly as though everything was, and the data is unreachable
    // until you are back on the original port. Refusing to start says which
    // problem you actually have.
    port: 5173,
    strictPort: true,
  },
  define: {
    'import.meta.env.VITE_COMMIT_MSG': JSON.stringify(commitMsg),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The heaviest tests are full App renders and geometry sweeps: ~1.7 s idle,
    // but 5.7-7.3 s on a loaded machine — over vitest's 5 s default. Raised so a
    // busy machine doesn't turn a green suite red.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
