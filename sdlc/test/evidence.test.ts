import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  requiredEvidence,
  isVisualCapability,
  collectEvidence,
  assertEvidenceComplete,
} from "../src/evidence/collector.js";
import { sampleSpec } from "./fixtures.js";

describe("evidence collector", () => {
  const spec = sampleSpec();
  const visualReqs = spec.requirements.filter((r) => r.capability === "visualization");
  const tokenReqs = spec.requirements.filter((r) => r.capability === "tokenization");

  it("requires richer evidence for visual capabilities", () => {
    expect(isVisualCapability(visualReqs)).toBe(true);
    const visual = requiredEvidence(visualReqs);
    expect(visual).toContain("screenshot");
    expect(visual).toContain("video");
    expect(visual).toContain("playwright-trace");
  });

  it("requires only base evidence for non-visual capabilities", () => {
    expect(isVisualCapability(tokenReqs)).toBe(false);
    const base = requiredEvidence(tokenReqs);
    expect(base).toEqual(["coverage", "test-report", "bdd-feature"]);
  });

  it("marks a manifest incomplete when evidence is missing", async () => {
    const manifest = await collectEvidence({
      specId: "001",
      capability: "tokenization",
      requirements: tokenReqs,
      sources: {},
    });
    expect(manifest.complete).toBe(false);
    expect(manifest.missing).toContain("coverage");
    expect(() => assertEvidenceComplete(manifest)).toThrow(/incomplete/);
  });

  it("collects present artifacts and parses coverage", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-"));
    try {
      const coverage = path.join(dir, "coverage-summary.json");
      const feature = path.join(dir, "tokenization.feature");
      await fs.writeFile(
        coverage,
        JSON.stringify({ total: { lines: { pct: 91 }, statements: { pct: 90 }, functions: { pct: 88 }, branches: { pct: 80 } } }),
      );
      await fs.writeFile(feature, "Feature: x");

      const manifest = await collectEvidence({
        specId: "001",
        capability: "tokenization",
        requirements: tokenReqs,
        sources: { coverageSummary: coverage, testReport: coverage, featureFiles: [feature] },
      });

      expect(manifest.complete).toBe(true);
      expect(manifest.coverage?.lines).toBe(91);
      expect(() => assertEvidenceComplete(manifest)).not.toThrow();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
