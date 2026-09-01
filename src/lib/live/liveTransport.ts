// Shared Live transport contract. `useLiveChat` depends ONLY on this interface, so
// any backend that satisfies it can drive the exact same Live chat UI:
//   - createLiveClient(baseUrl)  -> loopback engine (extension ambient auth + Vite
//     dev/preview plugin). Unchanged.
//   - createTokenLiveClient(...) -> browser-direct GitHub Models, gated by a
//     user-supplied token (the static website path).
// Keeping the contract in its own module lets both clients implement it without
// importing each other, and lets the hook stay transport-agnostic.

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
