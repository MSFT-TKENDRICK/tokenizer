import { describe, expect, it } from "vitest";
import { deriveRoles } from "../src/squad/roles.js";
import { verifyGrounding, assertGrounded, renderGroundingReport } from "../src/squad/grounding.js";
import { sampleSpec } from "./fixtures.js";
import type { SquadMember } from "../src/types.js";

function memberFrom(name: string, roleId: string, requirementIds: string[]): SquadMember {
  return {
    name,
    displayName: name,
    description: "",
    tools: [],
    prompt: "",
    skills: [],
    infer: true,
    requirementIds,
    roleId,
  };
}

describe("role derivation", () => {
  const spec = sampleSpec();
  const roles = deriveRoles(spec);

  it("derives implementer, specialist and QA roles", () => {
    const ids = roles.map((r) => r.id);
    expect(ids).toContain("frontend");
    expect(ids).toContain("core");
    expect(ids).toContain("data");
    expect(ids).toContain("accessibility");
    expect(ids).toContain("test-automation");
  });

  it("covers every requirement across all roles", () => {
    const owned = new Set(roles.flatMap((r) => r.requirementIds));
    for (const req of spec.requirements) expect(owned.has(req.id)).toBe(true);
  });

  it("assigns every functional requirement to the test-automation engineer", () => {
    const qa = roles.find((r) => r.id === "test-automation")!;
    const functional = spec.requirements.filter((r) => r.kind === "functional").map((r) => r.id);
    expect(qa.requirementIds.sort()).toEqual(functional.sort());
  });
});

describe("grounding verification", () => {
  const spec = sampleSpec();

  it("reports a fully grounded squad", () => {
    const roles = deriveRoles(spec);
    const members = roles.map((r) => memberFrom(`m-${r.id}`, r.id, r.requirementIds));
    const report = verifyGrounding(spec, members);
    expect(report.ok).toBe(true);
    expect(report.coverageRatio).toBe(1);
    expect(report.uncoveredRequirements).toHaveLength(0);
    expect(() => assertGrounded(report)).not.toThrow();
  });

  it("detects uncovered requirements", () => {
    const members = [memberFrom("partial", "core", ["FR-001"])];
    const report = verifyGrounding(spec, members);
    expect(report.ok).toBe(false);
    expect(report.uncoveredRequirements).toContain("FR-002");
    expect(() => assertGrounded(report)).toThrow(/not grounded/);
  });

  it("detects ungrounded members and dangling references", () => {
    const members = [
      memberFrom("idle", "quality", []),
      memberFrom("dangling", "core", ["FR-999"]),
    ];
    const report = verifyGrounding(spec, members);
    expect(report.ungroundedMembers).toContain("idle");
    expect(report.ungroundedMembers).toContain("dangling");
    expect(report.danglingReferences).toEqual([{ member: "dangling", requirementId: "FR-999" }]);
  });

  it("renders a grounding proof", () => {
    const roles = deriveRoles(spec);
    const members = roles.map((r) => memberFrom(`m-${r.id}`, r.id, r.requirementIds));
    const md = renderGroundingReport(verifyGrounding(spec, members), members);
    expect(md).toContain("GROUNDED");
    expect(md).toContain("FR-001");
  });
});
