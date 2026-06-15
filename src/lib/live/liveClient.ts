// React-app Live client. TS mirror of
// .github/extensions/tokenizer/web/liveClient.mjs (same protocol, same SSE
// parsing). Holds the bearer token in memory and replays it on POST /chat.

import { LIVE_ENDPOINTS, SSE_EVENTS, joinLivePath } from "./protocol";
import type { LiveStatus, LiveUsage } from "./protocol";

export interface LiveChatRequest {
  conversationId: string;
  model: string;
  message: string;
  signal?: AbortSignal;
}

export interface LiveChatHandlers {
  onReady?: (data: { conversationId?: string }) => void;
  onDelta?: (text: string) => void;
  onUsage?: (usage: LiveUsage) => void;
  onMessage?: (text: string, data: { model?: string }) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export interface LiveClient {
  getStatus(options?: { warm?: boolean }): Promise<LiveStatus>;
  streamChat(request: LiveChatRequest, handlers?: LiveChatHandlers): Promise<void>;
  reset(conversationId: string): Promise<void>;
  readonly token: string | undefined;
}

export function createLiveClient(baseUrl: string): LiveClient {
  let token: string | undefined;

  async function getStatus(options?: { warm?: boolean }): Promise<LiveStatus> {
    const suffix = options?.warm === false ? "?warm=0" : "";
    const res = await fetch(joinLivePath(baseUrl, LIVE_ENDPOINTS.status) + suffix, { cache: "no-store" });
    if (!res.ok) throw new Error(`live status ${res.status}`);
    const data = (await res.json()) as LiveStatus;
    token = data.token;
    return data;
  }

  function dispatchFrame(frame: string, handlers: LiveChatHandlers): void {
    let event: string = SSE_EVENTS.message;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length === 0) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    switch (event) {
      case SSE_EVENTS.ready:
        handlers.onReady?.(data as { conversationId?: string });
        break;
      case SSE_EVENTS.delta:
        handlers.onDelta?.((data.text as string) ?? "");
        break;
      case SSE_EVENTS.usage:
        handlers.onUsage?.(data as LiveUsage);
        break;
      case SSE_EVENTS.message:
        handlers.onMessage?.((data.text as string) ?? "", data as { model?: string });
        break;
      case SSE_EVENTS.error:
        handlers.onError?.((data.message as string) ?? "live chat failed");
        break;
      case SSE_EVENTS.done:
        handlers.onDone?.();
        break;
      default:
        break;
    }
  }

  async function streamChat(request: LiveChatRequest, handlers: LiveChatHandlers = {}): Promise<void> {
    const res = await fetch(joinLivePath(baseUrl, LIVE_ENDPOINTS.chat), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        conversationId: request.conversationId,
        model: request.model,
        message: request.message,
      }),
      signal: request.signal,
    });
    if (!res.ok || !res.body) throw new Error(`live chat ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (frame.trim()) dispatchFrame(frame, handlers);
      }
    }
  }

  async function reset(conversationId: string): Promise<void> {
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
