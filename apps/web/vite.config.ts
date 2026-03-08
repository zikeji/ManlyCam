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
      // Thresholds recorded from actual coverage run (Story 3.5, 2026-03-08)
      // ProfileAnchor.vue added (visual component, functions tested via composables)
      thresholds: {
        lines: 85,
        functions: 79,
        branches: 91,
        statements: 85,
      },
    },
  },
});

// Tool configs require export default to function
export default config;
