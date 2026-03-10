import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';

export const config = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@manlycam/types': fileURLToPath(new URL('../../packages/types/src/index.ts', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        'src/router/**',  // routing config, not unit-testable
        'src/types/**',   // re-export barrel, no logic
        'src/components/ui/**',  // shadcn-vue generated components, not unit-testable
      ],
      // Thresholds based on Story 4.4 actual coverage (chat sidebar + unread badge)
      // Actual coverage: lines ~93%, functions 68%, branches ~91%, statements ~93%
      // Setting thresholds: functions at 64% (hover-gated UI components), others per actual
      thresholds: {
        lines: 90,
        functions: 64,
        branches: 91,
        statements: 90,
      },
    },
  },
});

// Tool configs require export default to function
export default config;
