import { describe, expect, it } from "vitest";
import {
  CopilotSdkInferenceProvider,
  DeterministicInferenceProvider,
  createInferenceProvider,
  buildBaselinePrompt,
} from "../src/sdk/inference.js";
import { buildFleetPrompt, toCustomAgentConfig, dispatchFleet } from "../src/sdk/fleet.js";
import { forgeSquad } from "../src/squad/forge.js";
import { deriveRoles } from "../src/squad/roles.js";
import { sampleSpec } from "./fixtures.js";

/** Fake Copilot SDK client that replays a single assistant message. */
function fakeInferenceClient(reply: string) {
  const state = { starts: 0, stops: 0 };
  const client = {
    async start() {
      state.starts += 1;
    },
    async stop() {
      state.stops += 1;
      return undefined;
    },
    async createSession() {
      const handlers: Record<string, ((e: { data?: { content?: string } }) => void)[]> = {};
      return {
        on(event: string, handler: (e: { data?: { content?: string } }) => void) {
          (handlers[event] ??= []).push(handler);
        },
        async send() {
          for (const h of handlers["assistant.message"] ?? []) h({ data: { content: reply } });
          for (const h of handlers["session.idle"] ?? []) h({});
        },
        async disconnect() {},
      };
    },
  };
  return { client: () => Promise.resolve(client), state };
}

describe("inference providers", () => {
  const spec = sampleSpec();
  const role = deriveRoles(spec).find((r) => r.id === "core")!;
  const requirements = spec.requirements.filter((r) => role.requirementIds.includes(r.id));

  it("deterministic provider grounds the baseline prompt in requirement ids", async () => {
    const provider = new DeterministicInferenceProvider();
    const prompt = await provider.craftMemberPrompt({ spec, role, requirements, facets: [] });
    expect(provider.engine).toBe("deterministic");
    expect(prompt).toContain(role.name);
    expect(prompt).toContain(requirements[0].id);
    expect(prompt).toContain("Definition of done");
  });

  it("createInferenceProvider returns the deterministic provider by default", () => {
    expect(createInferenceProvider().engine).toBe("deterministic");
    expect(createInferenceProvider({ engine: "copilot-sdk" }).engine).toBe("copilot-sdk");
  });

  it("copilot-sdk provider uses model output when it is substantial", async () => {
    const reply = "REFINED PROMPT grounded in " + requirements.map((r) => r.id).join(", ") + " with concrete heuristics.";
    const fake = fakeInferenceClient(reply);
    const provider = new CopilotSdkInferenceProvider({ clientFactory: fake.client });
    const prompt = await provider.craftMemberPrompt({ spec, role, requirements, facets: [] });
    expect(prompt).toBe(reply);
    await provider.dispose();
    expect(fake.state.starts).toBe(1);
    expect(fake.state.stops).toBe(1);
  });

  it("copilot-sdk provider falls back to the baseline when output is too short", async () => {
    const fake = fakeInferenceClient("ok");
    const provider = new CopilotSdkInferenceProvider({ clientFactory: fake.client });
    const prompt = await provider.craftMemberPrompt({ spec, role, requirements, facets: [] });
    expect(prompt).toBe(buildBaselinePrompt({ spec, role, requirements, facets: [] }));
    await provider.dispose();
  });
});

describe("fleet dispatch", () => {
  const spec = sampleSpec();

  async function manifest() {
    return forgeSquad(spec, [], { provider: new DeterministicInferenceProvider() });
  }

  it("builds a fleet prompt and custom-agent configs from the manifest", async () => {
    const m = await manifest();
    const prompt = buildFleetPrompt(m);
    expect(prompt).toContain(spec.slug);
    expect(prompt).toContain("FR-001");
    expect(prompt).toContain("one SQL todo per requirement");

    const agents = toCustomAgentConfig(m);
    expect(agents).toHaveLength(m.members.length);
    expect(agents[0]).toHaveProperty("prompt");
    expect(agents[0]).toHaveProperty("infer");
  });

  it("dryRun returns the plan without contacting the runtime", async () => {
    const result = await dispatchFleet(await manifest(), { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.started).toBe(false);
    expect(result.agents.length).toBeGreaterThan(0);
  });

  it("starts fleet mode through an injected client", async () => {
    const calls = { start: 0, stop: 0, fleet: [] as string[] };
    const result = await dispatchFleet(await manifest(), {
      clientFactory: async () => ({
        async start() {
          calls.start += 1;
        },
        async stop() {
          calls.stop += 1;
          return undefined;
        },
        async createSession() {
          return {
            rpc: {
              fleet: {
                async start(input: { prompt: string }) {
                  calls.fleet.push(input.prompt);
                  return { started: true };
                },
              },
            },
            async disconnect() {},
          };
        },
      }),
    });
    expect(result.started).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(calls.start).toBe(1);
    expect(calls.stop).toBe(1);
    expect(calls.fleet[0]).toContain("FR-001");
  });
});
