import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { runPipeline } from "../src/pipeline.js";
import { writeTempSpec } from "./fixtures.js";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("pipeline end-to-end", () => {
  it("produces a grounded squad and every downstream artifact", async () => {
    const { repoRoot, specDir, cleanup } = await writeTempSpec();
    try {
      const result = await runPipeline({ repoRoot, specDir, engine: "deterministic" });

      expect(result.spec.id).toBe("001");
      expect(result.spec.slug).toBe("token-visualizer");
      expect(result.spec.requirements).toHaveLength(7);

      // Interview surfaced the explicit NEEDS CLARIFICATION on FR-006 as blocking.
      expect(result.ambiguities.some((a) => a.requirementId === "FR-006" && a.severity === "blocking")).toBe(true);
      expect(result.facets).toHaveLength(result.ambiguities.length);

      // Squad is provably grounded.
      expect(result.manifest.grounding.ok).toBe(true);
      expect(result.manifest.grounding.coverageRatio).toBe(1);

      // Downstream artifacts.
      expect(result.features).toHaveLength(3);
      expect(result.loop).toHaveLength(7);
      expect(result.featureEvals).toHaveLength(3);
      expect(result.evidence).toHaveLength(3);
      // Fresh repo has no captured evidence yet.
      expect(result.evidence.every((m) => m.complete === false)).toBe(true);

      const bundle = path.join(repoRoot, "docs", "sdlc", "001-token-visualizer");
      for (const rel of ["interview.md", "grounding.md", "squad.manifest.json", "tdd-loop.json", "tdd-loop.md", "evidence.md"]) {
        expect(await exists(path.join(bundle, rel))).toBe(true);
      }
      expect(await exists(path.join(bundle, "features", "tokenization.feature"))).toBe(true);
      expect(await exists(path.join(bundle, "evals"))).toBe(true);

      // Squad members written as custom agents with provenance.
      const squadDir = path.join(repoRoot, ".github", "agents", "squad");
      const agentFiles = await fs.readdir(squadDir);
      expect(agentFiles).toContain("token-visualizer-core.agent.md");
      const core = await fs.readFile(path.join(squadDir, "token-visualizer-core.agent.md"), "utf8");
      expect(core).toContain("Grounded in requirements:");
      expect(core).toMatch(/FR-00\d/);

      // Facets written to the shared facets directory.
      const facetsDir = path.join(repoRoot, "docs", "sdlc", "facets");
      expect((await fs.readdir(facetsDir)).length).toBe(result.facets.length);

      // The grounding proof file states GROUNDED.
      const grounding = await fs.readFile(path.join(bundle, "grounding.md"), "utf8");
      expect(grounding).toContain("GROUNDED");
    } finally {
      await cleanup();
    }
  });

  it("can skip writing agents and still report grounding", async () => {
    const { repoRoot, specDir, cleanup } = await writeTempSpec("002-mini", "# Feature: Mini\n\n## Functional Requirements\n- **FR-001**: The system MUST echo input. [cap:core]\n");
    try {
      const result = await runPipeline({ repoRoot, specDir, writeAgents: false });
      expect(result.manifest.grounding.ok).toBe(true);
      const squadDir = path.join(repoRoot, ".github", "agents", "squad");
      expect(await exists(squadDir)).toBe(false);
      expect(await exists(path.join(repoRoot, "docs", "sdlc", "002-mini", "squad.manifest.json"))).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
