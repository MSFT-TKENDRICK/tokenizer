import { describe, expect, it } from "vitest";

import {
  byteLength,
  estimateContextPercentage,
  estimateInputCost,
  summarizeTokens,
  tokenize,
} from "./tokenizer";

describe("tokenize", () => {
  it("returns no tokens for empty strings", () => {
    expect(tokenize("")).toEqual([]);
    expect(summarizeTokens("")).toMatchObject({
      characters: 0,
      bytes: 0,
      words: 0,
      lines: 0,
      tokens: 0,
    });
  });

  it("splits text into deterministic token-like units with offsets", () => {
    const tokens = tokenize("Hello, world!");

    expect(tokens.map((token) => [token.text, token.category])).toEqual([
      ["Hello", "word"],
      [",", "punctuation"],
      [" ", "whitespace"],
      ["world", "word"],
      ["!", "punctuation"],
    ]);
    expect(tokens.map((token) => [token.index, token.start, token.end])).toEqual([
      [0, 0, 5],
      [1, 5, 6],
      [2, 6, 7],
      [3, 7, 12],
      [4, 12, 13],
    ]);
    expect(tokenize("Hello, world!").map((token) => token.id)).toEqual(
      tokens.map((token) => token.id),
    );
  });

  it("preserves whitespace and newline tokens", () => {
    const tokens = tokenize("a  b\r\nc\td");

    expect(tokens.map((token) => [token.text, token.category])).toEqual([
      ["a", "word"],
      ["  ", "whitespace"],
      ["b", "word"],
      ["\r\n", "newline"],
      ["c", "word"],
      ["\t", "whitespace"],
      ["d", "word"],
    ]);
    expect(summarizeTokens("a  b\r\nc\td", tokens).lines).toBe(2);
  });

  it("handles unicode text and byte offsets", () => {
    const text = "naïve café 漢字";
    const tokens = tokenize(text);

    expect(tokens.map((token) => token.text)).toEqual(["naïve", " ", "café", " ", "漢字"]);
    expect(tokens[tokens.length - 1]).toMatchObject({
      text: "漢字",
      bytes: 6,
      byteStart: byteLength("naïve café "),
      byteEnd: byteLength(text),
    });
    expect(summarizeTokens(text, tokens)).toMatchObject({
      characters: 13,
      words: 3,
      bytes: byteLength(text),
      tokens: 5,
    });
  });

  it("keeps emoji and surrogate-pair sequences intact", () => {
    const tokens = tokenize("Ship 🚀 to 🇯🇵 and 👨‍👩‍👧‍👦!");
    const emoji = tokens.filter((token) => token.category === "emoji");

    expect(emoji.map((token) => token.text)).toEqual(["🚀", "🇯🇵", "👨‍👩‍👧‍👦"]);
    expect(emoji.every((token) => token.bytes >= 4)).toBe(true);
  });

  it("handles mixed code and text reasonably", () => {
    const tokens = tokenize("const x = value ?? 42;\nif (x >= 10) return x;");

    expect(tokens.map((token) => [token.text, token.category])).toContainEqual([
      "const",
      "word",
    ]);
    expect(tokens.map((token) => [token.text, token.category])).toContainEqual([
      "??",
      "operator",
    ]);
    expect(tokens.map((token) => [token.text, token.category])).toContainEqual([
      ">=",
      "operator",
    ]);
    expect(tokens.map((token) => [token.text, token.category])).toContainEqual([
      "42",
      "number",
    ]);
  });

  it("handles long text without dropping content", () => {
    const text = `${"token ".repeat(2_000)}done`;
    const tokens = tokenize(text);

    expect(tokens.map((token) => token.text).join("")).toBe(text);
    expect(tokens).toHaveLength(4_001);
    expect(tokens[tokens.length - 1]).toMatchObject({
      text: "done",
      byteEnd: byteLength(text),
    });
  });
});

describe("summary helpers", () => {
  it("summarizes model context percentage and estimated cost", () => {
    const text = "one two three four";
    const tokens = tokenize(text);
    const summary = summarizeTokens(text, tokens, {
      name: "Test model",
      contextWindow: 8,
      inputCostPerMillionTokens: 2,
    });

    expect(summary.model).toEqual({
      name: "Test model",
      contextWindow: 8,
      contextPercentage: 87.5,
      estimatedInputCost: 0.000014,
    });
    expect(estimateContextPercentage(12, 10)).toBe(100);
    expect(estimateContextPercentage(5, 10)).toBe(50);
    expect(estimateContextPercentage(5, 0)).toBe(0);
    expect(estimateInputCost(500_000, 3)).toBe(1.5);
  });
});
