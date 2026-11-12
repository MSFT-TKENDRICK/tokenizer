import { describe, expect, it } from "vitest";

import { modelById } from "./copilotModels";
import { estimateTurnInvoice } from "./invoice";
import { tokenize } from "./tokenizer";

const sections = [
  { id: "system", label: "System prompt", content: "<system>unchanged context</system>" },
  { id: "user", label: "User message", content: "<userRequest>first request</userRequest>" },
] as const;

describe("turn invoice estimates", () => {
  it("estimates cache reads from the longest shared input prefix and cache-writes the remainder", () => {
    const model = modelById("gpt-5.6-luna")!;
    const first = estimateTurnInvoice(model, sections, "", "raw answer");
    const secondSections = [
      sections[0],
      { ...sections[1], content: "<userRequest>second request</userRequest>" },
    ] as const;
    const second = estimateTurnInvoice(model, secondSections, first.requestText, "second answer");
    const firstTokens = tokenize(first.requestText).map((token) => token.text);
    const secondTokens = tokenize(second.requestText).map((token) => token.text);
    let shared = 0;
    while (shared < firstTokens.length && firstTokens[shared] === secondTokens[shared]) {
      shared += 1;
    }

    expect(first.total.cacheWriteTokens).toBeGreaterThan(0);
    expect(first.total.inputTokens).toBe(0);
    expect(second.total.cachedTokens).toBe(shared);
    expect(second.total.cacheWriteTokens).toBe(secondTokens.length - shared);
    expect(second.rows.reduce((sum, row) => sum + row.cachedTokens, 0)).toBe(shared);
  });

  it("uses regular input when no cache-write rate is published and bills raw response text", () => {
    const model = modelById("gpt-5.4-nano")!;
    const response = "raw answer";
    const estimate = estimateTurnInvoice(model, sections, "", response);

    expect(estimate.total.inputTokens).toBe(tokenize(estimate.requestText).length);
    expect(estimate.total.cacheWriteTokens).toBe(0);
    expect(estimate.total.outputTokens).toBe(tokenize(response).length);
    expect(estimate.total.outputTokens).toBeLessThan(tokenize(`<assistantResponse>${response}</assistantResponse>`).length);
  });

  it("reconciles row token allocations across multiple sections", () => {
    const model = modelById("gpt-5.6-luna")!;
    const threeSections = [
      { id: "system", label: "System prompt", content: "<system>unchanged context</system>" },
      { id: "history", label: "History", content: "<history>earlier turn</history>" },
      { id: "user", label: "User message", content: "<userRequest>first request</userRequest>" },
    ] as const;
    const first = estimateTurnInvoice(model, threeSections, "", "answer one");
    const changedSections = [
      threeSections[0],
      threeSections[1],
      { ...threeSections[2], content: "<userRequest>second request, longer</userRequest>" },
    ] as const;
    const second = estimateTurnInvoice(model, changedSections, first.requestText, "answer two");
    const sum = (key: "inputTokens" | "cachedTokens" | "cacheWriteTokens" | "outputTokens") =>
      second.rows.reduce((total, row) => total + row[key], 0);

    expect(second.total.cachedTokens).toBeGreaterThan(0);
    expect(second.total.cacheWriteTokens).toBeGreaterThan(0);
    expect(sum("inputTokens")).toBe(second.total.inputTokens);
    expect(sum("cachedTokens")).toBe(second.total.cachedTokens);
    expect(sum("cacheWriteTokens")).toBe(second.total.cacheWriteTokens);
    expect(sum("outputTokens")).toBe(second.total.outputTokens);
    expect(
      sum("cachedTokens") + sum("cacheWriteTokens") + sum("inputTokens"),
    ).toBe(tokenize(second.requestText).length);
  });

  it("counts output against the full request context", () => {
    const model = modelById("gpt-5.4-nano")!;
    const estimate = estimateTurnInvoice(model, sections, "", "one");

    expect(estimate.total.contextTokens).toBe(estimate.total.promptTokens + estimate.total.outputTokens);
    expect(estimate.total.contextPercentage).toBeCloseTo(
      (estimate.total.contextTokens / model.contextWindow) * 100,
    );
  });
});
