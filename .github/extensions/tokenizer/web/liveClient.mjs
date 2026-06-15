// Iframe (canvas) Live client. Plain ESM served verbatim over loopback — no
// bundler. Mirrored by src/lib/live/liveClient.ts for the React app; both speak
// the protocol in ./protocol.mjs. Holds the bearer token in memory (from
// /status) and replays it on POST /chat as CSRF defense.

import { LIVE_ENDPOINTS, SSE_EVENTS, joinLivePath } from "./protocol.mjs";

export function createLiveClient(baseUrl) {
  let token;

  async function getStatus(options) {
    const suffix = options && options.warm === false ? "?warm=0" : "";
    const res = await fetch(joinLivePath(baseUrl, LIVE_ENDPOINTS.status) + suffix, { cache: "no-store" });
    if (!res.ok) throw new Error(`live status ${res.status}`);
    const data = await res.json();
    token = data.token;
    return data;
  }

  function dispatchFrame(frame, handlers) {
    let event = SSE_EVENTS.message;
    const dataLines = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length === 0) return;
    let data;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    switch (event) {
      case SSE_EVENTS.ready:
        handlers.onReady?.(data);
        break;
      case SSE_EVENTS.delta:
        handlers.onDelta?.(data.text ?? "");
        break;
      case SSE_EVENTS.usage:
        handlers.onUsage?.(data);
        break;
      case SSE_EVENTS.message:
        handlers.onMessage?.(data.text ?? "", data);
        break;
      case SSE_EVENTS.error:
        handlers.onError?.(data.message ?? "live chat failed");
        break;
      case SSE_EVENTS.done:
        handlers.onDone?.();
        break;
      default:
        break;
    }
  }

  async function streamChat({ conversationId, model, message, signal }, handlers = {}) {
    const res = await fetch(joinLivePath(baseUrl, LIVE_ENDPOINTS.chat), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ conversationId, model, message }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`live chat ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (frame.trim()) dispatchFrame(frame, handlers);
      }
    }
  }

  async function reset(conversationId) {
    try {
      await fetch(joinLivePath(baseUrl, LIVE_ENDPOINTS.reset), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ conversationId }),
        keepalive: true,
      });
    } catch {
      /* best effort: the SDK session TTL-evicts if this never lands */
    }
  }

  return {
    getStatus,
    streamChat,
    reset,
    get token() {
      return token;
    },
  };
}
