// @vitest-environment node
import http from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { handleLiveRequest } from "../../../.github/extensions/tokenizer/live/httpHandler.mjs";

const TOKEN = "unit-test-token";
const servers = [];

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

function startServer(service) {
  const server = http.createServer((req, res) => {
    handleLiveRequest(req, res, service, { basePath: "/live", token: TOKEN }).then((handled) => {
      if (!handled && !res.writableEnded) {
        res.writeHead(404);
        res.end();
      }
    });
  });
  servers.push(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}/live`;
}

describe("handleLiveRequest (loopback HTTP/SSE adapter)", () => {
  it("streams a chat to completion without a premature abort", async () => {
    const record = { aborted: false, completed: false };
    const server = await startServer({
      async chat({ signal, onDelta }) {
        for (let i = 0; i < 4; i += 1) {
          if (signal?.aborted) {
            record.aborted = true;
            throw Object.assign(new Error("aborted"), { code: "aborted" });
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
          onDelta?.(`d${i} `);
        }
        record.completed = true;
        return { content: "final", sdkModelId: "auto" };
      },
    });

    const res = await fetch(`${baseUrl(server)}/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "c1", model: "auto", message: "hi" }),
    });
    const text = await res.text();
    const events = [...text.matchAll(/event: (\w+)/g)].map((m) => m[1]);

    expect(record.completed).toBe(true);
    expect(record.aborted).toBe(false);
    expect(events).toContain("message");
    expect(events).toContain("done");
  });

  it("aborts the in-flight chat when the client disconnects mid-stream", async () => {
    // Regression guard: the disconnect signal for a POST/SSE response is the
    // response socket closing (`res` 'close'), not the already-consumed request
    // stream. Listening on `req` 'close' here never fired, so a real Copilot turn
    // would keep running after the browser navigated away or closed the iframe.
    const record = { started: false, aborted: false, completed: false };
    const server = await startServer({
      async chat({ signal, onDelta }) {
        record.started = true;
        for (let i = 0; i < 40; i += 1) {
          if (signal?.aborted) {
            record.aborted = true;
            throw Object.assign(new Error("aborted"), { code: "aborted" });
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
          onDelta?.(`d${i} `);
        }
        record.completed = true;
        return { content: "final", sdkModelId: "auto" };
      },
    });

    const controller = new AbortController();
    await fetch(`${baseUrl(server)}/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "c2", model: "auto", message: "hi" }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const reader = res.body.getReader();
        await reader.read(); // consume the first SSE frame, then bail
        controller.abort();
      })
      .catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 400)); // let the server observe the close

    expect(record.started).toBe(true);
    expect(record.aborted).toBe(true);
    expect(record.completed).toBe(false);
  });

  it("gates /reset on the bearer token and disposes the conversation's session", async () => {
    const reset = [];
    const server = await startServer({
      async reset(conversationId) {
        reset.push(conversationId);
      },
    });

    const unauthorized = await fetch(`${baseUrl(server)}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "c3" }),
    });
    expect(unauthorized.status).toBe(401);
    expect(reset).toEqual([]);

    const authorized = await fetch(`${baseUrl(server)}/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "c3" }),
    });
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({ ok: true });
    expect(reset).toEqual(["c3"]);
  });

  it("passes warm:false to the service only when the probe sends ?warm=0", async () => {
    const calls = [];
    const server = await startServer({
      async status(options) {
        calls.push(options);
        return { available: true, authenticated: false, engineStatus: "unavailable", models: [] };
      },
    });

    const warmRes = await fetch(`${baseUrl(server)}/status`);
    expect(warmRes.status).toBe(200);

    const probeRes = await fetch(`${baseUrl(server)}/status?warm=0`);
    expect(probeRes.status).toBe(200);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ warm: true });
    expect(calls[1]).toEqual({ warm: false });
  });
});
