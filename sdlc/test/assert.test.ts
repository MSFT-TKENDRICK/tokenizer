import { describe, expect, it } from "vitest";
import { buildSquadEval, buildFeatureEval, renderEvalConfig } from "../src/assert/evalConfig.js";
import { forgeSquad } from "../src/squad/forge.js";
import { DeterministicInferenceProvider } from "../src/sdk/inference.js";
import { sampleSpec } from "./fixtures.js";

describe("ASSERT eval generation", () => {
  const spec = sampleSpec();

  it("builds a squad-grounding eval with judge dimensions", async () => {
    const manifest = await forgeSquad(spec, [], { provider: new DeterministicInferenceProvider() });
    const cfg = buildSquadEval(spec, manifest);
    expect(cfg.suite).toBe("squad-grounding-token-visualizer");
    expect(Object.keys(cfg.pipeline.judge.dimensions)).toContain("grounding_violation");
    expect(cfg.groundedIn).toContain("FR-001");

    const yaml = renderEvalConfig(cfg);
    expect(yaml).toContain("suite: squad-grounding-token-visualizer");
    expect(yaml).toContain("behavior:");
    expect(yaml).toContain("description: |-");
    expect(yaml).toContain("grounding_violation:");
    expect(yaml).toContain("rubric: |-");
    expect(yaml).toContain("# Provenance");
  });

  it("builds a feature eval scoped to a capability's requirements", () => {
    const reqs = spec.requirements.filter((r) => r.capability === "tokenization");
    const cfg = buildFeatureEval(spec, "tokenization", reqs);
    expect(cfg.suite).toBe("feature-token-visualizer-tokenization");
    expect(cfg.behavior.description).toContain("FR-001");
    const yaml = renderEvalConfig(cfg);
    expect(yaml).toContain("callable: sdlc_assert_targets:feature_behavior");
    expect(yaml).toContain("trace:");
    expect(yaml).toContain("requirement_violation:");
  });
});
