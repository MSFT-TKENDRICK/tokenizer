import * as path from "node:path";
import type { Ambiguity, MicroSpecFacet } from "../types.js";
import { emitFrontmatter, nowIso, pad3, writeText } from "../util.js";

export interface FacetInput {
  title: string;
  requirementIds: string[];
  capability?: string;
  ambiguityId?: string;
  question: string;
  resolution: string;
  acceptanceCriteria: string[];
  adrId?: string;
}

/** Build a micro-spec facet, the smallest unit of spec enrichment. */
export function createFacet(seq: number, input: FacetInput): MicroSpecFacet {
  return {
    id: `MSF-${pad3(seq)}`,
    title: input.title,
    status: "proposed",
    requirementIds: [...input.requirementIds],
    capability: input.capability,
    ambiguityId: input.ambiguityId,
    question: input.question,
    resolution: input.resolution,
    acceptanceCriteria: [...input.acceptanceCriteria],
    adrId: input.adrId,
    createdAt: nowIso(),
  };
}

/**
 * Seed a facet directly from an ambiguity. The resolution/criteria are left as
 * interview placeholders so the agent can fill them after talking to the user.
 */
export function facetFromAmbiguity(seq: number, ambiguity: Ambiguity): MicroSpecFacet {
  return createFacet(seq, {
    title: titleFor(ambiguity),
    requirementIds: ambiguity.requirementId ? [ambiguity.requirementId] : [],
    capability: ambiguity.capability,
    ambiguityId: ambiguity.id,
    question: ambiguity.question,
    resolution: "<INTERVIEW PENDING — capture the user's answer here>",
    acceptanceCriteria: ["<Add at least one measurable, testable criterion derived from the answer>"],
  });
}

function titleFor(ambiguity: Ambiguity): string {
  if (ambiguity.requirementId) return `Clarify ${ambiguity.requirementId}: ${ambiguity.kind}`;
  if (ambiguity.capability) return `Clarify capability "${ambiguity.capability}": ${ambiguity.kind}`;
  return `Clarify: ${ambiguity.kind}`;
}

/** Render a facet to a self-describing markdown file. */
export function renderFacet(facet: MicroSpecFacet): string {
  const fm = emitFrontmatter({
    id: facet.id,
    title: facet.title,
    status: facet.status,
    capability: facet.capability,
    requirements: facet.requirementIds,
    ambiguity: facet.ambiguityId,
    adr: facet.adrId,
    created: facet.createdAt,
    supersededBy: facet.supersededBy,
  });

  const criteria = facet.acceptanceCriteria.length
    ? facet.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")
    : "- [ ] _none yet_";

  return `${fm}

# ${facet.id} — ${facet.title}

> Micro-spec facet: a focused enrichment of the SpecKit spec, generated for an
> identified ambiguity to give squad members the knowledge they need to execute.

**Grounded in:** ${facet.requirementIds.length ? facet.requirementIds.join(", ") : "_capability-level_"}

## Question (from interview)

${facet.question}

## Resolution

${facet.resolution}

## Acceptance criteria

${criteria}

## Provenance

- Triggered by ambiguity: ${facet.ambiguityId ?? "_manual_"}
- Governing ADR: ${facet.adrId ?? "_none_"}
- Status: ${facet.status}
`;
}

export async function writeFacet(facetsDir: string, facet: MicroSpecFacet): Promise<string> {
  const file = path.join(facetsDir, `${facet.id}.md`);
  await writeText(file, renderFacet(facet));
  return file;
}

/** Apply an interview answer to a facet, moving it from proposed to accepted. */
export function resolveFacet(
  facet: MicroSpecFacet,
  resolution: string,
  acceptanceCriteria: string[],
  adrId?: string,
): MicroSpecFacet {
  return {
    ...facet,
    status: "accepted",
    resolution,
    acceptanceCriteria,
    adrId: adrId ?? facet.adrId,
  };
}
