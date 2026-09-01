import { describe, expect, it } from "vitest";
import { parseSpecMarkdown, parseSpecDirName, loadSpec } from "../src/speckit/parser.js";
import { SAMPLE_SPEC, writeTempSpec } from "./fixtures.js";

describe("speckit parser", () => {
  const parsed = parseSpecMarkdown(SAMPLE_SPEC, "spec.md");

  it("extracts the title", () => {
    expect(parsed.title).toBe("Token Visualizer");
  });

  it("extracts all requirements with kinds and priorities", () => {
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toEqual(["FR-001", "FR-002", "FR-003", "FR-004", "FR-005", "FR-006", "NFR-001"]);
    expect(parsed.requirements.find((r) => r.id === "FR-004")?.priority).toBe("SHOULD");
    expect(parsed.requirements.find((r) => r.id === "FR-001")?.priority).toBe("MUST");
    expect(parsed.requirements.find((r) => r.id === "NFR-001")?.kind).toBe("non-functional");
  });

  it("captures capability tags on requirements", () => {
    expect(parsed.requirements.find((r) => r.id === "FR-002")?.capability).toBe("visualization");
    expect(parsed.requirements.find((r) => r.id === "FR-001")?.capability).toBe("tokenization");
  });

  it("parses the user story", () => {
    expect(parsed.userStories).toHaveLength(1);
    expect(parsed.userStories[0].role).toBe("developer");
    expect(parsed.userStories[0].soThat).toContain("model cost");
  });

  it("captures the NEEDS CLARIFICATION marker", () => {
    expect(parsed.openQuestions).toHaveLength(1);
    expect(parsed.openQuestions[0].requirementId).toBe("FR-006");
    expect(parsed.openQuestions[0].text).toContain("BPE or WordPiece");
  });

  it("strips the requirement id from the text", () => {
    const fr1 = parsed.requirements.find((r) => r.id === "FR-001")!;
    expect(fr1.text.startsWith("FR-001")).toBe(false);
    expect(fr1.text).toContain("tokenize input text");
  });
});

describe("parseSpecDirName", () => {
  it("splits id and slug", () => {
    expect(parseSpecDirName("001-token-visualizer")).toEqual({ id: "001", slug: "token-visualizer" });
    expect(parseSpecDirName("42_widget")).toEqual({ id: "042", slug: "widget" });
  });
});

describe("loadSpec", () => {
  it("loads a spec directory", async () => {
    const { specDir, cleanup } = await writeTempSpec();
    try {
      const spec = await loadSpec(specDir);
      expect(spec.id).toBe("001");
      expect(spec.slug).toBe("token-visualizer");
      expect(spec.requirements).toHaveLength(7);
      expect(spec.capabilities).toContain("visualization");
      expect(spec.capabilities).toContain("storage");
    } finally {
      await cleanup();
    }
  });
});
