// Vite plugin: mounts the shared Live engine on the dev and preview servers under
// `${base}copilot/live/*`, reusing the exact same Node modules the canvas
// extension uses (zero logic duplication). A static GitHub Pages build has no
// Node server, so /status simply 404s and the app hides Live — by design.

import { randomBytes } from "node:crypto";

import { resolveSdk } from "../.github/extensions/tokenizer/live/resolveSdk.mjs";
import { createLiveService } from "../.github/extensions/tokenizer/live/service.mjs";
import { handleLiveRequest } from "../.github/extensions/tokenizer/live/httpHandler.mjs";

export function copilotLivePlugin({ base = "/" } = {}) {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const basePath = `${normalizedBase}copilot/live`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  const token = randomBytes(24).toString("hex");
  let service = null;

  function ensureService() {
    if (!service) service = createLiveService({ resolve: resolveSdk });
    return service;
  }

  function mount(server) {
    const svc = ensureService();
    server.middlewares.use((req, res, next) => {
      handleLiveRequest(req, res, svc, { basePath, token })
        .then((handled) => {
          if (!handled) next();
        })
        .catch((error) => next(error));
    });
    const teardown = () => {
      service?.dispose().catch(() => {});
      service = null;
    };
    server.httpServer?.once("close", teardown);
    process.once("exit", teardown);
  }

  return {
    name: "copilot-live",
    // Never activate under Vitest (would spawn the real CLI and hang the runner)
    // or in a static GitHub Pages build (no Node server to host the engine).
    apply: () => !process.env.VITEST,
    configureServer(server) {
      mount(server);
    },
    configurePreviewServer(server) {
      mount(server);
    },
  };
}

export default copilotLivePlugin;
