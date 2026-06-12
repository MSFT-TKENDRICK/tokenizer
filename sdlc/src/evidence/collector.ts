import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { EvidenceArtifact, EvidenceKind, EvidenceManifest, Requirement } from "../types.js";
import { fileSize, nowIso, pathExists, readText, writeText } from "../util.js";

const UI_KEYWORDS = [
  "ui",
  "display",
  "render",
  "view",
  "screen",
  "button",
  "highlight",
  "copy",
  "layout",
  "theme",
  "component",
  "color",
  "panel",
  "tooltip",
  "responsive",
];

/** A capability is visual if any owning requirement implies a UI surface. */
export function isVisualCapability(requirements: Requirement[]): boolean {
  return requirements.some((r) => {
    const t = r.text.toLowerCase();
    return UI_KEYWORDS.some((k) => t.includes(k)) || (r.capability ?? "").match(/ui|visual|render/) !== null;
  });
}

/** Required evidence depends on whether the capability has a UI surface. */
export function requiredEvidence(requirements: Requirement[]): EvidenceKind[] {
  const base: EvidenceKind[] = ["coverage", "test-report", "bdd-feature"];
  if (isVisualCapability(requirements)) {
    return [...base, "playwright-spec", "screenshot", "video", "playwright-trace"];
  }
  return base;
}

export interface EvidenceSources {
  coverageSummary?: string;
  testReport?: string;
  featureFiles?: string[];
  screenshots?: string[];
  videos?: string[];
  playwrightSpecs?: string[];
  playwrightTraces?: string[];
}

const KIND_DESCRIPTIONS: Record<EvidenceKind, string> = {
  coverage: "Code coverage summary",
  "test-report": "Test run report",
  "bdd-feature": "BDD feature specification",
  "playwright-spec": "Playwright automation spec",
  screenshot: "UI screenshot",
  video: "Screen recording",
  "playwright-trace": "Playwright trace",
};

async function artifact(kind: EvidenceKind, file: string): Promise<EvidenceArtifact> {
  const bytes = await fileSize(file);
  return {
    kind,
    path: file,
    exists: bytes > 0,
    bytes,
    description: KIND_DESCRIPTIONS[kind],
  };
}

async function parseCoverage(summaryPath: string): Promise<EvidenceManifest["coverage"]> {
  if (!(await pathExists(summaryPath))) return undefined;
  try {
    const json = JSON.parse(await readText(summaryPath)) as {
      total?: Record<string, { pct?: number }>;
    };
    const total = json.total;
    if (!total) return undefined;
    return {
      lines: total.lines?.pct ?? 0,
      statements: total.statements?.pct ?? 0,
      functions: total.functions?.pct ?? 0,
      branches: total.branches?.pct ?? 0,
    };
  } catch {
    return undefined;
  }
}

export interface CollectOptions {
  specId: string;
  capability: string;
  requirements: Requirement[];
  sources: EvidenceSources;
}

/** Build (and validate) the evidence manifest for one capability/feature. */
export async function collectEvidence(options: CollectOptions): Promise<EvidenceManifest> {
  const { specId, capability, requirements, sources } = options;
  const required = requiredEvidence(requirements);
  const artifacts: EvidenceArtifact[] = [];

  if (sources.coverageSummary) artifacts.push(await artifact("coverage", sources.coverageSummary));
  if (sources.testReport) artifacts.push(await artifact("test-report", sources.testReport));
  for (const f of sources.featureFiles ?? []) artifacts.push(await artifact("bdd-feature", f));
  for (const f of sources.playwrightSpecs ?? []) artifacts.push(await artifact("playwright-spec", f));
  for (const f of sources.screenshots ?? []) artifacts.push(await artifact("screenshot", f));
  for (const f of sources.videos ?? []) artifacts.push(await artifact("video", f));
  for (const f of sources.playwrightTraces ?? []) artifacts.push(await artifact("playwright-trace", f));

  const presentKinds = new Set(artifacts.filter((a) => a.exists).map((a) => a.kind));
  const missing = required.filter((k) => !presentKinds.has(k));
  const coverage = sources.coverageSummary ? await parseCoverage(sources.coverageSummary) : undefined;

  return {
    specId,
    capability,
    requirementIds: requirements.map((r) => r.id),
    generatedAt: nowIso(),
    required,
    artifacts,
    coverage,
    complete: missing.length === 0,
    missing,
  };
}

async function listFiles(dir: string, match: (file: string) => boolean): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, match)));
    else if (match(full)) out.push(full);
  }
  return out;
}

/**
 * Discover evidence from conventional locations relative to the repo root:
 * `coverage/`, `test-results/` (Playwright), and `evidence/<specId>/<capability>/`.
 */
export async function discoverEvidence(
  repoRoot: string,
  specId: string,
  capability: string,
  featureFiles: string[] = [],
): Promise<EvidenceSources> {
  const coverageSummary = path.join(repoRoot, "coverage", "coverage-summary.json");
  const testResults = path.join(repoRoot, "test-results");
  const evidenceDir = path.join(repoRoot, "evidence", specId, capability);

  const images = [
    ...(await listFiles(testResults, (f) => /\.(png|jpg|jpeg)$/i.test(f))),
    ...(await listFiles(evidenceDir, (f) => /\.(png|jpg|jpeg)$/i.test(f))),
  ];
  const videos = [
    ...(await listFiles(testResults, (f) => /\.(webm|mp4)$/i.test(f))),
    ...(await listFiles(evidenceDir, (f) => /\.(webm|mp4)$/i.test(f))),
  ];
  const traces = await listFiles(testResults, (f) => /trace.*\.zip$/i.test(f));
  const playwrightSpecs = await listFiles(path.join(repoRoot, "tests"), (f) => /\.spec\.ts$/i.test(f));

  return {
    coverageSummary: (await pathExists(coverageSummary)) ? coverageSummary : undefined,
    testReport: (await pathExists(coverageSummary)) ? coverageSummary : undefined,
    featureFiles,
    screenshots: images,
    videos,
    playwrightSpecs,
    playwrightTraces: traces,
  };
}

export function renderEvidenceReport(manifest: EvidenceManifest): string {
  const status = manifest.complete ? "✅ COMPLETE" : "❌ INCOMPLETE";
  const cov = manifest.coverage
    ? `lines ${manifest.coverage.lines}%, statements ${manifest.coverage.statements}%, functions ${manifest.coverage.functions}%, branches ${manifest.coverage.branches}%`
    : "_not collected_";

  const rows = manifest.artifacts
    .map((a) => `| ${a.kind} | ${a.exists ? "✅" : "❌"} | ${a.bytes} | \`${a.path}\` |`)
    .join("\n");

  return `# Evidence — spec ${manifest.specId} / ${manifest.capability}

**Status:** ${status}
**Requirements:** ${manifest.requirementIds.join(", ")}
**Coverage:** ${cov}
${manifest.missing.length ? `**Missing:** ${manifest.missing.join(", ")}\n` : ""}
| Evidence | Present | Bytes | Path |
| --- | --- | --- | --- |
${rows || "| _none_ | | | |"}
`;
}

export async function writeEvidenceManifest(file: string, manifest: EvidenceManifest): Promise<string> {
  await writeText(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
}

/** Throw if required evidence is missing — gates feature completion. */
export function assertEvidenceComplete(manifest: EvidenceManifest): void {
  if (!manifest.complete) {
    throw new Error(
      `Evidence incomplete for ${manifest.specId}/${manifest.capability}: missing ${manifest.missing.join(", ")}`,
    );
  }
}
