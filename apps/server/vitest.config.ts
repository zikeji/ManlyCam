import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/cli/**',
        'src/env.ts', // env bootstrap: always mocked in tests, error path calls process.exit(1)
        'src/db/client.ts', // Prisma singleton: always mocked in tests
        'src/lib/types.ts', // type-only file, no runtime code
      ],
      // Thresholds recorded from actual coverage run (Story 3.6, 2026-03-08)
      // streamService reapplyCameraSettings adds uncovered path (Pi-reconnect branch)
      thresholds: {
        lines: 100,
        functions: 98, // ws.ts pisugar callback in c8-ignored block still counts as uncovered function
        branches: 100,
        statements: 100,
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
