import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build target for the desktop canvas iframe. It bundles the SAME React app the
// GitHub Pages site ships (src/App.tsx via src/canvas-entry.tsx) so the canvas is
// the published experience — not a separate UI. Differences from vite.config.ts:
//   - base: './'  → relative asset URLs, robust to the canvas's ephemeral
//     loopback port (the iframe can be served from any 127.0.0.1:<port>/).
//   - no VitePWA   → no service worker inside the canvas iframe.
//   - output goes into the extension folder (web-ui/), which the extension's
//     loopback server serves verbatim. Committed so the extension works on a
//     fresh clone / gist install without a build step.
const dir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  // The canvas always uses the extension's ambient GitHub auth, never the website
  // token path — keep the browser token connector compiled out of this build.
  define: {
    __BROWSER_TOKEN_AUTH__: 'false',
  },
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: '.github/extensions/tokenizer/web-ui',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve(dir, 'canvas.html'),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
});
