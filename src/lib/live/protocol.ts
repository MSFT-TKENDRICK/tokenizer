// TS mirror of .github/extensions/tokenizer/web/protocol.mjs for the React app.
// A Vitest (protocol.parity.test.mjs) deep-equals the constant values so the
// JS/TS seam can't silently drift. Keep the two files in lockstep.

export const LIVE_ENDPOINTS = { status: "status", chat: "chat", reset: "reset" } as const;

export const SSE_EVENTS = {
  ready: "ready",
  delta: "delta",
  usage: "usage",
  message: "message",
  error: "error",
  done: "done",
} as const;

export const ENGINE_STATUS = {
  // Not resolvable (no SDK/CLI on this host) or not yet warmed.
  unavailable: "unavailable",
  warming: "warming",
  ready: "ready",
  // Resolvable but the runtime failed to initialize (e.g. handshake timeout or a
  // broken/mismatched CLI). Distinct from "unavailable" so the UI can surface a
  // retryable "Live unavailable" while keeping Simulated working.
  error: "error",
} as const;

export const SDK_MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-pro": "gemini-3.1-pro-preview",
  "mai-code-1-flash": "mai-code-1-flash-internal",
};

export type EngineStatus = (typeof ENGINE_STATUS)[keyof typeof ENGINE_STATUS];

export interface LiveModelInfo {
  id: string;
  name: string;
}

export interface LiveStatus {
  available: boolean;
  authenticated: boolean;
  login?: string;
  engineStatus: EngineStatus;
  models: LiveModelInfo[];
  token?: string;
}

export interface LiveUsage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  cost?: number;
}

export function toSdkModelId(catalogId: string | undefined): string | undefined {
  if (!catalogId) return undefined;
  return SDK_MODEL_ALIASES[catalogId] ?? catalogId;
}

export function joinLivePath(base: string, endpoint: string): string {
  const left = String(base ?? "").replace(/\/+$/, "");
  return `${left}/${endpoint}`;
}
