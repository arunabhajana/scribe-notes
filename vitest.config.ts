import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    allowOnly: false,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/junit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/features/**/*.ts', 'src/components/editor/*.{ts,tsx}'],
      // Protect the initial coverage floor while retaining uncovered modules in
      // reports. Raise these as new feature suites are added.
      thresholds: {
        statements: 30, branches: 20, functions: 25, lines: 30,
        'src/features/notes/offlineStore.ts': { statements: 60, branches: 45, functions: 50, lines: 65 },
        'src/features/transfer/portableData.ts': { statements: 60, branches: 50, functions: 75, lines: 65 },
        'src/features/settings/cloudStorage.ts': { statements: 90, branches: 85, functions: 100, lines: 100 },
      },
    },
  },
})
