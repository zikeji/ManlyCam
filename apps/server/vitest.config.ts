import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/cli/**'],
      // Thresholds recorded from actual coverage run (Story 2.5, 2026-03-07)
      thresholds: {
        lines: 86,
        functions: 82,
        branches: 89,
        statements: 86,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
