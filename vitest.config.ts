import { defineConfig } from 'vitest/config'

// Fast unit tests only; the Electron end-to-end test has its own config (npm run test:e2e).
export default defineConfig({
  test: { include: ['tests/disk-engine/**/*.test.ts', 'tests/main/**/*.test.ts', 'tests/renderer/**/*.test.ts', 'tests/oracle/**/*.test.ts', 'tests/lang/**/*.test.ts'] },
})
