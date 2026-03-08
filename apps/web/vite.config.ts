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
      ],
      // Thresholds recorded from actual coverage run (Story 3.6, 2026-03-08)
      // AdminPanel + CameraControls added; functions threshold reflects new uncovered
      // Vue SFC event handlers in ProfileAnchor/StreamPlayer (visual/WebRTC components)
      thresholds: {
        lines: 85,
        functions: 65,
        branches: 91,
        statements: 85,
      },
    },
  },
});

// Tool configs require export default to function
export default config;
