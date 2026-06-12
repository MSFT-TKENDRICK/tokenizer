import { describe, expect, it } from "vitest";
import { forgeSquad, renderSquadMemberAgent } from "../src/squad/forge.js";
import { DeterministicInferenceProvider } from "../src/sdk/inference.js";
import { sampleSpec } from "./fixtures.js";

describe("squad forge", () => {
  const spec = sampleSpec();
  const provider = new DeterministicInferenceProvider();

  it("forges a grounded squad with one member per role", async () => {
    const manifest = await forgeSquad(spec, [], { provider });
    expect(manifest.grounding.ok).toBe(true);
    expect(manifest.members.length).toBeGreaterThanOrEqual(5);
    expect(manifest.engine).toBe("deterministic");
    const names = manifest.members.map((m) => m.name);
    expect(names).toContain("token-visualizer-frontend");
    expect(names).toContain("token-visualizer-test-automation");
  });

  it("grounds each member's prompt in its requirements", async () => {
    const manifest = await forgeSquad(spec, [], { provider });
    const frontend = manifest.members.find((m) => m.roleId === "frontend")!;
    expect(frontend.requirementIds).toContain("FR-002");
    expect(frontend.prompt).toContain("FR-002");
  });

  it("renders a custom-agent file with provenance", async () => {
    const manifest = await forgeSquad(spec, [], { provider });
    const core = manifest.members.find((m) => m.roleId === "core")!;
    const md = renderSquadMemberAgent(core, spec);
    expect(md).toMatch(/^---/);
    expect(md).toContain(`name: ${core.name}`);
    expect(md).toContain("tools:");
    expect(md).toContain("Grounded in requirements:");
    expect(md).toContain(core.requirementIds[0]);
  });
});
