import * as path from "node:path";
import { promises as fs } from "node:fs";
import { runPipeline } from "./pipeline.js";
import { loadSpec } from "./speckit/parser.js";
import { detectAmbiguities, prioritizeAmbiguities, ambiguityStats } from "./speckit/ambiguity.js";
import { verifyGrounding } from "./squad/grounding.js";
import { buildFleetPrompt } from "./sdk/fleet.js";
import type { SquadManifest } from "./types.js";

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const body = token.slice(2);
      if (body.startsWith("no-")) {
        flags[body.slice(3)] = false;
      } else if (body.includes("=")) {
        const [k, v] = body.split(/=(.*)/s);
        flags[k] = v;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[body] = argv[i + 1];
        i += 1;
      } else {
        flags[body] = true;
      }
    } else {
      positionals.push(token);
    }
  }
  return { command: positionals.shift() ?? "help", positionals, flags };
}

function repoRootFrom(flags: Record<string, string | boolean>): string {
  return typeof flags.repo === "string" ? path.resolve(flags.repo) : process.cwd();
}

const HELP = `sdlc — agentic SDLC squad forge

Usage: sdlc <command> <specDir> [options]

Commands:
  run <specDir>        Run the full pipeline: interview → facets → grounded squad
                       → ASSERT evals → BDD features → TDD loop → evidence.
  interview <specDir>  Print the ambiguity-driven interview agenda.
  ground <specDir>     Forge the squad and print the grounding proof only.
  fleet <manifest>     Build the fleet-mode dispatch prompt for a squad manifest.
  help                 Show this help.

Options:
  --repo <dir>         Repo root for generated artifacts (default: cwd).
  --engine <name>      Inference engine: deterministic (default) | copilot-sdk.
  --model <name>       Model for the inference engine / squad members.
  --no-agents          Do not write squad members into .github/agents/squad.
  --no-strict          Do not fail when the squad is not fully grounded.
  --start              (fleet) Actually start fleet mode via the Copilot SDK.
`;

async function cmdRun(args: ParsedArgs): Promise<void> {
  const specDir = path.resolve(args.positionals[0] ?? ".");
  const repoRoot = repoRootFrom(args.flags);
  const engine = args.flags.engine === "copilot-sdk" ? "copilot-sdk" : "deterministic";

  const result = await runPipeline({
    repoRoot,
    specDir,
    engine,
    model: typeof args.flags.model === "string" ? args.flags.model : undefined,
    writeAgents: args.flags.agents !== false,
    strictGrounding: args.flags.strict !== false,
  });

  const stats = ambiguityStats(result.ambiguities);
  const g = result.manifest.grounding;
  const evidenceComplete = result.evidence.filter((e) => e.complete).length;

  console.log(`✓ Spec ${result.spec.id} "${result.spec.title}"`);
  console.log(`  Requirements:   ${result.spec.requirements.length} across ${result.spec.capabilities.length} capabilities`);
  console.log(`  Interview:      ${result.ambiguities.length} questions (blocking ${stats.blocking}, high ${stats.high}, medium ${stats.medium}, low ${stats.low})`);
  console.log(`  Facets:         ${result.facets.length} micro-spec facets (proposed)`);
  console.log(`  Squad:          ${result.manifest.members.length} members via ${result.manifest.engine}`);
  console.log(`  Grounding:      ${g.ok ? "✅ grounded" : "❌ NOT grounded"} (${g.coveredRequirements}/${g.totalRequirements}, ${(g.coverageRatio * 100).toFixed(0)}%)`);
  console.log(`  ASSERT evals:   ${1 + result.featureEvals.length} (1 squad + ${result.featureEvals.length} feature)`);
  console.log(`  BDD features:   ${result.features.length} (${result.features.reduce((n, f) => n + f.scenarios.length, 0)} scenarios)`);
  console.log(`  TDD loop:       ${result.loop.length} requirements seeded (all red)`);
  console.log(`  Evidence:       ${evidenceComplete}/${result.evidence.length} capabilities complete`);
  console.log(`  Files written:  ${result.files.length}`);
  console.log(`  Bundle:         docs/sdlc/${result.spec.id}-${result.spec.slug}/`);
}

async function cmdInterview(args: ParsedArgs): Promise<void> {
  const spec = await loadSpec(path.resolve(args.positionals[0] ?? "."));
  const ambiguities = prioritizeAmbiguities(detectAmbiguities(spec));
  console.log(`Interview agenda for spec ${spec.id} "${spec.title}" — ${ambiguities.length} questions:\n`);
  for (const a of ambiguities) {
    console.log(`  [${a.severity.toUpperCase()}] ${a.id} (${a.kind}) ${a.requirementId ?? a.capability ?? ""}`);
    console.log(`     Q: ${a.question}`);
  }
}

async function cmdGround(args: ParsedArgs): Promise<void> {
  const { forgeSquad } = await import("./squad/forge.js");
  const { createInferenceProvider } = await import("./sdk/inference.js");
  const { renderGroundingReport } = await import("./squad/grounding.js");
  const spec = await loadSpec(path.resolve(args.positionals[0] ?? "."));
  const provider = createInferenceProvider({ engine: "deterministic" });
  const manifest = await forgeSquad(spec, [], { provider });
  await provider.dispose();
  const report = verifyGrounding(spec, manifest.members);
  console.log(renderGroundingReport(report, manifest.members));
  if (!report.ok) process.exitCode = 1;
}

async function cmdFleet(args: ParsedArgs): Promise<void> {
  const manifestPath = path.resolve(args.positionals[0] ?? "");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as SquadManifest;
  const prompt = buildFleetPrompt(manifest);
  if (args.flags.start === true) {
    const { dispatchFleet } = await import("./sdk/fleet.js");
    const result = await dispatchFleet(manifest, { model: manifest.model });
    console.log(`Fleet started: ${result.started}`);
  } else {
    console.log("Fleet dispatch prompt (dry run; pass --start to launch via the Copilot SDK):\n");
    console.log(prompt);
  }
}

export async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "run":
      await cmdRun(args);
      break;
    case "interview":
      await cmdInterview(args);
      break;
    case "ground":
      await cmdGround(args);
      break;
    case "fleet":
      await cmdFleet(args);
      break;
    case "help":
    default:
      console.log(HELP);
  }
}
