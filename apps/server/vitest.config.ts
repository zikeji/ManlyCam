import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Thresholds recorded from actual coverage run (Story 2.1c, 2026-03-07)
      thresholds: {
        lines: 82,
        functions: 73,
        branches: 85,
        statements: 82,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
