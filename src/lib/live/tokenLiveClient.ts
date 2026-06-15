// Browser-direct Live client for the static website. Where the loopback client
// (createLiveClient) relies on an in-process engine with ambient GitHub auth, this
// client talks straight from the browser to GitHub Models using a user-supplied
// token, so the published GitHub Pages site (which has no backend) can still drive
// the exact same Live chat UI through the shared LiveClient contract.
//
// CORS note: browser fetch to api.github.com and models.github.ai is allowed
// (verified empirically — both return real HTTP statuses cross-origin), so no proxy
// is required. The token never leaves the browser except as a Bearer header on
// HTTPS requests to github.com hosts; it is held in memory only.

import { COPILOT_MODEL_OPTIONS, modelById } from "../copilotModels";
import { ENGINE_STATUS, toSdkModelId } from "./protocol";
import type { LiveModelInfo, LiveStatus, LiveUsage } from "./protocol";
import type { LiveChatHandlers, LiveChatRequest, LiveClient } from "./liveTransport";

const GITHUB_API_USER = "https://api.github.com/user";
const GITHUB_MODELS_CHAT = "https://models.github.ai/inference/chat/completions";

// GitHub Models only serves OpenAI-publisher models browser-side; the tokenizer's
// catalog is aspirational (Claude/Gemini/etc. aren't hosted there). We map every
// catalog id onto a guaranteed-present OpenAI model so the live demo always works,
// preferring the flagship for Versatile/Powerful tiers and the mini for Lightweight.
// The selector still tokenizes/prices the model the user picked; only the network
// call is routed. resolveGithubModelId is the single source of that mapping.
const GITHUB_MODELS_DEFAULT = "openai/gpt-4o-mini";
const GITHUB_MODELS_FLAGSHIP = "openai/gpt-4o";

export function resolveGithubModelId(catalogId: string): string {
  const model = modelById(catalogId);
  if (!model) return GITHUB_MODELS_DEFAULT;
  if (model.familyId === "openai") {
    return model.category === "Lightweight" ? GITHUB_MODELS_DEFAULT : GITHUB_MODELS_FLAGSHIP;
  }
  // Non-OpenAI families have no GitHub Models equivalent: route through the default
  // OpenAI model rather than submitting an id the endpoint would reject.
  return GITHUB_MODELS_DEFAULT;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TokenClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
}

function liveModelsFromCatalog(): LiveModelInfo[] {
  // Mirror the loopback engine's status.models shape so App's live-model gating
  // (which checks toSdkModelId(id)) behaves identically on the token path.
  return COPILOT_MODEL_OPTIONS.map((model) => ({
    id: toSdkModelId(model.id) ?? model.id,
    name: model.name,
  }));
}

export function createTokenLiveClient(options: TokenClientOptions): LiveClient {
  const token = options.token;
  const doFetch = options.fetchImpl ?? fetch;
  const histories = new Map<string, ChatMessage[]>();

  async function getStatus(): Promise<LiveStatus> {
    let res: Response;
    try {
      res = await doFetch(GITHUB_API_USER, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      });
    } catch {
      // Network/DNS failure — treat as unavailable so the UI can offer a retry
      // rather than implying the token is wrong.
      return { available: false, authenticated: false, engineStatus: ENGINE_STATUS.unavailable, models: [] };
    }
    if (res.ok) {
      let login: string | undefined;
      try {
        const data = (await res.json()) as { login?: string };
        login = typeof data.login === "string" ? data.login : undefined;
      } catch {
        /* a valid token with an unreadable body is still authenticated */
      }
      return {
        available: true,
        authenticated: true,
        login,
        engineStatus: ENGINE_STATUS.ready,
        models: liveModelsFromCatalog(),
      };
    }
    // Reached GitHub but the token was rejected (401) or lacks access (403):
    // available so Live stays selectable, unauthenticated so the UI prompts for a
    // valid token instead of showing a dead engine.
    return { available: true, authenticated: false, engineStatus: ENGINE_STATUS.ready, models: [] };
  }

  function parseUsage(raw: unknown): LiveUsage | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const usage = raw as { prompt_tokens?: number; completion_tokens?: number };
    if (typeof usage.prompt_tokens !== "number" && typeof usage.completion_tokens !== "number") {
      return undefined;
    }
    return { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
  }

  async function streamChat(request: LiveChatRequest, handlers: LiveChatHandlers = {}): Promise<void> {
    const prior = histories.get(request.conversationId) ?? [];
    const outbound: ChatMessage[] = [...prior, { role: "user", content: request.message }];
    const githubModel = resolveGithubModelId(request.model);

    let res: Response;
    try {
      res = await doFetch(GITHUB_MODELS_CHAT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: githubModel,
          messages: outbound,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal?.aborted) return;
      throw error instanceof Error ? error : new Error(String(error));
    }

    if (!res.ok || !res.body) {
      throw new Error(await describeHttpError(res));
    }

    handlers.onReady?.({ conversationId: request.conversationId });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
    let done = false;

    const handleData = (payload: string): void => {
      if (payload === "[DONE]") {
        done = true;
        return;
      }
      let json: {
        choices?: { delta?: { content?: string } }[];
        usage?: unknown;
      };
      try {
        json = JSON.parse(payload);
      } catch {
        return;
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        assistantText += delta;
        handlers.onDelta?.(delta);
      }
      const nextUsage = parseUsage(json.usage);
      if (nextUsage) handlers.onUsage?.(nextUsage);
    };

    // OpenAI-style SSE: events are separated by a blank line, which may be LF or
    // CRLF, and a usage-only or [DONE] frame may carry no delta. Split on either
    // newline style so CRLF transports don't hang the parser.
    const FRAME_SEPARATOR = /\r?\n\r?\n/;
    const processFrame = (frame: string): void => {
      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).replace(/^ /, "");
        if (payload) handleData(payload);
      }
    };

    try {
      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let match: RegExpExecArray | null;
        while ((match = FRAME_SEPARATOR.exec(buffer)) !== null) {
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          if (frame.trim()) processFrame(frame);
        }
        if (done) break;
      }
      // Flush any trailing frame that arrived without a terminating blank line.
      if (!done && buffer.trim()) processFrame(buffer);
    } catch (error) {
      if (request.signal?.aborted) return;
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      await reader.cancel().catch(() => {});
    }

    if (request.signal?.aborted) return;

    // Only now that the turn fully succeeded do we commit it to history, so an
    // aborted or failed turn never leaves a half-updated conversation that would
    // corrupt the next request's context.
    histories.set(request.conversationId, [...outbound, { role: "assistant", content: assistantText }]);
    handlers.onMessage?.(assistantText, { model: githubModel });
    handlers.onDone?.();
  }

  async function reset(conversationId: string): Promise<void> {
    histories.delete(conversationId);
  }

  return {
    getStatus,
    streamChat,
    reset,
    // The GitHub token deliberately stays inside this closure. Unlike the loopback
    // client (whose `token` is a low-sensitivity per-server CSRF value), exposing
    // the user's GitHub token through the public interface would surface it to React
    // state / DevTools, so the getter reports nothing.
    get token() {
      return undefined;
    },
  };
}

async function describeHttpError(res: Response): Promise<string> {
  // Surface the API's own error message when present, but never echo headers or the
  // token; fall back to the status line. Keeps error frames free of secrets.
  let detail = "";
  try {
    const body = await res.json();
    const message = (body as { error?: { message?: string }; message?: string })?.error?.message
      ?? (body as { message?: string })?.message;
    if (typeof message === "string") detail = message;
  } catch {
    /* non-JSON body */
  }
  if (res.status === 401) return "GitHub rejected the token (401). Check it has the models:read scope.";
  if (res.status === 403) return detail || "GitHub denied the request (403). The token may lack model access or be rate-limited.";
  if (res.status === 429) return "GitHub Models rate limit reached (429). Try again shortly.";
  return detail ? `GitHub Models error ${res.status}: ${detail}` : `GitHub Models request failed (${res.status}).`;
}
