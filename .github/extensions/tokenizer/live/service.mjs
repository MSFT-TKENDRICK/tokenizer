// Node-only Live engine. ONE copy, consumed by BOTH the canvas extension and the
// Vite dev plugin. Drives the Copilot SDK with a hard security lockdown:
//   mode:"empty" + availableTools:[] + deny-all onPermissionRequest + streaming.
// So pasted text / prompt injection can never run shell or edit files under the
// user's identity. See plan + rubber-duck consensus (C2/C3).

import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { ENGINE_STATUS, toSdkModelId } from "../web/protocol.mjs";

const CHAT_TIMEOUT_MS = 120_000;
const SESSION_TTL_MS = 30 * 60_000;
const MAX_SESSIONS = 8;

// Deny every tool-permission request. With availableTools:[] this should never
// fire, but omitting it would let any request hang forever (SDK contract).
function denyAll() {
  return { kind: "reject", feedback: "Live tokenizer chat does not run tools." };
}

export function createLiveService({ resolve, logger } = {}) {
  const log = typeof logger === "function" ? logger : () => {};
  const resolver = typeof resolve === "function" ? resolve : () => null;

  let engineStatus = ENGINE_STATUS.unavailable;
  let startPromise = null;
  let runtime = null; // { client, auth, models:[{id,name}], baseDirectory }
  const sessions = new Map(); // conversationId -> { session, sdkModelId, lastUsed, busy }

  function available() {
    return resolver() != null;
  }

  async function ensureRuntime() {
    if (runtime) return runtime;
    if (!startPromise) {
      const resolved = resolver();
      if (!resolved) {
        engineStatus = ENGINE_STATUS.unavailable;
        throw new Error("Copilot SDK or CLI runtime not found");
      }
      engineStatus = ENGINE_STATUS.warming;
      startPromise = (async () => {
        const sdk = await resolved.load();
        const { CopilotClient, RuntimeConnection } = sdk;
        const baseDirectory = mkdtempSync(join(tmpdir(), "copilot-tokenizer-live-"));
        const client = new CopilotClient({
          mode: "empty",
          baseDirectory,
          connection: RuntimeConnection.forStdio({ path: resolved.cliPath }),
          logLevel: "error",
        });
        await client.start();
        const [auth, models] = await Promise.all([
          client.getAuthStatus().catch(() => ({ isAuthenticated: false })),
          client.listModels().catch(() => []),
        ]);
        runtime = {
          client,
          auth,
          baseDirectory,
          models: models.map((m) => ({ id: m.id, name: m.name })),
        };
        engineStatus = ENGINE_STATUS.ready;
        return runtime;
      })().catch((error) => {
        engineStatus = ENGINE_STATUS.unavailable;
        startPromise = null;
        log(`live warm-up failed: ${error.message}`);
        throw error;
      });
    }
    return startPromise;
  }

  // Begin warming the runtime in the background without blocking the caller.
  function warm() {
    if (!runtime && available()) {
      ensureRuntime().catch(() => {
        /* surfaced via status().engineStatus === "unavailable" */
      });
    }
  }

  async function status() {
    warm();
    if (!available()) {
      return { available: false, authenticated: false, engineStatus: ENGINE_STATUS.unavailable, models: [] };
    }
    if (runtime) {
      return {
        available: true,
        authenticated: Boolean(runtime.auth?.isAuthenticated),
        login: runtime.auth?.login,
        engineStatus: ENGINE_STATUS.ready,
        models: runtime.models,
      };
    }
    return { available: true, authenticated: false, engineStatus, models: [] };
  }

  function resolveModelId(catalogModelId) {
    const mapped = toSdkModelId(catalogModelId);
    const models = runtime?.models ?? [];
    if (models.length === 0) return mapped ?? "auto";
    if (mapped && models.some((m) => m.id === mapped)) return mapped;
    return models.some((m) => m.id === "auto") ? "auto" : models[0].id;
  }

  async function disposeSession(conversationId) {
    const entry = sessions.get(conversationId);
    if (!entry) return;
    sessions.delete(conversationId);
    try {
      await entry.session.abort();
    } catch {
      /* best effort */
    }
    try {
      await entry.session.disconnect();
    } catch {
      /* best effort */
    }
  }

  function evictStaleSessions() {
    const now = Date.now();
    for (const [id, entry] of sessions) {
      if (!entry.busy && now - entry.lastUsed > SESSION_TTL_MS) {
        disposeSession(id).catch(() => {});
      }
    }
    while (sessions.size > MAX_SESSIONS) {
      let oldestId = null;
      let oldest = Infinity;
      for (const [id, entry] of sessions) {
        if (!entry.busy && entry.lastUsed < oldest) {
          oldest = entry.lastUsed;
          oldestId = id;
        }
      }
      if (oldestId == null) break;
      disposeSession(oldestId).catch(() => {});
    }
  }

  async function getSession(conversationId, sdkModelId) {
    let entry = sessions.get(conversationId);
    if (entry && entry.sdkModelId !== sdkModelId) {
      try {
        await entry.session.setModel(sdkModelId);
        entry.sdkModelId = sdkModelId;
      } catch {
        await disposeSession(conversationId);
        entry = undefined;
      }
    }
    if (!entry) {
      const { client } = await ensureRuntime();
      const session = await client.createSession({
        model: sdkModelId,
        availableTools: [],
        streaming: true,
        onPermissionRequest: denyAll,
      });
      entry = { session, sdkModelId, lastUsed: Date.now(), busy: false };
      sessions.set(conversationId, entry);
    }
    return entry;
  }

  async function chat({ conversationId, model, message, onDelta, onUsage, signal }) {
    if (!conversationId) throw new Error("conversationId is required");
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new Error("message is required");
    }
    await ensureRuntime();
    evictStaleSessions();

    const sdkModelId = resolveModelId(model);
    const entry = await getSession(conversationId, sdkModelId);
    if (entry.busy) {
      const error = new Error("conversation already has a response in flight");
      error.code = "busy";
      throw error;
    }
    entry.busy = true;
    entry.lastUsed = Date.now();

    const { session } = entry;
    const unsubscribers = [];
    let streamed = "";

    unsubscribers.push(
      session.on("assistant.message_delta", (event) => {
        const delta = event?.data?.deltaContent ?? "";
        if (delta) {
          streamed += delta;
          onDelta?.(delta);
        }
      }),
    );
    unsubscribers.push(
      session.on("assistant.usage", (event) => {
        const usage = event?.data;
        // Only top-level (user-initiated) API calls; ignore tool/sub-call usage.
        if (usage && !usage.parentToolCallId && (usage.initiator === undefined || usage.initiator === "user")) {
          onUsage?.(usage);
        }
      }),
    );

    const onAbort = () => {
      session.abort().catch(() => {});
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const final = await session.sendAndWait(message, CHAT_TIMEOUT_MS);
      return { content: final?.data?.content ?? streamed, sdkModelId };
    } catch (error) {
      // sendAndWait's timeout does NOT abort in-flight work — do it explicitly.
      try {
        await session.abort();
      } catch {
        /* best effort */
      }
      throw error;
    } finally {
      for (const off of unsubscribers) {
        try {
          off?.();
        } catch {
          /* best effort */
        }
      }
      signal?.removeEventListener?.("abort", onAbort);
      entry.busy = false;
      entry.lastUsed = Date.now();
    }
  }

  async function reset(conversationId) {
    if (conversationId) await disposeSession(conversationId);
  }

  async function dispose() {
    for (const id of [...sessions.keys()]) {
      await disposeSession(id);
    }
    if (runtime?.client) {
      try {
        await runtime.client.stop();
      } catch {
        /* best effort */
      }
    }
    if (runtime?.baseDirectory) {
      try {
        rmSync(runtime.baseDirectory, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
    runtime = null;
    startPromise = null;
    engineStatus = ENGINE_STATUS.unavailable;
  }

  return { status, chat, reset, dispose, warm, available };
}
