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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

// Anti-DNS-rebinding: the ambient-auth token + chat are only served to loopback
// origins. The server already binds 127.0.0.1, but a rebound attacker page would
// reach it carrying its own Host header — reject anything that isn't loopback.
// A missing Host (non-browser local client) is allowed since the socket is
// already loopback-bound.
function isLoopbackHost(req) {
  const host = req.headers?.host;
  if (!host) return true;
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  return LOOPBACK_HOSTS.has(hostname);
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
  const resetPath = `${base}/${LIVE_ENDPOINTS.reset}`;

  if (path !== statusPath && path !== chatPath && path !== resetPath) return false;

  // Only serve the token + chat to loopback origins (defends against a rebound
  // attacker hostname that resolves to 127.0.0.1).
  if (!isLoopbackHost(req)) {
    sendJson(res, 403, { error: "forbidden" });
    return true;
  }

  if (path === statusPath) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return true;
    }
    // The mount probe asks with ?warm=0 to gate the Live toggle without spawning
    // the Copilot runtime; switching into Live (no param) warms it.
    const query = (req.url || "").split("?")[1] ?? "";
    const shouldWarm = new URLSearchParams(query).get("warm") !== "0";
    try {
      const status = await service.status({ warm: shouldWarm });
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

  if (path === resetPath) {
    // Dispose the SDK session backing a conversation when the user resets or
    // leaves Live mode, instead of waiting for TTL/LRU eviction. Bearer-gated like
    // /chat since it mutates engine state.
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return true;
    }
    const resetAuth = req.headers["authorization"] || "";
    const resetBearer = resetAuth.startsWith("Bearer ") ? resetAuth.slice(7) : "";
    if (!token || !safeEqual(resetBearer, token)) {
      sendJson(res, 401, { error: "unauthorized" });
      return true;
    }
    let resetBody;
    try {
      resetBody = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: String(error?.message ?? error) });
      return true;
    }
    try {
      await service.reset?.(resetBody?.conversationId);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 200, { ok: false, error: String(error?.message ?? error) });
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
  // Abort the real Copilot turn when the client goes away. The disconnect signal
  // for a POST/SSE response is the RESPONSE socket closing (`res` 'close'), not the
  // already-consumed request stream (`req` 'close' never fires here). Guard on
  // writableEnded so our own res.end() in `finally` doesn't trip a spurious abort.
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", onClose);

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
    res.off?.("close", onClose);
    writeSseEvent(res, SSE_EVENTS.done, {});
    res.end();
  }
  return true;
}
