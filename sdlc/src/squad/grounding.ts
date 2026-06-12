import type { GroundingReport, SpecDocument, SquadMember } from "../types.js";
import { compareRequirementIds } from "../util.js";

/**
 * Verify that a squad is provably grounded in the spec:
 *  1. every requirement is owned by at least one member (full coverage);
 *  2. every member owns at least one real requirement (no idle members);
 *  3. no member references a requirement id that does not exist (no dangling refs).
 */
export function verifyGrounding(spec: SpecDocument, members: SquadMember[]): GroundingReport {
  const validIds = new Set(spec.requirements.map((r) => r.id));
  const coverageByRequirement: Record<string, string[]> = {};
  for (const r of spec.requirements) coverageByRequirement[r.id] = [];

  const ungroundedMembers: string[] = [];
  const danglingReferences: { member: string; requirementId: string }[] = [];

  for (const member of members) {
    let validRefs = 0;
    for (const reqId of member.requirementIds) {
      if (validIds.has(reqId)) {
        coverageByRequirement[reqId].push(member.name);
        validRefs += 1;
      } else {
        danglingReferences.push({ member: member.name, requirementId: reqId });
      }
    }
    if (validRefs === 0) ungroundedMembers.push(member.name);
  }

  const uncoveredRequirements = Object.entries(coverageByRequirement)
    .filter(([, owners]) => owners.length === 0)
    .map(([id]) => id)
    .sort(compareRequirementIds);

  const total = spec.requirements.length;
  const covered = total - uncoveredRequirements.length;

  return {
    ok: uncoveredRequirements.length === 0 && ungroundedMembers.length === 0 && danglingReferences.length === 0,
    specId: spec.id,
    totalRequirements: total,
    coveredRequirements: covered,
    coverageRatio: total === 0 ? 1 : covered / total,
    uncoveredRequirements,
    ungroundedMembers: [...new Set(ungroundedMembers)].sort(),
    danglingReferences,
    coverageByRequirement,
  };
}

/** Render a grounding report as a markdown proof artifact. */
export function renderGroundingReport(report: GroundingReport, members: SquadMember[]): string {
  const status = report.ok ? "✅ GROUNDED" : "❌ NOT GROUNDED";
  const pct = (report.coverageRatio * 100).toFixed(1);

  const coverageRows = Object.entries(report.coverageByRequirement)
    .sort(([a], [b]) => compareRequirementIds(a, b))
    .map(([req, owners]) => `| ${req} | ${owners.length ? owners.join(", ") : "**—**"} |`)
    .join("\n");

  const memberRows = members
    .map((m) => `| ${m.name} | ${m.roleId} | ${m.requirementIds.join(", ") || "**none**"} |`)
    .join("\n");

  const problems: string[] = [];
  if (report.uncoveredRequirements.length) {
    problems.push(`- **Uncovered requirements:** ${report.uncoveredRequirements.join(", ")}`);
  }
  if (report.ungroundedMembers.length) {
    problems.push(`- **Ungrounded members:** ${report.ungroundedMembers.join(", ")}`);
  }
  if (report.danglingReferences.length) {
    problems.push(
      `- **Dangling references:** ${report.danglingReferences
        .map((d) => `${d.member}→${d.requirementId}`)
        .join(", ")}`,
    );
  }

  return `# Squad grounding proof — spec ${report.specId}

**Status:** ${status}
**Coverage:** ${report.coveredRequirements}/${report.totalRequirements} requirements (${pct}%)

${problems.length ? `## Problems\n\n${problems.join("\n")}\n` : "All requirements are owned and every member is grounded.\n"}

## Requirement → owners

| Requirement | Owning squad member(s) |
| --- | --- |
${coverageRows || "| _none_ | _none_ |"}

## Member → requirements

| Member | Role | Grounded in |
| --- | --- | --- |
${memberRows || "| _none_ | | |"}
`;
}

/** Throw if a squad is not grounded — used by the CLI to gate the pipeline. */
export function assertGrounded(report: GroundingReport): void {
  if (report.ok) return;
  const reasons: string[] = [];
  if (report.uncoveredRequirements.length) {
    reasons.push(`uncovered requirements: ${report.uncoveredRequirements.join(", ")}`);
  }
  if (report.ungroundedMembers.length) {
    reasons.push(`ungrounded members: ${report.ungroundedMembers.join(", ")}`);
  }
  if (report.danglingReferences.length) {
    reasons.push(
      `dangling references: ${report.danglingReferences.map((d) => `${d.member}->${d.requirementId}`).join(", ")}`,
    );
  }
  throw new Error(`Squad is not grounded in spec ${report.specId}: ${reasons.join("; ")}`);
}
