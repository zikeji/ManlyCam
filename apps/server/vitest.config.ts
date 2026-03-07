import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Thresholds recorded from actual coverage run (Story 2.4, 2026-03-07)
      thresholds: {
        lines: 84,
        functions: 76,
        branches: 87,
        statements: 84,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
