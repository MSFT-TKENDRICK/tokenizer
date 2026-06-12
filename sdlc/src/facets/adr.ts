import * as path from "node:path";
import type { Adr, MicroSpecFacet } from "../types.js";
import { emitFrontmatter, pad3, writeText } from "../util.js";

export interface AdrInput {
  title: string;
  context: string;
  decision: string;
  consequences: string[];
  requirementIds: string[];
  facetIds: string[];
  supersedes?: string;
  date?: string;
}

/** Create an ADR recording a revision to the SpecKit specs. */
export function createAdr(seq: number, input: AdrInput): Adr {
  return {
    id: `ADR-${pad3(seq)}`,
    title: input.title,
    status: "proposed",
    context: input.context,
    decision: input.decision,
    consequences: [...input.consequences],
    requirementIds: [...input.requirementIds],
    facetIds: [...input.facetIds],
    supersedes: input.supersedes,
    date: input.date ?? new Date().toISOString().slice(0, 10),
  };
}

/**
 * Promote a set of accepted facets into a single ADR. Used by the agent once an
 * interview thread converges on a decision that changes the spec.
 */
export function adrFromFacets(seq: number, title: string, facets: MicroSpecFacet[], decision: string): Adr {
  const requirementIds = [...new Set(facets.flatMap((f) => f.requirementIds))].sort();
  const context = facets.map((f) => `- ${f.id}: ${f.question}`).join("\n");
  const consequences = facets.flatMap((f) => f.acceptanceCriteria.map((c) => `${f.id}: ${c}`));
  return createAdr(seq, {
    title,
    context: `Resolved during interview of the following facets:\n${context}`,
    decision,
    consequences,
    requirementIds,
    facetIds: facets.map((f) => f.id),
  });
}

export function renderAdr(adr: Adr): string {
  const fm = emitFrontmatter({
    id: adr.id,
    title: adr.title,
    status: adr.status,
    date: adr.date,
    requirements: adr.requirementIds,
    facets: adr.facetIds,
    supersedes: adr.supersedes,
  });

  const consequences = adr.consequences.length
    ? adr.consequences.map((c) => `- ${c}`).join("\n")
    : "- _none recorded_";

  return `${fm}

# ${adr.id} — ${adr.title}

- **Status:** ${adr.status}
- **Date:** ${adr.date}
- **Affects requirements:** ${adr.requirementIds.join(", ") || "_none_"}
- **From facets:** ${adr.facetIds.join(", ") || "_none_"}
${adr.supersedes ? `- **Supersedes:** ${adr.supersedes}\n` : ""}
## Context

${adr.context}

## Decision

${adr.decision}

## Consequences

${consequences}
`;
}

export async function writeAdr(adrDir: string, adr: Adr): Promise<string> {
  const file = path.join(adrDir, `${adr.id}.md`);
  await writeText(file, renderAdr(adr));
  return file;
}
