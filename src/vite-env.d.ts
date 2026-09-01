/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Build-time capability flag injected via Vite `define`. True only in the public
// GitHub Pages build (vite.config.ts), false in dev, tests, and the canvas build
// (vite.canvas.config.ts) — so the website token-auth path can never weaken the
// extension's ambient GitHub auth.
declare const __BROWSER_TOKEN_AUTH__: boolean;
