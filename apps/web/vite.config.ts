import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';

export const config = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      // Thresholds recorded from actual coverage run (Story 3.4, 2026-03-08)
      // useWebSocket.ts added; lines/statements improve with composable coverage
      thresholds: {
        lines: 69,
        functions: 86,
        branches: 92,
        statements: 69,
      },
    },
  },
});

// Tool configs require export default to function
export default config;
