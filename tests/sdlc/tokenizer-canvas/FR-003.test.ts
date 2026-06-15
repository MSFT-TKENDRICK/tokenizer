// @FR-003 [cap:visualization] — The canvas MUST display summary metrics for the
// current input: characters, bytes, words, lines, and token count.
//
// We test the data layer (summarizeTokens) the visualization renders. The pixel
// rendering is proven by the creator via Playwright/screenshot evidence.
import { describe, it, expect } from "vitest";
import { CORPUS } from "./fixtures";
import {
  summarizeTokens as summarizePorted,
  byteLength,
} from "../../../.github/extensions/tokenizer/web/tokenizer.mjs";
import { summarizeTokens as summarizeSource } from "../../../src/lib/tokenizer";

describe("FR-003 summary metrics", () => {
  it("exposes the five required metrics", () => {
    const s = summarizePorted("hello world\nsecond line");
    expect(s).toHaveProperty("characters");
    expect(s).toHaveProperty("bytes");
    expect(s).toHaveProperty("words");
    expect(s).toHaveProperty("lines");
    expect(s).toHaveProperty("tokens");
  });

  for (const text of CORPUS) {
    it(`matches src summary for: ${JSON.stringify(text.slice(0, 24))}`, () => {
      expect(summarizePorted(text)).toEqual(summarizeSource(text));
    });
  }

  it("computes characters by code point and bytes by UTF-8 length", () => {
    const s = summarizePorted("a👩‍💻b");
    expect(s.characters).toBe([..."a👩‍💻b"].length);
    expect(s.bytes).toBe(byteLength("a👩‍💻b"));
  });

  it("counts lines and words for known fixtures", () => {
    const s = summarizePorted("one two three\nfour 5");
    expect(s.lines).toBe(2);
    expect(s.words).toBe(5); // four words + one number
  });
});
