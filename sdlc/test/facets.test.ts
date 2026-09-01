import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createFacet, facetFromAmbiguity, renderFacet, resolveFacet, writeFacet } from "../src/facets/facet.js";
import { createAdr, adrFromFacets, renderAdr, writeAdr } from "../src/facets/adr.js";
import { detectAmbiguities } from "../src/speckit/ambiguity.js";
import { sampleSpec } from "./fixtures.js";

describe("micro-spec facets", () => {
  it("seeds a facet from an ambiguity with interview placeholders", () => {
    const spec = sampleSpec();
    const ambiguity = detectAmbiguities(spec).find((a) => a.requirementId === "FR-006")!;
    const facet = facetFromAmbiguity(1, ambiguity);
    expect(facet.id).toBe("MSF-001");
    expect(facet.status).toBe("proposed");
    expect(facet.requirementIds).toEqual(["FR-006"]);
    expect(facet.ambiguityId).toBe(ambiguity.id);
    expect(facet.resolution).toContain("INTERVIEW PENDING");
  });

  it("renders a facet as grounded markdown", () => {
    const facet = createFacet(2, {
      title: "Pick tokenizer model",
      requirementIds: ["FR-006"],
      capability: "tokenization",
      ambiguityId: "AMB-001",
      question: "BPE or WordPiece?",
      resolution: "Use BPE (cl100k_base).",
      acceptanceCriteria: ["Tokenizer matches tiktoken cl100k_base on the fixture corpus"],
    });
    const md = renderFacet(facet);
    expect(md).toContain("MSF-002 — Pick tokenizer model");
    expect(md).toContain("**Grounded in:** FR-006");
    expect(md).toContain("- [ ] Tokenizer matches tiktoken");
    expect(md).toContain("Triggered by ambiguity: AMB-001");
  });

  it("resolves a facet from proposed to accepted", () => {
    const facet = createFacet(3, {
      title: "x",
      requirementIds: ["FR-001"],
      question: "q",
      resolution: "pending",
      acceptanceCriteria: ["placeholder"],
    });
    const resolved = resolveFacet(facet, "Final answer", ["Measurable criterion"], "ADR-001");
    expect(resolved.status).toBe("accepted");
    expect(resolved.resolution).toBe("Final answer");
    expect(resolved.acceptanceCriteria).toEqual(["Measurable criterion"]);
    expect(resolved.adrId).toBe("ADR-001");
  });

  it("writes a facet file to disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "facet-"));
    try {
      const facet = createFacet(4, { title: "t", requirementIds: [], question: "q", resolution: "r", acceptanceCriteria: [] });
      const file = await writeFacet(dir, facet);
      expect(file.endsWith("MSF-004.md")).toBe(true);
      expect(await fs.readFile(file, "utf8")).toContain("MSF-004");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ADRs", () => {
  it("creates an ADR with a stable id and default status", () => {
    const adr = createAdr(1, {
      title: "Adopt BPE tokenizer",
      context: "Spec was ambiguous about the model.",
      decision: "Use cl100k_base BPE.",
      consequences: ["All token counts assume BPE"],
      requirementIds: ["FR-006"],
      facetIds: ["MSF-001"],
      date: "2024-01-01",
    });
    expect(adr.id).toBe("ADR-001");
    expect(adr.status).toBe("proposed");
    expect(adr.date).toBe("2024-01-01");
  });

  it("promotes accepted facets into one ADR", () => {
    const facets = [
      createFacet(1, {
        title: "f1",
        requirementIds: ["FR-006"],
        question: "BPE or WordPiece?",
        resolution: "BPE",
        acceptanceCriteria: ["Matches cl100k_base"],
      }),
      createFacet(2, {
        title: "f2",
        requirementIds: ["FR-001"],
        question: "Stream or batch?",
        resolution: "Batch",
        acceptanceCriteria: ["Handles 10k tokens"],
      }),
    ];
    const adr = adrFromFacets(7, "Tokenizer decisions", facets, "Use batch BPE.");
    expect(adr.id).toBe("ADR-007");
    expect(adr.requirementIds).toEqual(["FR-001", "FR-006"]);
    expect(adr.facetIds).toEqual(["MSF-001", "MSF-002"]);
    expect(adr.consequences).toContain("MSF-001: Matches cl100k_base");

    const md = renderAdr(adr);
    expect(md).toContain("# ADR-007 — Tokenizer decisions");
    expect(md).toContain("## Decision");
    expect(md).toContain("Use batch BPE.");
    expect(md).toContain("FR-001, FR-006");
  });

  it("writes an ADR file to disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adr-"));
    try {
      const adr = createAdr(9, {
        title: "t",
        context: "c",
        decision: "d",
        consequences: [],
        requirementIds: [],
        facetIds: [],
      });
      const file = await writeAdr(dir, adr);
      expect(file.endsWith("ADR-009.md")).toBe(true);
      const md = await fs.readFile(file, "utf8");
      expect(md).toContain("ADR-009");
      expect(md).toContain("_none recorded_");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
