import { describe, expect, it } from "vitest";

// Unit-test the real Live engine against a fake SDK (no CLI spawn). Validates
// the security lockdown, streaming, model mapping, busy gate, and lifecycle.
import { createLiveService } from "../../../.github/extensions/tokenizer/live/service.mjs";

function makeFakeSession() {
  const handlers = new Map();
  const calls = { createOpts: null, aborted: 0, disconnected: 0, setModel: [] };
  let setModelGate = null;
  const session = {
    calls,
    // Test hook: make the NEXT setModel() block on `promise` so a concurrent send
    // can race against an in-flight model switch.
    gateSetModel(promise) {
      setModelGate = promise;
    },
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    emit(type, data) {
      for (const h of handlers.get(type) ?? []) h({ type, data });
    },
    async sendAndWait(message) {
      session.emit("assistant.message_delta", { deltaContent: "po" });
      session.emit("assistant.message_delta", { deltaContent: "ng" });
      session.emit("assistant.usage", { initiator: "user", inputTokens: 10, outputTokens: 2 });
      // tool sub-call usage that MUST be filtered out:
      session.emit("assistant.usage", { initiator: "user", parentToolCallId: "t1", inputTokens: 99 });
      return { data: { content: `echo:${message}` } };
    },
    async abort() {
      calls.aborted += 1;
    },
    async disconnect() {
      calls.disconnected += 1;
    },
    async setModel(model) {
      if (setModelGate) {
        const gate = setModelGate;
        setModelGate = null;
        await gate;
      }
      calls.setModel.push(model);
    },
  };
  return session;
}

function makeFakeSdk({ models } = {}) {
  const created = [];
  let stopped = 0;
  const sdk = {
    RuntimeConnection: { forStdio: ({ path }) => ({ kind: "stdio", path }) },
    CopilotClient: class {
      constructor(opts) {
        this.opts = opts;
        this.allSessions = [];
        created.push(this);
      }
      async start() {}
      async stop() {
        stopped += 1;
      }
      async getAuthStatus() {
        return { isAuthenticated: true, login: "tester" };
      }
      async listModels() {
        return (
          models ?? [
            { id: "auto", name: "Auto" },
            { id: "gpt-5.5", name: "GPT-5.5" },
            { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
          ]
        );
      }
      async createSession(opts) {
        const session = makeFakeSession();
        session.calls.createOpts = opts;
        this.lastSession = session;
        this.allSessions.push(session);
        return session;
      }
    },
    _created: created,
    get _stopped() {
      return stopped;
    },
  };
  return sdk;
}

function makeService(sdk = makeFakeSdk()) {
  const resolve = () => ({ cliPath: "C:/fake/copilot.exe", async load() { return sdk; } });
  return { service: createLiveService({ resolve }), sdk };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function waitReady(service) {
  for (let i = 0; i < 50 && (await service.status()).engineStatus !== "ready"; i++) await tick();
}

describe("createLiveService", () => {
  it("reports unavailable when resolver returns null", async () => {
    const service = createLiveService({ resolve: () => null });
    const status = await service.status();
    expect(status.available).toBe(false);
    expect(status.engineStatus).toBe("unavailable");
  });

  it("warms in the background then reports ready with models", async () => {
    const { service } = makeService();
    const first = await service.status();
    expect(first.available).toBe(true);
    expect(first.engineStatus).toBe("warming");
    await waitReady(service);
    const ready = await service.status();
    expect(ready.engineStatus).toBe("ready");
    expect(ready.authenticated).toBe(true);
    expect(ready.login).toBe("tester");
    expect(ready.models.map((m) => m.id)).toContain("gpt-5.5");
    await service.dispose();
  });

  it("times out a wedged warm-up, reports engineStatus 'error', tears the client down, and cools down", async () => {
    let constructed = 0;
    let started = 0;
    let stopped = 0;
    const sdk = {
      RuntimeConnection: { forStdio: ({ path }) => ({ kind: "stdio", path }) },
      CopilotClient: class {
        constructor() {
          constructed += 1;
        }
        async start() {
          started += 1;
          await new Promise(() => {}); // never resolves -> warm-up must time out
        }
        async stop() {
          stopped += 1;
        }
        async getAuthStatus() {
          return { isAuthenticated: true };
        }
        async listModels() {
          return [{ id: "auto", name: "Auto" }];
        }
        async createSession() {
          return makeFakeSession();
        }
      },
    };
    const service = createLiveService({
      resolve: () => ({ cliPath: "C:/fake/copilot.exe", async load() { return sdk; } }),
      warmupTimeoutMs: 20,
      warmupRetryCooldownMs: 10_000,
    });

    const warming = await service.status();
    expect(warming.engineStatus).toBe("warming");

    // Let the bounded handshake time out and flip the engine to a terminal "error".
    await new Promise((r) => setTimeout(r, 80));
    const failed = await service.status({ warm: false });
    expect(failed.available).toBe(true); // resolvable, just failed to initialize
    expect(failed.engineStatus).toBe("error");
    expect(started).toBe(1);
    expect(stopped).toBe(1); // the wedged client is torn down, not leaked

    // Within the cooldown, a warming poll must NOT spawn a second doomed runtime.
    await service.status({ warm: true });
    await tick();
    expect(constructed).toBe(1);

    await service.dispose();
  });

  it("creates locked-down sessions (no tools, streaming, deny-all)", async () => {
    const { service, sdk } = makeService();
    await service.chat({ conversationId: "c1", model: "auto", message: "hi" });
    const opts = sdk._created[0].lastSession.calls.createOpts;
    expect(opts.availableTools).toEqual([]);
    expect(opts.streaming).toBe(true);
    expect(typeof opts.onPermissionRequest).toBe("function");
    expect(opts.onPermissionRequest()).toMatchObject({ kind: "reject" });
    await service.dispose();
  });

  it("streams deltas, returns final content, and filters tool-call usage", async () => {
    const { service } = makeService();
    const deltas = [];
    const usages = [];
    const result = await service.chat({
      conversationId: "c1",
      model: "auto",
      message: "ping",
      onDelta: (d) => deltas.push(d),
      onUsage: (u) => usages.push(u),
    });
    expect(deltas.join("")).toBe("pong");
    expect(result.content).toBe("echo:ping");
    expect(usages).toHaveLength(1); // tool sub-call usage filtered out
    expect(usages[0].inputTokens).toBe(10);
    await service.dispose();
  });

  it("maps divergent catalog ids and falls back for unavailable ids", async () => {
    const { service, sdk } = makeService();
    await service.chat({ conversationId: "g", model: "gemini-3.1-pro", message: "x" });
    const client = sdk._created[0];
    expect(client.lastSession.calls.createOpts.model).toBe("gemini-3.1-pro-preview");

    await service.chat({ conversationId: "u", model: "does-not-exist", message: "x" });
    expect(client.lastSession.calls.createOpts.model).toBe("auto");
    await service.dispose();
  });

  it("reset disposes the conversation session", async () => {
    const { service, sdk } = makeService();
    await service.chat({ conversationId: "c1", model: "auto", message: "hi" });
    const session = sdk._created[0].lastSession;
    await service.reset("c1");
    expect(session.calls.disconnected).toBeGreaterThanOrEqual(1);
    await service.dispose();
  });

  it("dispose stops the client", async () => {
    const { service, sdk } = makeService();
    await service.chat({ conversationId: "c1", model: "auto", message: "hi" });
    await service.dispose();
    expect(sdk._stopped).toBe(1);
  });

  it("dedupes concurrent first sends for one conversation (no orphaned session)", async () => {
    const { service, sdk } = makeService();
    const results = await Promise.allSettled([
      service.chat({ conversationId: "dup", model: "auto", message: "a" }),
      service.chat({ conversationId: "dup", model: "auto", message: "b" }),
    ]);
    // Exactly one SDK session is created for the shared conversation id...
    expect(sdk._created[0].allSessions).toHaveLength(1);
    // ...and the racing second caller is rejected by the busy gate, not run on a
    // second (orphaned) session.
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe("busy");
    await service.dispose();
  });

  it("falls back to auto when the runtime model list is empty", async () => {
    const { service, sdk } = makeService(makeFakeSdk({ models: [] }));
    await service.chat({ conversationId: "c1", model: "gpt-5.5", message: "hi" });
    expect(sdk._created[0].lastSession.calls.createOpts.model).toBe("auto");
    await service.dispose();
  });

  it("disposing during warm-up stops the partial client and never publishes a runtime", async () => {
    let releaseStart;
    const startGate = new Promise((resolve) => {
      releaseStart = resolve;
    });
    let started = 0;
    let stopped = 0;
    const sdk = {
      RuntimeConnection: { forStdio: ({ path }) => ({ kind: "stdio", path }) },
      CopilotClient: class {
        async start() {
          started += 1;
          await startGate;
        }
        async stop() {
          stopped += 1;
        }
        async getAuthStatus() {
          return { isAuthenticated: true };
        }
        async listModels() {
          return [{ id: "auto", name: "Auto" }];
        }
        async createSession() {
          return makeFakeSession();
        }
      },
    };
    const service = createLiveService({
      resolve: () => ({ cliPath: "C:/fake/copilot.exe", async load() { return sdk; } }),
    });
    const warming = await service.status();
    expect(warming.engineStatus).toBe("warming");

    const disposing = service.dispose();
    releaseStart();
    await disposing;

    expect(started).toBe(1);
    expect(stopped).toBe(1); // partial client torn down by the warm-up catch
    const after = await service.status();
    expect(after.engineStatus).toBe("unavailable");
  });

  it("locks the session before switching models so a concurrent send is rejected", async () => {
    let releaseSetModel;
    const setModelGate = new Promise((resolve) => {
      releaseSetModel = resolve;
    });
    const { service, sdk } = makeService();
    // Seed an existing session for the conversation (model "auto").
    await service.chat({ conversationId: "c1", model: "auto", message: "first" });
    const session = sdk._created[0].lastSession;
    // Make the next model switch block so we can race a second send against it.
    session.gateSetModel(setModelGate);

    // Attach the settle handler synchronously so the loser's "busy" rejection is
    // never momentarily unhandled during the tick below.
    const settle = (p) => p.then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
    const a = settle(service.chat({ conversationId: "c1", model: "gpt-5.5", message: "A" }));
    const b = settle(service.chat({ conversationId: "c1", model: "gpt-5.5", message: "B" }));
    await tick(); // let both reach acquireSession; B must observe A's reservation
    releaseSetModel();
    const results = await Promise.all([a, b]);

    // Exactly one caller is rejected as busy — the model switch was NOT racy.
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe("busy");
    // setModel ran exactly once (no concurrent re-model of the live session)...
    expect(session.calls.setModel).toEqual(["gpt-5.5"]);
    // ...and still only one session exists for the conversation (no orphan).
    expect(sdk._created[0].allSessions).toHaveLength(1);
    await service.dispose();
  });

  it("disposing during session creation tears the new session down (no orphan)", async () => {
    let releaseCreate;
    const createGate = new Promise((resolve) => {
      releaseCreate = resolve;
    });
    let createdSession = null;
    let stopped = 0;
    const sdk = {
      RuntimeConnection: { forStdio: ({ path }) => ({ kind: "stdio", path }) },
      CopilotClient: class {
        constructor() {
          this.allSessions = [];
        }
        async start() {}
        async stop() {
          stopped += 1;
        }
        async getAuthStatus() {
          return { isAuthenticated: true };
        }
        async listModels() {
          return [{ id: "auto", name: "Auto" }];
        }
        async createSession() {
          await createGate;
          createdSession = makeFakeSession();
          this.allSessions.push(createdSession);
          return createdSession;
        }
      },
    };
    const service = createLiveService({
      resolve: () => ({ cliPath: "C:/fake/copilot.exe", async load() { return sdk; } }),
    });
    await waitReady(service);

    // Start a chat; it blocks inside createSession.
    const chatResult = service.chat({ conversationId: "c1", model: "auto", message: "hi" }).catch((e) => e);
    await tick();
    // Dispose while the create is still in flight; it must wait the create out.
    const disposing = service.dispose();
    await tick();
    releaseCreate();
    await disposing;
    const settled = await chatResult;

    // The session that was created during disposal is disconnected, not leaked...
    expect(createdSession).not.toBeNull();
    expect(createdSession.calls.disconnected).toBeGreaterThanOrEqual(1);
    // ...the runtime client is stopped, and the racing chat is rejected, not run.
    expect(stopped).toBe(1);
    expect(settled).toBeInstanceOf(Error);
    expect((await service.status()).engineStatus).toBe("unavailable");
  });

  it("never spawns a replacement session once disposed (setModel fails mid-teardown)", async () => {
    let releaseStop;
    const stopGate = new Promise((resolve) => {
      releaseStop = resolve;
    });
    let releaseSetModel;
    const setModelGate = new Promise((resolve) => {
      releaseSetModel = resolve;
    });
    let createCount = 0;
    let firstSession = null;
    const sdk = {
      RuntimeConnection: { forStdio: ({ path }) => ({ kind: "stdio", path }) },
      CopilotClient: class {
        async start() {}
        async stop() {
          await stopGate;
        }
        async getAuthStatus() {
          return { isAuthenticated: true };
        }
        async listModels() {
          return [
            { id: "auto", name: "Auto" },
            { id: "gpt-5.5", name: "GPT-5.5" },
          ];
        }
        async createSession() {
          createCount += 1;
          const session = makeFakeSession();
          if (!firstSession) {
            firstSession = session;
            // The seeded session's next model switch blocks, then fails — exactly
            // when dispose() is mid-teardown.
            session.setModel = async () => {
              await setModelGate;
              throw new Error("setModel failed");
            };
          }
          return session;
        }
      },
    };
    const service = createLiveService({
      resolve: () => ({ cliPath: "C:/fake/copilot.exe", async load() { return sdk; } }),
    });
    await waitReady(service);
    await service.chat({ conversationId: "c1", model: "auto", message: "seed" });
    expect(createCount).toBe(1);

    const chatResult = service.chat({ conversationId: "c1", model: "gpt-5.5", message: "x" }).catch((e) => e);
    await tick(); // parked inside the failing setModel
    const disposing = service.dispose(); // disposed=true; disposes c1; then parks in client.stop() (runtime still set)
    await tick();
    releaseSetModel(); // setModel rejects -> acquireSession catch -> acquireFreshSession must be blocked
    await tick();
    releaseStop();
    await disposing;
    const settled = await chatResult;

    expect(settled).toBeInstanceOf(Error);
    // No replacement session spawned after dispose began: still exactly one create.
    expect(createCount).toBe(1);
    expect((await service.status()).engineStatus).toBe("unavailable");
  });
});
