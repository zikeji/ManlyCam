import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/cli/**'],
      // Thresholds recorded from actual coverage run (Story 3.2, 2026-03-08)
      // wsHub.ts is intentionally untested until Story 3.4 integration tests
      thresholds: {
        lines: 85,
        functions: 87,
        branches: 90,
        statements: 85,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
