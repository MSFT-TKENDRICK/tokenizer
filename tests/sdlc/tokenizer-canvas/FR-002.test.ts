// @FR-002 [cap:tokenization] — The canvas MUST tokenize the current input text
// using the project's existing `tokenize` algorithm, ported faithfully so token
// boundaries match `src/lib/tokenizer.ts`. Grounded in MSF (FR-002).
//
// Red→green strategy: assert the ported ESM module produces *byte-for-byte* the
// same token stream as the TypeScript source of truth across a varied corpus.
import { describe, it, expect } from "vitest";
import { CORPUS } from "./fixtures";
import { tokenize as tokenizePorted } from "../../../.github/extensions/tokenizer/web/tokenizer.mjs";
import { tokenize as tokenizeSource } from "../../../src/lib/tokenizer";

describe("FR-002 tokenization parity (ported web/tokenizer.mjs === src/lib/tokenizer.ts)", () => {
  for (const text of CORPUS) {
    it(`matches token boundaries for: ${JSON.stringify(text.slice(0, 32))}`, () => {
      const ported = tokenizePorted(text);
      const source = tokenizeSource(text);
      expect(ported).toEqual(source);
    });
  }

  it("returns an empty array for empty input", () => {
    expect(tokenizePorted("")).toEqual([]);
  });

  it("covers the whole input with contiguous, non-overlapping token spans", () => {
    const text = "The quick brown fox === 42 👩‍💻!";
    const tokens = tokenizePorted(text);
    let cursor = 0;
    for (const t of tokens) {
      expect(t.start).toBe(cursor);
      expect(t.end).toBeGreaterThan(t.start);
      cursor = t.end;
    }
    expect(cursor).toBe(text.length);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
  });

  it("assigns the documented categories (word/number/operator/emoji/punctuation)", () => {
    const cats = (s: string) => tokenizePorted(s).map((t) => t.category);
    expect(cats("word")).toContain("word");
    expect(cats("42")).toContain("number");
    expect(cats("===")).toContain("operator");
    expect(cats("👩‍💻")).toContain("emoji");
    expect(cats("!")).toContain("punctuation");
  });
});
