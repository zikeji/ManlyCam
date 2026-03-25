import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: '__SITE_NAME__',
        short_name: '__SITE_NAME__',
        description: 'Live pet camera',
        theme_color: '#915930',
        background_color: '#1b1917',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/, /^\/whep/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^\/emojis\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'emojis',
              expiration: { maxAgeSeconds: 2592000, maxEntries: 500 },
            },
          },
        ],
      },
    }),
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
        // Note: AdminDialog.vue (formerly UserManagerDialog.vue) is tested via AdminDialog.test.ts
      ],
      // Thresholds based on actual coverage (adjusted for pre-existing branch debt)
      thresholds: {
        lines: 98,
        functions: 87,
        branches: 93,
        statements: 98,
      },
    },
  },
});

// Tool configs require export default to function
export default config;
