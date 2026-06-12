import * as path from "node:path";
import type {
  Ambiguity,
  AssertEvalConfig,
  BddFeature,
  EvidenceManifest,
  MicroSpecFacet,
  Requirement,
  SpecDocument,
  SquadManifest,
  TddLoopEntry,
} from "./types.js";
import { writeText } from "./util.js";
import { loadSpec } from "./speckit/parser.js";
import { detectAmbiguities, prioritizeAmbiguities, ambiguityStats } from "./speckit/ambiguity.js";
import { facetFromAmbiguity, writeFacet } from "./facets/facet.js";
import { forgeSquad, writeSquad } from "./squad/forge.js";
import { renderGroundingReport, assertGrounded } from "./squad/grounding.js";
import { createInferenceProvider } from "./sdk/inference.js";
import { buildSquadEval, buildFeatureEval, writeEvalConfig, evalConfigFileName } from "./assert/evalConfig.js";
import { generateFeatures, writeFeatures } from "./bdd/featureGen.js";
import { initLoop, renderLoopReport, writeLoopState } from "./tdd/loop.js";
import {
  collectEvidence,
  discoverEvidence,
  renderEvidenceReport,
  writeEvidenceManifest,
} from "./evidence/collector.js";

export interface PipelineOptions {
  repoRoot: string;
  specDir: string;
  engine?: "deterministic" | "copilot-sdk";
  model?: string;
  /** Write generated squad members into `.github/agents/squad`. Default true. */
  writeAgents?: boolean;
  /** Throw if the squad is not grounded. Default true. */
  strictGrounding?: boolean;
}

export interface PipelineResult {
  spec: SpecDocument;
  ambiguities: Ambiguity[];
  facets: MicroSpecFacet[];
  manifest: SquadManifest;
  squadEval: AssertEvalConfig;
  featureEvals: AssertEvalConfig[];
  features: BddFeature[];
  loop: TddLoopEntry[];
  evidence: EvidenceManifest[];
  files: string[];
}

function groupByCapability(requirements: Requirement[]): Map<string, Requirement[]> {
  const map = new Map<string, Requirement[]>();
  for (const req of requirements) {
    const cap = req.capability ?? "general";
    if (!map.has(cap)) map.set(cap, []);
    map.get(cap)!.push(req);
  }
  return map;
}

function renderInterview(spec: SpecDocument, ambiguities: Ambiguity[]): string {
  const stats = ambiguityStats(ambiguities);
  const rows = ambiguities
    .map((a) => `| ${a.id} | ${a.severity} | ${a.kind} | ${a.requirementId ?? a.capability ?? "—"} | ${a.question} |`)
    .join("\n");

  return `# Interview agenda — spec ${spec.id} "${spec.title}"

The SDLC agent must resolve these ambiguities with the user before generating the
squad. Each resolved item becomes a micro-spec facet (and, where it changes the
spec, an ADR).

**Load:** ${ambiguities.length} questions — blocking ${stats.blocking}, high ${stats.high}, medium ${stats.medium}, low ${stats.low}.

| Id | Severity | Kind | Target | Question |
| --- | --- | --- | --- | --- |
${rows || "| _none_ | | | | No ambiguities detected. |"}
`;
}

/**
 * Run the full agentic SDLC pipeline for one spec:
 * interview → micro-spec facets → grounded squad → ASSERT evals → BDD features
 * → TDD loop → evidence. Every artifact is written under the repo and traced
 * back to a requirement id.
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { repoRoot, specDir } = options;
  const writeAgents = options.writeAgents ?? true;
  const strictGrounding = options.strictGrounding ?? true;

  const spec = await loadSpec(specDir);
  const bundleDir = path.join(repoRoot, "docs", "sdlc", `${spec.id}-${spec.slug}`);
  const facetsDir = path.join(repoRoot, "docs", "sdlc", "facets");
  const agentsDir = path.join(repoRoot, ".github", "agents", "squad");
  const evalsDir = path.join(bundleDir, "evals");
  const featuresDir = path.join(bundleDir, "features");
  const evidenceDir = path.join(bundleDir, "evidence");
  const files: string[] = [];

  // 1. Interview agenda from detected ambiguities.
  const ambiguities = prioritizeAmbiguities(detectAmbiguities(spec));
  files.push(await write(path.join(bundleDir, "interview.md"), renderInterview(spec, ambiguities)));

  // 2. Micro-spec facets (proposed) — one per ambiguity, awaiting interview answers.
  const facets: MicroSpecFacet[] = ambiguities.map((a, i) => facetFromAmbiguity(i + 1, a));
  for (const facet of facets) files.push(await writeFacet(facetsDir, facet));

  // 3. Forge the grounded squad through the inference provider.
  const provider = createInferenceProvider({ engine: options.engine, model: options.model });
  let manifest: SquadManifest;
  try {
    manifest = await forgeSquad(spec, facets, { provider, model: options.model });
  } finally {
    await provider.dispose();
  }

  // 4. Grounding proof.
  files.push(await write(path.join(bundleDir, "grounding.md"), renderGroundingReport(manifest.grounding, manifest.members)));
  if (strictGrounding) assertGrounded(manifest.grounding);

  // 5. Write squad members + manifest.
  if (writeAgents) {
    files.push(...(await writeSquad(agentsDir, path.join(bundleDir, "squad.manifest.json"), manifest, spec)));
  } else {
    files.push(await write(path.join(bundleDir, "squad.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`));
  }

  // 6. ASSERT evals: one squad-generation eval + one per capability.
  const squadEval = buildSquadEval(spec, manifest);
  files.push(await writeEvalConfig(path.join(evalsDir, evalConfigFileName(squadEval)), squadEval));

  const byCapability = groupByCapability(spec.requirements);
  const featureEvals: AssertEvalConfig[] = [];
  for (const [capability, requirements] of byCapability) {
    const evalCfg = buildFeatureEval(spec, capability, requirements);
    featureEvals.push(evalCfg);
    files.push(await writeEvalConfig(path.join(evalsDir, evalConfigFileName(evalCfg)), evalCfg));
  }

  // 7. BDD feature specs.
  const features = generateFeatures(spec);
  files.push(...(await writeFeatures(featuresDir, features)));

  // 8. TDD red/green loop state.
  const loop = initLoop(spec, features);
  files.push(await writeLoopState(path.join(bundleDir, "tdd-loop.json"), loop));
  files.push(await write(path.join(bundleDir, "tdd-loop.md"), renderLoopReport(spec, loop)));

  // 9. Evidence manifests (one per capability) + combined report.
  const evidence: EvidenceManifest[] = [];
  for (const [capability, requirements] of byCapability) {
    const featureFiles = features
      .filter((f) => f.capability === capability)
      .map((f) => path.join(featuresDir, `${f.capability}.feature`));
    const sources = await discoverEvidence(repoRoot, spec.id, capability, featureFiles);
    const manifestForCap = await collectEvidence({ specId: spec.id, capability, requirements, sources });
    evidence.push(manifestForCap);
    files.push(await writeEvidenceManifest(path.join(evidenceDir, `${capability}.json`), manifestForCap));
  }
  files.push(await write(path.join(bundleDir, "evidence.md"), renderCombinedEvidence(spec, evidence)));

  return { spec, ambiguities, facets, manifest, squadEval, featureEvals, features, loop, evidence, files };
}

function renderCombinedEvidence(spec: SpecDocument, manifests: EvidenceManifest[]): string {
  const sections = manifests.map((m) => renderEvidenceReport(m)).join("\n\n---\n\n");
  const complete = manifests.filter((m) => m.complete).length;
  return `# Evidence summary — spec ${spec.id} "${spec.title}"

${complete}/${manifests.length} capabilities have complete evidence.

${sections}
`;
}

async function write(file: string, contents: string): Promise<string> {
  await writeText(file, contents);
  return file;
}
