import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const isGitHubPages =
  process.env.GITHUB_PAGES === 'true' || process.env.npm_lifecycle_event === 'build:pages';
const base = isGitHubPages ? '/tokenizer/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['manifest.webmanifest', 'icons/tokenizer-icon.svg'],
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }

          return undefined;
        }
      }
    }
  },
  test: {
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'sdlc/**']
  }
});
