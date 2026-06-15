// Node http adapter that exposes the Live engine over loopback. Used by BOTH the
// Vite dev plugin (mounted at `${base}copilot/live`) and the canvas extension
// (mounted at `/live`). Returns true when it handled the request so the host can
// fall through to its own routes otherwise.
//
//   GET  <base>/status -> JSON { available, authenticated, login, models,
//                                engineStatus, token }
//   POST <base>/chat   -> SSE  ready|delta|usage|message|error|done
//                         (gated by Authorization: Bearer <token>)

import { timingSafeEqual } from "node:crypto";

import { LIVE_ENDPOINTS, SSE_EVENTS } from "../web/protocol.mjs";

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function writeSseEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data ?? {})}\n\n`);
  } catch {
    /* socket closed mid-write (e.g. instance teardown) — safe to drop */
  }
}

function readJsonBody(req, limitBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export async function handleLiveRequest(req, res, service, { basePath, token }) {
  const base = String(basePath ?? "").replace(/\/+$/, "");
  const path = (req.url || "").split("?")[0].replace(/\/+$/, "");
  const statusPath = `${base}/${LIVE_ENDPOINTS.status}`;
  const chatPath = `${base}/${LIVE_ENDPOINTS.chat}`;

  if (path !== statusPath && path !== chatPath) return false;

  if (path === statusPath) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return true;
    }
    try {
      const status = await service.status();
      sendJson(res, 200, { ...status, token: status.available ? token : undefined });
    } catch (error) {
      sendJson(res, 200, {
        available: false,
        authenticated: false,
        engineStatus: "unavailable",
        models: [],
        error: String(error?.message ?? error),
      });
    }
    return true;
  }

  // path === chatPath
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return true;
  }
  const authHeader = req.headers["authorization"] || "";
  const presented = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || !safeEqual(presented, token)) {
    sendJson(res, 401, { error: "unauthorized" });
    return true;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: String(error?.message ?? error) });
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on("close", onClose);

  writeSseEvent(res, SSE_EVENTS.ready, { conversationId: body?.conversationId });

  try {
    const result = await service.chat({
      conversationId: body?.conversationId,
      model: body?.model,
      message: body?.message,
      signal: controller.signal,
      onDelta: (delta) => writeSseEvent(res, SSE_EVENTS.delta, { text: delta }),
      onUsage: (usage) => writeSseEvent(res, SSE_EVENTS.usage, usage),
    });
    writeSseEvent(res, SSE_EVENTS.message, { text: result.content, model: result.sdkModelId });
  } catch (error) {
    if (!controller.signal.aborted) {
      // Sanitize: never leak stack traces or secrets to the client.
      writeSseEvent(res, SSE_EVENTS.error, { message: String(error?.message ?? "live chat failed") });
    }
  } finally {
    req.off?.("close", onClose);
    writeSseEvent(res, SSE_EVENTS.done, {});
    res.end();
  }
  return true;
}
