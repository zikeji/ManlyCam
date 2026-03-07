import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Thresholds recorded from actual coverage run (Story 2.3, 2026-03-07)
      thresholds: {
        lines: 83,
        functions: 75,
        branches: 86,
        statements: 83,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
