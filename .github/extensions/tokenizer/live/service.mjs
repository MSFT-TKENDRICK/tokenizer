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
  let disposed = false;
  const sessions = new Map(); // conversationId -> { session, sdkModelId, lastUsed, busy }
  const pendingSessions = new Map(); // conversationId -> Promise<entry> (in-flight create)

  function available() {
    return resolver() != null;
  }

  async function ensureRuntime() {
    // Check disposed BEFORE returning the cached runtime: every session-create path
    // funnels through here, so this is the single choke point that guarantees no new
    // SDK session/subprocess is spawned once teardown has begun (even if a late
    // setModel failure re-routes an in-flight chat into acquireFreshSession).
    if (disposed) throw new Error("Live service disposed");
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
        let client;
        try {
          client = new CopilotClient({
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
          // dispose() may have run while we were warming; don't publish a runtime
          // onto a discarded service — that would orphan the spawned subprocess.
          if (disposed) throw new Error("Live service disposed during warm-up");
          runtime = {
            client,
            auth,
            baseDirectory,
            models: models.map((m) => ({ id: m.id, name: m.name })),
          };
          engineStatus = ENGINE_STATUS.ready;
          return runtime;
        } catch (error) {
          // Tear down the partially-started client + temp dir on any failure so a
          // failed/aborted warm-up never leaks a process or directory.
          if (client) {
            try {
              await client.stop();
            } catch {
              /* best effort */
            }
          }
          try {
            rmSync(baseDirectory, { recursive: true, force: true });
          } catch {
            /* best effort */
          }
          throw error;
        }
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

  async function status({ warm: shouldWarm = true } = {}) {
    if (shouldWarm) warm();
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
    // Model list unknown (listModels failed/empty): fall back to "auto", which the
    // runtime always accepts, rather than forwarding an unvalidated catalog id.
    if (models.length === 0) return "auto";
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

  // Atomically reserve an entry for a turn. Synchronous (no await between the busy
  // check and the set) so two concurrent callers can never both win the lock.
  function reserve(entry) {
    if (entry.busy) {
      const error = new Error("conversation already has a response in flight");
      error.code = "busy";
      throw error;
    }
    entry.busy = true;
    entry.lastUsed = Date.now();
  }

  // Create (or join an in-flight create of) a session for a brand-new conversation,
  // then reserve it. Dedupes concurrent first-creates so two racing requests can't
  // each spawn an SDK session and orphan one of them.
  async function acquireFreshSession(conversationId, sdkModelId) {
    let pending = pendingSessions.get(conversationId);
    if (!pending) {
      pending = (async () => {
        const { client } = await ensureRuntime();
        // dispose() may have flipped between ensureRuntime resolving and the create
        // below — never spawn a subprocess we'd immediately orphan. (Defense in depth
        // with ensureRuntime's own disposed guard.)
        if (disposed) {
          const error = new Error("Live service disposed");
          error.code = "disposed";
          throw error;
        }
        const session = await client.createSession({
          model: sdkModelId,
          availableTools: [],
          streaming: true,
          onPermissionRequest: denyAll,
        });
        const created = { session, sdkModelId, lastUsed: Date.now(), busy: false };
        sessions.set(conversationId, created);
        return created;
      })();
      pendingSessions.set(conversationId, pending);
      pending
        .catch(() => {})
        .finally(() => {
          if (pendingSessions.get(conversationId) === pending) {
            pendingSessions.delete(conversationId);
          }
        });
    }
    const entry = await pending;
    // Reserve synchronously after the shared create resolves: the first of two
    // racing callers wins, the second observes busy and is rejected (no orphan).
    reserve(entry);
    return entry;
  }

  // Get-or-create the conversation's session and reserve it for one turn. The
  // reservation is taken BEFORE any awaited model switch, so a concurrent send can
  // neither run a second turn nor swap the model underneath an in-flight one.
  async function acquireSession(conversationId, sdkModelId) {
    const existing = sessions.get(conversationId);
    if (existing) {
      reserve(existing);
      if (existing.sdkModelId !== sdkModelId) {
        try {
          await existing.session.setModel(sdkModelId);
          existing.sdkModelId = sdkModelId;
        } catch {
          // setModel failed: drop the (now-removed) session and create a fresh one,
          // which carries its own reservation.
          await disposeSession(conversationId);
          return acquireFreshSession(conversationId, sdkModelId);
        }
      }
      return existing;
    }
    return acquireFreshSession(conversationId, sdkModelId);
  }

  async function chat({ conversationId, model, message, onDelta, onUsage, signal }) {
    if (disposed) {
      const error = new Error("Live service disposed");
      error.code = "disposed";
      throw error;
    }
    if (!conversationId) throw new Error("conversationId is required");
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new Error("message is required");
    }
    await ensureRuntime();
    evictStaleSessions();

    const sdkModelId = resolveModelId(model);
    // acquireSession reserves the entry (busy) under the lock, or throws
    // { code: "busy" } if a turn is already in flight for this conversation.
    const entry = await acquireSession(conversationId, sdkModelId);

    const { session } = entry;
    const unsubscribers = [];
    let streamed = "";
    const onAbort = () => {
      session.abort().catch(() => {});
    };

    try {
      // The client may have disconnected (or the service been disposed) while we
      // were creating/locking the session — bail before spending a whole turn.
      if (disposed || signal?.aborted) {
        const error = new Error("live chat aborted");
        error.code = "aborted";
        throw error;
      }

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
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

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
    disposed = true;
    // Wait out any in-flight warm-up so we stop the client it produces instead of
    // letting it publish a runtime onto this now-discarded service.
    if (startPromise) {
      try {
        await startPromise;
      } catch {
        /* warm-up failed or self-aborted on the disposed flag */
      }
    }
    // Wait out any in-flight session creates too, so a late createSession() can't
    // resolve a live session onto this disposed service after we've torn down.
    if (pendingSessions.size) {
      await Promise.allSettled([...pendingSessions.values()]);
    }
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
