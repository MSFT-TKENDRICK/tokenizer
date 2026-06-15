import { describe, expect, it } from "vitest";

// Unit-test the real Live engine against a fake SDK (no CLI spawn). Validates
// the security lockdown, streaming, model mapping, busy gate, and lifecycle.
import { createLiveService } from "../../../.github/extensions/tokenizer/live/service.mjs";

function makeFakeSession() {
  const handlers = new Map();
  const calls = { createOpts: null, aborted: 0, disconnected: 0, setModel: [] };
  const session = {
    calls,
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
      calls.setModel.push(model);
    },
  };
  return session;
}

function makeFakeSdk() {
  const created = [];
  let stopped = 0;
  const sdk = {
    RuntimeConnection: { forStdio: ({ path }) => ({ kind: "stdio", path }) },
    CopilotClient: class {
      constructor(opts) {
        this.opts = opts;
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
        return [
          { id: "auto", name: "Auto" },
          { id: "gpt-5.5", name: "GPT-5.5" },
          { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
        ];
      }
      async createSession(opts) {
        const session = makeFakeSession();
        session.calls.createOpts = opts;
        this.lastSession = session;
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
});
