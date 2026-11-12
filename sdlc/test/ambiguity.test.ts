import { describe, expect, it } from "vitest";
import { parseSpecMarkdown } from "../src/speckit/parser.js";
import {
  detectAmbiguities,
  prioritizeAmbiguities,
  ambiguityStats,
} from "../src/speckit/ambiguity.js";
import { SAMPLE_SPEC } from "./fixtures.js";
import type { SpecDocument } from "../src/types.js";

function specFromSample(): SpecDocument {
  const parsed = parseSpecMarkdown(SAMPLE_SPEC, "spec.md");
  return {
    id: "001",
    slug: "token-visualizer",
    title: parsed.title,
    dir: "specs/001-token-visualizer",
    capabilities: parsed.capabilities,
    requirements: parsed.requirements,
    userStories: parsed.userStories,
    openQuestions: parsed.openQuestions,
  };
}

describe("ambiguity detection", () => {
  const ambiguities = detectAmbiguities(specFromSample());

  it("flags the explicit NEEDS CLARIFICATION marker as blocking", () => {
    const marker = ambiguities.find((a) => a.kind === "explicit-marker");
    expect(marker).toBeDefined();
    expect(marker?.severity).toBe("blocking");
    expect(marker?.requirementId).toBe("FR-006");
  });

  it("flags the vague term in FR-005", () => {
    const vague = ambiguities.find((a) => a.kind === "vague-quantifier");
    expect(vague?.requirementId).toBe("FR-005");
    expect(vague?.question.toLowerCase()).toContain("intuitive");
  });

  it("flags missing performance and security NFRs but not accessibility", () => {
    const missing = ambiguities.filter((a) => a.kind === "missing-non-functional").map((a) => a.capability);
    expect(missing).toContain("performance");
    expect(missing).toContain("security");
    expect(missing).not.toContain("accessibility");
  });

  it("prioritizes blocking ambiguities first", () => {
    const ordered = prioritizeAmbiguities(ambiguities);
    expect(ordered[0].severity).toBe("blocking");
  });

  it("summarizes the interview load", () => {
    const stats = ambiguityStats(ambiguities);
    expect(stats.blocking).toBeGreaterThanOrEqual(1);
    expect(stats.high).toBeGreaterThanOrEqual(1);
  });
});
