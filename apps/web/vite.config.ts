import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Sets long-lived cache headers for /emojis/* in dev server so browsers skip
// conditional GETs on reload and avoid the SVG loading flash (304 flash).
function emojiCacheHeadersPlugin(): Plugin {
  return {
    name: 'emoji-cache-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/emojis/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
      });
    },
  };
}

export const config = defineConfig({
  plugins: [
    vue(),
    // Serve @lobehub/fluent-emoji-modern SVG assets at /emojis/{codepoint}.svg
    // Works in both dev (middleware) and prod (copied to dist/emojis/).
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@lobehub/fluent-emoji-modern/assets/*',
          dest: 'emojis',
        },
      ],
    }),
    emojiCacheHeadersPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@manlycam/types': fileURLToPath(
        new URL('../../packages/types/src/index.ts', import.meta.url),
      ),
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
        'src/router/**', // routing config, not unit-testable
        'src/types/**', // re-export barrel, no logic
        'src/components/ui/**', // shadcn-vue generated components, not unit-testable
        'src/lib/emoji-data.ts', // import.meta.glob generates ~1000s of lazy arrow fns; V8 counts all as uncovered
        'src/vite-env.d.ts', // ambient type declarations, no runtime code
        'src/components/admin/UserManagerDialog.vue', // pure template wrapper, no logic to test
      ],
      // Thresholds based on Story 8.4 actual coverage (slash commands + ephemeral messages)
      // Actual coverage: lines ~93%, functions 68%, branches ~91%, statements ~93%
      // Setting thresholds: functions at 64% (hover-gated UI components), others per actual
      thresholds: {
        lines: 98,
        functions: 87,
        branches: 94,
        statements: 98,
      },
    },
  },
});

// Tool configs require export default to function
export default config;
