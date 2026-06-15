// Shared Live-mode wire protocol. Source of truth for the Node engine
// (live/service.mjs + live/httpHandler.mjs) and the iframe browser client
// (web/liveClient.mjs). Mirrored — and parity-tested — by src/lib/live/protocol.ts.
//
// Kept intentionally tiny (constants + id map + helpers) so the JS/TS
// duplication this repo already uses for tokenizer/models stays low-risk.

export const LIVE_ENDPOINTS = { status: "status", chat: "chat", reset: "reset" };

// Server-Sent Event names emitted by POST /chat.
export const SSE_EVENTS = {
  ready: "ready",
  delta: "delta",
  usage: "usage",
  message: "message",
  error: "error",
  done: "done",
};

export const ENGINE_STATUS = {
  unavailable: "unavailable",
  warming: "warming",
  ready: "ready",
};

// Catalog (UI) model id -> SDK listModels() id, only where they diverge.
// Anything not listed is passed through unchanged and validated at runtime
// against the live status.models set.
export const SDK_MODEL_ALIASES = {
  "gemini-3.1-pro": "gemini-3.1-pro-preview",
  "mai-code-1-flash": "mai-code-1-flash-internal",
};

export function toSdkModelId(catalogId) {
  if (!catalogId) return undefined;
  return SDK_MODEL_ALIASES[catalogId] ?? catalogId;
}

// Join a base prefix and an endpoint without doubling or dropping slashes.
export function joinLivePath(base, endpoint) {
  const left = String(base ?? "").replace(/\/+$/, "");
  return `${left}/${endpoint}`;
}
