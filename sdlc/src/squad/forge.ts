import * as path from "node:path";
import type { MicroSpecFacet, SpecDocument, SquadManifest, SquadMember, SquadRole } from "../types.js";
import { emitFrontmatter, writeText, nowIso } from "../util.js";
import { deriveRoles } from "./roles.js";
import { verifyGrounding } from "./grounding.js";
import type { InferenceProvider } from "../sdk/inference.js";

export interface ForgeOptions {
  provider: InferenceProvider;
  model?: string;
}

function facetsForRole(role: SquadRole, facets: MicroSpecFacet[]): MicroSpecFacet[] {
  const reqSet = new Set(role.requirementIds);
  return facets.filter(
    (f) =>
      f.requirementIds.some((id) => reqSet.has(id)) ||
      (f.capability !== undefined && role.capabilities.includes(f.capability)),
  );
}

/**
 * Forge an sdk-style squad from a spec: derive roles, craft each member's
 * prompt through the inference provider, and prove the result is grounded.
 */
export async function forgeSquad(
  spec: SpecDocument,
  facets: MicroSpecFacet[],
  options: ForgeOptions,
): Promise<SquadManifest> {
  const roles = deriveRoles(spec);
  const reqById = new Map(spec.requirements.map((r) => [r.id, r]));
  const members: SquadMember[] = [];

  for (const role of roles) {
    const requirements = role.requirementIds
      .map((id) => reqById.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    const roleFacets = facetsForRole(role, facets);
    const prompt = await options.provider.craftMemberPrompt({ spec, role, requirements, facets: roleFacets });

    members.push({
      name: `${spec.slug}-${role.id}`,
      displayName: `${role.name} · ${spec.slug}`,
      description: `${role.description} Owns ${role.requirementIds.length} requirement(s)${
        role.capabilities.length ? ` across ${role.capabilities.join(", ")}` : ""
      }.`,
      tools: role.tools,
      prompt,
      skills: role.skills,
      infer: true,
      model: options.model,
      requirementIds: role.requirementIds,
      roleId: role.id,
    });
  }

  const grounding = verifyGrounding(spec, members);

  return {
    specId: spec.id,
    specSlug: spec.slug,
    generatedAt: nowIso(),
    engine: options.provider.engine,
    model: options.model ?? options.provider.model,
    members,
    grounding,
  };
}

/** Render a squad member as a Copilot custom agent (`.agent.md`) file. */
export function renderSquadMemberAgent(member: SquadMember, spec: SpecDocument): string {
  const fm = emitFrontmatter({
    name: member.name,
    description: member.description,
    tools: member.tools ?? [],
    ...(member.model ? { model: member.model } : {}),
  });

  return `${fm}

${member.prompt}

---

<!-- provenance: do not remove. proves this agent is grounded in the spec. -->
**Squad member provenance**

- Feature: ${spec.id} — ${spec.title}
- Role: ${member.roleId}
- Grounded in requirements: ${member.requirementIds.join(", ") || "NONE (ungrounded!)"}
- Preloaded skills: ${member.skills.length ? member.skills.join(", ") : "none"}
`;
}

export async function writeSquadMember(dir: string, member: SquadMember, spec: SpecDocument): Promise<string> {
  const file = path.join(dir, `${member.name}.agent.md`);
  await writeText(file, renderSquadMemberAgent(member, spec));
  return file;
}

/** Write the machine-readable squad manifest (used by fleet dispatch + audits). */
export async function writeSquadManifest(file: string, manifest: SquadManifest): Promise<string> {
  await writeText(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
}

/** Write every squad member plus the manifest; returns the file paths created. */
export async function writeSquad(
  agentsDir: string,
  manifestFile: string,
  manifest: SquadManifest,
  spec: SpecDocument,
): Promise<string[]> {
  const files: string[] = [];
  for (const member of manifest.members) {
    files.push(await writeSquadMember(agentsDir, member, spec));
  }
  files.push(await writeSquadManifest(manifestFile, manifest));
  return files;
}
