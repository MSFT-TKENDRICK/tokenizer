import type { SquadManifest } from "../types.js";

/**
 * Build the fleet-mode orchestration prompt for a squad. Fleet mode dispatches
 * these members as parallel sub-agents (via the `task` tool, with SQL todos as
 * shared coordination state), one owner per unit of work.
 */
export function buildFleetPrompt(manifest: SquadManifest): string {
  const units = manifest.members
    .map(
      (m, i) =>
        `${i + 1}. **${m.name}** (${m.roleId}) → requirements ${m.requirementIds.join(", ") || "NONE"}\n` +
        `   Deliver: BDD scenarios + red/green tests + evidence for each requirement above.`,
    )
    .join("\n");

  return `Deploy the spec-grounded squad for feature ${manifest.specId} "${manifest.specSlug}".

Coordination: create one SQL todo per requirement, assign exactly one owner, and
only mark a todo done once its evidence artifact exists. Units of work:

${units}

Each sub-agent must keep every change traceable to its requirement ids and report
back the requirement ids it completed with links to the evidence it produced.`;
}

/** Map a squad member to a Copilot SDK CustomAgentConfig object. */
export function toCustomAgentConfig(manifest: SquadManifest): Record<string, unknown>[] {
  return manifest.members.map((m) => ({
    name: m.name,
    displayName: m.displayName,
    description: m.description,
    tools: m.tools,
    prompt: m.prompt,
    skills: m.skills,
    infer: m.infer,
  }));
}

interface FleetSessionLike {
  rpc: { fleet: { start(input: { prompt: string }): Promise<{ started: boolean }> } };
  disconnect(): Promise<void>;
}
interface FleetClientLike {
  start(): Promise<void>;
  stop(): Promise<unknown>;
  createSession(config: Record<string, unknown>): Promise<FleetSessionLike>;
}

export interface DispatchOptions {
  model?: string;
  /** Inject a fake client for tests; defaults to the real Copilot SDK client. */
  clientFactory?: () => Promise<FleetClientLike>;
  /** When true, only build the prompt/config without starting fleet mode. */
  dryRun?: boolean;
}

export interface DispatchResult {
  started: boolean;
  dryRun: boolean;
  prompt: string;
  agents: Record<string, unknown>[];
}

/**
 * Dispatch the squad via the Copilot SDK fleet-mode API. The squad members are
 * registered as custom agents and `session.rpc.fleet.start` kicks off parallel
 * execution. Returns without contacting the runtime when `dryRun` is set.
 */
export async function dispatchFleet(manifest: SquadManifest, options: DispatchOptions = {}): Promise<DispatchResult> {
  const prompt = buildFleetPrompt(manifest);
  const agents = toCustomAgentConfig(manifest);
  if (options.dryRun) {
    return { started: false, dryRun: true, prompt, agents };
  }

  const factory = options.clientFactory ?? defaultFleetClientFactory;
  const client = await factory();
  await client.start();
  try {
    const session = await client.createSession({
      model: options.model ?? manifest.model ?? "gpt-5",
      customAgents: agents,
      onPermissionRequest: () => ({ kind: "approve-once" }),
    });
    const result = await session.rpc.fleet.start({ prompt });
    await session.disconnect();
    return { started: result.started, dryRun: false, prompt, agents };
  } finally {
    await client.stop();
  }
}

async function defaultFleetClientFactory(): Promise<FleetClientLike> {
  const mod = (await import("@github/copilot-sdk" as string)) as {
    CopilotClient: new () => FleetClientLike;
  };
  return new mod.CopilotClient();
}
