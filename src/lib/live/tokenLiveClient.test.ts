import { describe, expect, it } from "vitest";

import { createTokenLiveClient, resolveGithubModelId } from "./tokenLiveClient";

const USER_URL = "https://api.github.com/user";
const CHAT_URL = "https://models.github.ai/inference/chat/completions";

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
  body: unknown;
}

function recordingFetch(handler: (url: string, init: RequestInit | undefined) => unknown) {
  const calls: FetchCall[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url: u, init, body });
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return handler(u, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function okUser(login = "octocat") {
  return { ok: true, status: 200, json: async () => ({ login }) };
}

describe("resolveGithubModelId", () => {
  it("maps lightweight OpenAI models to gpt-4o-mini and others to gpt-4o", () => {
    expect(resolveGithubModelId("gpt-5.4-mini")).toBe("openai/gpt-4o-mini");
    expect(resolveGithubModelId("gpt-5.5")).toBe("openai/gpt-4o");
  });

  it("routes non-OpenAI families and unknown ids through the safe default", () => {
    expect(resolveGithubModelId("claude-opus-4.8")).toBe("openai/gpt-4o-mini");
    expect(resolveGithubModelId("gemini-3.1-pro")).toBe("openai/gpt-4o-mini");
    expect(resolveGithubModelId("mai-code-1-flash")).toBe("openai/gpt-4o-mini");
    expect(resolveGithubModelId("does-not-exist")).toBe("openai/gpt-4o-mini");
  });
});

describe("createTokenLiveClient.getStatus", () => {
  it("reports authenticated + ready with a login and catalog models on 200", async () => {
    const { impl } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return okUser("monalisa");
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });
    const status = await client.getStatus();
    expect(status).toMatchObject({
      available: true,
      authenticated: true,
      login: "monalisa",
      engineStatus: "ready",
    });
    expect(status.models.length).toBeGreaterThan(0);
    expect(status.models.some((m) => m.id === "auto")).toBe(true);
  });

  it("treats a rejected token as reachable-but-unauthenticated (not a dead engine)", async () => {
    const { impl } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return { ok: false, status: 401, json: async () => ({}) };
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "bad", fetchImpl: impl });
    const status = await client.getStatus();
    expect(status.available).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.engineStatus).toBe("ready");
    expect(status.models).toHaveLength(0);
  });

  it("reports unavailable on a network failure so the UI can offer a retry", async () => {
    const impl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });
    const status = await client.getStatus();
    expect(status.available).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.engineStatus).toBe("unavailable");
  });

  it("sends the token as a Bearer header", async () => {
    const { impl, calls } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return okUser();
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "secret-token", fetchImpl: impl });
    await client.getStatus();
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("never exposes the GitHub token through the public client interface", () => {
    const impl = (async () => okUser()) as unknown as typeof fetch;
    const client = createTokenLiveClient({ token: "secret-token", fetchImpl: impl });
    expect(client.token).toBeUndefined();
  });
});

describe("createTokenLiveClient.streamChat", () => {
  function chatHandler(chunks: string[]) {
    return (url: string) => {
      if (url.startsWith(USER_URL)) return okUser();
      if (url.startsWith(CHAT_URL)) return { ok: true, status: 200, body: sseStream(chunks) };
      throw new Error(`unexpected ${url}`);
    };
  }

  const helloChunks = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
    "data: [DONE]\n\n",
  ];

  it("streams deltas, maps usage, and finalizes the message", async () => {
    const { impl } = recordingFetch(chatHandler(helloChunks));
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });

    const deltas: string[] = [];
    let usage: unknown;
    let final: string | undefined;
    let ready = false;
    let done = false;
    await client.streamChat(
      { conversationId: "c1", model: "auto", message: "hi" },
      {
        onReady: () => (ready = true),
        onDelta: (d) => deltas.push(d),
        onUsage: (u) => (usage = u),
        onMessage: (t) => (final = t),
        onDone: () => (done = true),
      },
    );

    expect(ready).toBe(true);
    expect(deltas.join("")).toBe("Hello");
    expect(final).toBe("Hello");
    expect(usage).toEqual({ inputTokens: 10, outputTokens: 2 });
    expect(done).toBe(true);
  });

  it("fires usage exactly once", async () => {
    const { impl } = recordingFetch(chatHandler(helloChunks));
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });
    let usageCalls = 0;
    await client.streamChat({ conversationId: "c1", model: "auto", message: "hi" }, { onUsage: () => (usageCalls += 1) });
    expect(usageCalls).toBe(1);
  });

  it("parses CRLF-framed SSE", async () => {
    const crlf = [
      'data: {"choices":[{"delta":{"content":"A"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}\r\n\r\n',
      "data: [DONE]\r\n\r\n",
    ];
    const { impl } = recordingFetch(chatHandler(crlf));
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });
    let final: string | undefined;
    await client.streamChat({ conversationId: "c1", model: "auto", message: "hi" }, { onMessage: (t) => (final = t) });
    expect(final).toBe("AB");
  });

  it("ignores a malformed JSON frame instead of crashing the stream", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      "data: {not valid json\n\n",
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const { impl } = recordingFetch(chatHandler(chunks));
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });
    let final: string | undefined;
    let done = false;
    await client.streamChat(
      { conversationId: "c1", model: "auto", message: "hi" },
      { onMessage: (t) => (final = t), onDone: () => (done = true) },
    );
    expect(final).toBe("Hello");
    expect(done).toBe(true);
  });

  it("surfaces a clear message on a 429 rate limit without leaking the token", async () => {
    const { impl } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return okUser();
      if (url.startsWith(CHAT_URL)) {
        return { ok: false, status: 429, body: null, json: async () => ({ message: "rate limited" }) };
      }
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "secret-token-value", fetchImpl: impl });
    await expect(
      client.streamChat({ conversationId: "c1", model: "auto", message: "hi" }, {}),
    ).rejects.toThrow(/rate limit/i);
    try {
      await client.streamChat({ conversationId: "c1", model: "auto", message: "hi" }, {});
    } catch (error) {
      expect(String(error)).not.toContain("secret-token-value");
    }
  });

  it("maps the selected catalog model to a GitHub Models id in the request body", async () => {
    const { impl, calls } = recordingFetch(chatHandler(helloChunks));
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });
    await client.streamChat({ conversationId: "c1", model: "claude-opus-4.8", message: "hi" }, {});
    const chatCall = calls.find((c) => c.url.startsWith(CHAT_URL));
    expect((chatCall?.body as { model: string }).model).toBe("openai/gpt-4o-mini");
    expect((chatCall?.body as { stream: boolean }).stream).toBe(true);
  });

  it("accumulates multi-turn history and replays it on the next send", async () => {
    let chunks = helloChunks;
    const { impl, calls } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return okUser();
      if (url.startsWith(CHAT_URL)) return { ok: true, status: 200, body: sseStream(chunks) };
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });

    await client.streamChat({ conversationId: "c1", model: "auto", message: "first" }, {});
    chunks = [
      'data: {"choices":[{"delta":{"content":"second-reply"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    await client.streamChat({ conversationId: "c1", model: "auto", message: "second" }, {});

    const chatCalls = calls.filter((c) => c.url.startsWith(CHAT_URL));
    expect((chatCalls[1].body as { messages: unknown[] }).messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "second" },
    ]);
  });

  it("keeps separate histories per conversation and clears one on reset", async () => {
    const { impl, calls } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return okUser();
      if (url.startsWith(CHAT_URL)) return { ok: true, status: 200, body: sseStream(helloChunks) };
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });

    await client.streamChat({ conversationId: "c1", model: "auto", message: "one" }, {});
    await client.reset("c1");
    await client.streamChat({ conversationId: "c1", model: "auto", message: "again" }, {});

    const chatCalls = calls.filter((c) => c.url.startsWith(CHAT_URL));
    expect((chatCalls[1].body as { messages: unknown[] }).messages).toEqual([{ role: "user", content: "again" }]);
  });

  it("does not commit history when the turn aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const { impl, calls } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return okUser();
      if (url.startsWith(CHAT_URL)) return { ok: true, status: 200, body: sseStream(helloChunks) };
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });

    let messaged = false;
    await client.streamChat(
      { conversationId: "c1", model: "auto", message: "aborted", signal: controller.signal },
      { onMessage: () => (messaged = true) },
    );
    expect(messaged).toBe(false);

    // A subsequent send must not replay the aborted user turn.
    await client.streamChat({ conversationId: "c1", model: "auto", message: "fresh" }, {});
    const chatCalls = calls.filter((c) => c.url.startsWith(CHAT_URL));
    const lastBody = chatCalls[chatCalls.length - 1].body as { messages: unknown[] };
    expect(lastBody.messages).toEqual([{ role: "user", content: "fresh" }]);
  });

  it("throws a scrubbed, helpful error on an HTTP failure", async () => {
    const { impl } = recordingFetch((url) => {
      if (url.startsWith(USER_URL)) return okUser();
      if (url.startsWith(CHAT_URL)) return { ok: false, status: 401, json: async () => ({ error: { message: "bad" } }) };
      throw new Error(`unexpected ${url}`);
    });
    const client = createTokenLiveClient({ token: "tok", fetchImpl: impl });
    await expect(client.streamChat({ conversationId: "c1", model: "auto", message: "hi" }, {})).rejects.toThrow(
      /models:read/,
    );
  });
});
