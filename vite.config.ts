import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { copilotLivePlugin } from './scripts/vite-plugin-copilot-live.mjs';

const isGitHubPages =
  process.env.GITHUB_PAGES === 'true' || process.env.npm_lifecycle_event === 'build:pages';
const base = isGitHubPages ? '/tokenizer/' : '/';

// The website token path lets a user paste a GitHub token into the browser, so the
// Pages build ships a connect-src CSP confining outbound requests (and therefore the
// token) to the GitHub hosts the token client actually calls, plus same-origin for
// app assets and the PWA service worker. Injected only for the Pages build so dev
// HMR (websockets, eval) and the canvas build are unaffected.
function pagesCspPlugin(enabled: boolean) {
  const csp =
    "default-src 'self'; " +
    "connect-src 'self' https://api.github.com https://models.github.ai; " +
    "img-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "base-uri 'none'; object-src 'none'";
  return {
    name: 'pages-connect-src-csp',
    transformIndexHtml(html: string) {
      if (!enabled) return html;
      const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
      return html.replace('</head>', `    ${meta}\n  </head>`);
    },
  };
}

export default defineConfig({
  base,
  define: {
    __BROWSER_TOKEN_AUTH__: JSON.stringify(isGitHubPages),
  },
  plugins: [
    react(),
    pagesCspPlugin(isGitHubPages),
    copilotLivePlugin({ base }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['manifest.webmanifest', 'icons/tokenizer-icon.svg'],
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [new RegExp(`^${base}copilot/live`)],
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
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'sdlc/**', '**/*.visual.spec.ts']
  }
});
