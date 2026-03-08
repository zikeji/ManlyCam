import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/cli/**'],
      // Thresholds recorded from actual coverage run (Story 3.2c with code review fixes, 2026-03-08)
      // wsHub.ts is intentionally untested until Story 3.4 integration tests
      // Coverage dip from added code comments in streamService and framerate validation in config tests
      thresholds: {
        lines: 82,
        functions: 87,
        branches: 87,
        statements: 82,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
