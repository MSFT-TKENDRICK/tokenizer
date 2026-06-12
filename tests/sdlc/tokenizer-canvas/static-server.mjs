// Tiny static file server for the tokenizer canvas iframe assets, used ONLY to
// gather live-iframe visual evidence (screenshot/video/trace) for spec 002 via
// Playwright. It serves `.github/extensions/tokenizer/web/` on a fixed loopback
// port. The extension's own /state and /events endpoints are not present here;
// the iframe degrades gracefully (restore() and SSE fail silently), which is
// exactly the standalone-rendering contract we want to prove.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WEB_DIR = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../.github/extensions/tokenizer/web",
);
const PORT = Number(process.env.CANVAS_PORT ?? 4178);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
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

  if (pathname === "/") pathname = "/index.html";
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
