import { defineConfig, devices } from "@playwright/test";

// Dedicated Playwright config for spec 002 (Tokenizer Copilot Desktop Canvas)
// visual evidence. It serves the canvas iframe assets on a FIXED loopback port
// (independent of the live extension's ephemeral port) and writes artifacts into
// the SDLC evidence bundle.
const PORT = 4178;

export default defineConfig({
  testDir: ".",
  testMatch: "canvas.visual.spec.ts",
  outputDir: "../../../docs/sdlc/002-tokenizer-canvas/evidence/playwright-results",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "../../../docs/sdlc/002-tokenizer-canvas/evidence/playwright-report",
      },
    ],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on",
    screenshot: "on",
    video: "on",
  },
  webServer: {
    command: "node static-server.mjs",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { CANVAS_PORT: String(PORT) },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
