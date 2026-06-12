import { describe, expect, it } from "vitest";
import { generateFeatures, renderFeature } from "../src/bdd/featureGen.js";
import { sampleSpec } from "./fixtures.js";

describe("BDD feature generation", () => {
  const spec = sampleSpec();
  const features = generateFeatures(spec);

  it("creates one feature per capability", () => {
    const caps = features.map((f) => f.capability).sort();
    expect(caps).toEqual(["storage", "tokenization", "visualization"]);
  });

  it("creates one scenario per requirement, tagged with the requirement id", () => {
    const tokenization = features.find((f) => f.capability === "tokenization")!;
    expect(tokenization.scenarios.map((s) => s.requirementId).sort()).toEqual(["FR-001", "FR-003", "FR-006"]);
    expect(tokenization.scenarios[0].tags).toContain("@FR-001");
  });

  it("renders valid Gherkin grounded in requirement ids", () => {
    const gherkin = renderFeature(features.find((f) => f.capability === "visualization")!);
    expect(gherkin).toContain("Feature:");
    expect(gherkin).toContain("Scenario:");
    expect(gherkin).toContain("@FR-002");
    expect(gherkin).toMatch(/Given .+\n {4}When .+\n {4}Then /);
    expect(gherkin).toContain("grounded in:");
  });
});
