import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/cli/**'],
      // Thresholds recorded from actual coverage run (Story 3.4, 2026-03-08)
      // wsHub.ts and ws route now covered via ws.test.ts
      thresholds: {
        lines: 84,
        functions: 90,
        branches: 87,
        statements: 84,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
