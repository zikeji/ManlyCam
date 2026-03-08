import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/cli/**'],
      // Thresholds recorded from actual coverage run (Story 3.6, 2026-03-08)
      // streamService reapplyCameraSettings adds uncovered path (Pi-reconnect branch)
      thresholds: {
        lines: 80,
        functions: 90,
        branches: 87,
        statements: 80,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
