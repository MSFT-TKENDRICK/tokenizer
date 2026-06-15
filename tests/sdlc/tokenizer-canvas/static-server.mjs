// Tiny static file server for the tokenizer canvas iframe assets, used ONLY to
// gather live-iframe visual evidence (screenshot/video/trace) for spec 002 via
// Playwright. It serves the built React app from
// `.github/extensions/tokenizer/web-ui/` on a fixed loopback port — the same
// bundle the canvas serves, so the evidence reflects the published experience.
// The extension's own /state, /events and /copilot/live endpoints are absent
// here; the app degrades gracefully (Live stays hidden), which is exactly the
// standalone-rendering contract we want to prove.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WEB_DIR = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../.github/extensions/tokenizer/web-ui",
);
const PORT = Number(process.env.CANVAS_PORT ?? 4178);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // Endpoints the standalone server intentionally does not implement.
  if (pathname === "/state") {
    res.writeHead(404).end();
    return;
  }
  if (pathname === "/events") {
    res.writeHead(404).end();
    return;
  }
  // Live chat engine is extension-only; the static server has no Node runtime to
  // host it, so the app's /copilot/live/status probe 404s and the Live toggle
  // stays disabled — keeping the visual fixtures stable.
  if (pathname === "/copilot/live" || pathname.startsWith("/copilot/live/")) {
    res.writeHead(404).end();
    return;
  }

  if (pathname === "/" || pathname === "/index.html") pathname = "/canvas.html";
  const filePath = path.join(WEB_DIR, pathname);
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403).end();
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`canvas static server on http://127.0.0.1:${PORT}/ (dir: ${WEB_DIR})`);
});
