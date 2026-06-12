// Extension: tokenizer — GitHub Copilot desktop canvas (spec 002-tokenizer-canvas).
//
// Declares a single canvas via the Copilot SDK and serves its UI from a
// per-instance loopback HTTP server. The pure tokenization + model-cost logic
// lives in ./web/*.mjs and is shared verbatim with the iframe client.
//
// Contract reminders (see create-canvas skill):
//   - stdout is reserved for JSON-RPC — NEVER console.log; use session.log.
//   - bind embedded servers to loopback (127.0.0.1) only.
//   - action handlers return raw values; throw CanvasError(code, message).

import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

import { summarizeTokens } from "./web/tokenizer.mjs";
import { COPILOT_MODEL_OPTIONS } from "./web/models.mjs";

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "web");

const STATIC_ROUTES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
  "/tokenizer.mjs": { file: "tokenizer.mjs", type: "text/javascript; charset=utf-8" },
  "/models.mjs": { file: "models.mjs", type: "text/javascript; charset=utf-8" },
};

// One loopback server per open canvas instance.
const servers = new Map();
// All open iframe SSE connections (across instances) receive agent pushes.
const sseClients = new Set();

// Session-scoped working text. FR-009 is resolved as session-scoped persistence
// (see docs/sdlc ADR): keyed by sessionId under $COPILOT_HOME so it survives
// iframe/extension reloads within the session without polluting the repo tree.
let session;
let sessionId = "default";
let currentText = "";

function stateFilePath() {
  const home = process.env.COPILOT_HOME || join(homedir(), ".copilot");
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_") || "default";
  return join(home, "extensions", "tokenizer", "artifacts", `state-${safe}.json`);
}

async function loadState() {
  try {
    const raw = await readFile(stateFilePath(), "utf8");
    const data = JSON.parse(raw);
    if (typeof data.text === "string") {
      currentText = data.text;
    }
  } catch {
    // No persisted state for this session yet.
  }
}

async function saveState() {
  try {
    const file = stateFilePath();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ text: currentText }), "utf8");
  } catch (error) {
    session?.log?.(`tokenizer: failed to persist state: ${error.message}`, { level: "warn" });
  }
}

function broadcastText(text) {
  const payload = `event: settext\ndata: ${JSON.stringify({ text })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function statusLine() {
  const { tokens } = summarizeTokens(currentText);
  return `${tokens} token${tokens === 1 ? "" : "s"} · ${COPILOT_MODEL_OPTIONS.length} models`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (chunks.reduce((n, c) => n + c.length, 0) > 5_000_000) {
      throw new Error("payload too large");
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function handleSse(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
}

async function handleRequest(req, res) {
  let pathname = "/";
  try {
    pathname = new URL(req.url, "http://127.0.0.1").pathname;
  } catch {
    pathname = req.url || "/";
  }

  if (req.method === "GET" && pathname === "/events") {
    handleSse(req, res);
    return;
  }

  if (pathname === "/state") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ text: currentText }));
      return;
    }
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const data = body ? JSON.parse(body) : {};
        if (typeof data.text === "string") {
          currentText = data.text;
          await saveState();
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "invalid body" }));
      }
      return;
    }
  }

  const route = req.method === "GET" ? STATIC_ROUTES[pathname] : undefined;
  if (route) {
    try {
      const contents = await readFile(join(WEB_DIR, route.file));
      res.writeHead(200, { "Content-Type": route.type });
      res.end(contents);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

async function startServer() {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      session?.log?.(`tokenizer: request error: ${error.message}`, { level: "warn" });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("Server error");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/` };
}

const canvas = createCanvas({
  id: "tokenizer",
  displayName: "Tokenizer",
  description:
    "Tokenize text and compare input cost across Copilot models, live in the side panel.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string", description: "Optional initial text to tokenize when opening." },
    },
  },
  actions: [
    {
      name: "set_text",
      description: "Load text into the tokenizer canvas and return its token summary.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: { type: "string", description: "Text to tokenize in the canvas." },
        },
      },
      handler: async (ctx) => {
        const text = ctx?.input?.text;
        if (typeof text !== "string") {
          throw new CanvasError("invalid_input", "set_text requires { text: string }");
        }
        currentText = text;
        await saveState();
        broadcastText(text);
        const summary = summarizeTokens(text);
        session?.log?.(`tokenizer: set_text loaded ${summary.tokens} tokens`, {
          level: "info",
          ephemeral: true,
        });
        return { ok: true, summary };
      },
    },
    {
      name: "get_summary",
      description:
        "Return the current canvas text and its token summary (characters, bytes, words, lines, tokens).",
      handler: async () => {
        return {
          text: currentText,
          summary: summarizeTokens(currentText),
          modelCount: COPILOT_MODEL_OPTIONS.length,
        };
      },
    },
  ],
  open: async (ctx) => {
    if (ctx?.input && typeof ctx.input.text === "string" && ctx.input.text.length > 0) {
      currentText = ctx.input.text;
      await saveState();
      broadcastText(currentText);
    }

    let entry = servers.get(ctx.instanceId);
    if (!entry) {
      entry = await startServer();
      servers.set(ctx.instanceId, entry);
    }
    return {
      title: "Tokenizer",
      status: statusLine(),
      url: entry.url,
    };
  },
  onClose: async (ctx) => {
    const entry = servers.get(ctx.instanceId);
    if (entry) {
      servers.delete(ctx.instanceId);
      await new Promise((resolve) => entry.server.close(() => resolve()));
    }
  },
});

session = await joinSession({ canvases: [canvas] });
sessionId = session?.sessionId ?? "default";
await loadState();
session?.log?.("Tokenizer canvas ready", { level: "info", ephemeral: true });
