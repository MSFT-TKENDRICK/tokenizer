import type { MicroSpecFacet, Requirement, SpecDocument, SquadRole } from "../types.js";

export interface CraftPromptInput {
  spec: SpecDocument;
  role: SquadRole;
  requirements: Requirement[];
  facets: MicroSpecFacet[];
}

/**
 * Strategy for turning a role + grounding context into a squad member's system
 * prompt. Two implementations exist: a deterministic one (offline, used by
 * tests and as the default/fallback) and one backed by the GitHub Copilot SDK.
 */
export interface InferenceProvider {
  readonly engine: string;
  readonly model?: string;
  craftMemberPrompt(input: CraftPromptInput): Promise<string>;
  dispose(): Promise<void>;
}

/** Shared, grounded scaffold both providers build on. */
export function buildBaselinePrompt(input: CraftPromptInput): string {
  const { spec, role, requirements, facets } = input;
  const reqLines = requirements
    .map((r) => `- ${r.id}${r.priority ? ` (${r.priority})` : ""}: ${r.text}`)
    .join("\n");
  const facetLines = facets.length
    ? facets
        .map(
          (f) =>
            `- ${f.id} (${f.requirementIds.join(", ") || "capability"}): ${f.resolution}\n` +
            f.acceptanceCriteria.map((c) => `    • ${c}`).join("\n"),
        )
        .join("\n")
    : "- (none yet — request a micro-spec facet if you hit an ambiguity)";

  return `You are the **${role.name}** for feature ${spec.id} "${spec.title}".

## Mission
${role.description}

You are one member of a spec-grounded squad. You only act within your assigned
requirements and you must keep every change traceable to a requirement id.

## Requirements you own (your sole source of truth)
${reqLines}

## Micro-spec facets enriching these requirements
${facetLines}

## Operating rules
1. Do not implement behavior that is not traceable to one of your requirement ids.
2. If a requirement is ambiguous, stop and request a micro-spec facet instead of guessing.
3. Follow the repository conventions in DESIGN.md and copilot-instructions.md.
4. Produce evidence for everything you complete (tests, coverage, screenshots/video where UI is involved).
5. Hand work to the Test Automation Engineer with the requirement ids you touched.

## Definition of done
Every owned requirement has: a BDD scenario, a passing test (red→green), and an
evidence artifact recorded in the feature's evidence manifest.`;
}

/** Default provider: deterministic, no network, fully reproducible. */
export class DeterministicInferenceProvider implements InferenceProvider {
  readonly engine = "deterministic";
  readonly model: string | undefined;

  constructor(model?: string) {
    this.model = model;
  }

  async craftMemberPrompt(input: CraftPromptInput): Promise<string> {
    return buildBaselinePrompt(input);
  }

  async dispose(): Promise<void> {
    /* no-op */
  }
}

/** Minimal structural view of the bits of @github/copilot-sdk we use. */
interface CopilotSessionLike {
  on(event: string, handler: (e: { data?: { content?: string } }) => void): void;
  send(input: { prompt: string }): Promise<void>;
  disconnect(): Promise<void>;
}
interface CopilotClientLike {
  start(): Promise<void>;
  stop(): Promise<unknown>;
  createSession(config: Record<string, unknown>): Promise<CopilotSessionLike>;
}

export interface CopilotSdkOptions {
  model?: string;
  /** Override for tests: inject a fake client factory. */
  clientFactory?: () => Promise<CopilotClientLike>;
}

/**
 * Provider backed by the GitHub Copilot SDK (`@github/copilot-sdk`). It runs a
 * scoped "prompt engineer" custom agent to enrich the deterministic baseline
 * into a sharper, role-specific system prompt. Falls back to the baseline if
 * the model returns nothing usable.
 */
export class CopilotSdkInferenceProvider implements InferenceProvider {
  readonly engine = "copilot-sdk";
  readonly model: string;
  private client: CopilotClientLike | undefined;
  private readonly clientFactory: () => Promise<CopilotClientLike>;

  constructor(options: CopilotSdkOptions = {}) {
    this.model = options.model ?? "gpt-5";
    this.clientFactory = options.clientFactory ?? defaultClientFactory;
  }

  private async ensureClient(): Promise<CopilotClientLike> {
    if (!this.client) {
      this.client = await this.clientFactory();
      await this.client.start();
    }
    return this.client;
  }

  async craftMemberPrompt(input: CraftPromptInput): Promise<string> {
    const baseline = buildBaselinePrompt(input);
    const client = await this.ensureClient();
    const session = await client.createSession({
      model: this.model,
      customAgents: [
        {
          name: "prompt-engineer",
          displayName: "Squad Prompt Engineer",
          description: "Writes precise, spec-grounded system prompts for squad members.",
          tools: [],
          prompt:
            "You write system prompts for specialised SDLC agents. Keep every instruction " +
            "traceable to the provided requirement ids. Never invent requirements.",
          infer: false,
        },
      ],
      agent: "prompt-engineer",
      onPermissionRequest: () => ({ kind: "approve-once" }),
    });

    let text = "";
    const done = new Promise<void>((resolve) => {
      session.on("assistant.message", (e) => {
        if (e.data?.content) text += e.data.content;
      });
      session.on("session.idle", () => resolve());
      session.on("session.error", () => resolve());
    });

    await session.send({
      prompt:
        `Refine the following squad-member system prompt. Keep all requirement ids, ` +
        `tighten the language, and add one concrete heuristic per requirement. ` +
        `Return only the prompt.\n\n${baseline}`,
    });
    await done;
    await session.disconnect();

    const cleaned = text.trim();
    return cleaned.length > 40 ? cleaned : baseline;
  }

  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = undefined;
    }
  }
}

async function defaultClientFactory(): Promise<CopilotClientLike> {
  // Dynamic import keeps the SDK an optional dependency; the toolkit builds and
  // tests run without it installed.
  const mod = (await import("@github/copilot-sdk" as string)) as {
    CopilotClient: new () => CopilotClientLike;
  };
  return new mod.CopilotClient();
}

export interface ProviderFactoryOptions {
  engine?: "deterministic" | "copilot-sdk";
  model?: string;
  clientFactory?: () => Promise<CopilotClientLike>;
}

/**
 * Build an inference provider for the requested engine. When `copilot-sdk` is
 * requested but unavailable at runtime, the caller can catch and fall back.
 */
export function createInferenceProvider(options: ProviderFactoryOptions = {}): InferenceProvider {
  if (options.engine === "copilot-sdk") {
    return new CopilotSdkInferenceProvider({ model: options.model, clientFactory: options.clientFactory });
  }
  return new DeterministicInferenceProvider(options.model);
}
