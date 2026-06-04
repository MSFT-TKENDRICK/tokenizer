import { describe, expect, it } from "vitest";

import {
  AI_CREDIT_USD_VALUE,
  AUTO_MODEL_DISCOUNT,
  COPILOT_MODEL_OPTIONS,
  COPILOT_MODELS,
  estimateInputAiCredits,
  estimateInputUsd,
  inputAiCreditsPerMillionTokens,
  usdToAiCredits,
} from "./copilotModels";

describe("Copilot model pricing", () => {
  it("uses the GitHub AI Credits conversion from Copilot billing docs", () => {
    expect(AI_CREDIT_USD_VALUE).toBe(0.01);
    expect(AUTO_MODEL_DISCOUNT).toBe(0.1);
    expect(usdToAiCredits(1)).toBe(100);
  });

  it("matches the published Copilot model input, cached input, cache write, and output prices", () => {
    expect(priceRows()).toMatchObject({
      "gpt-5-mini": [0.25, 0.025, undefined, 2],
      "gpt-5.2": [1.75, 0.175, undefined, 14],
      "gpt-5.2-codex": [1.75, 0.175, undefined, 14],
      "gpt-5.3-codex": [1.75, 0.175, undefined, 14],
      "gpt-5.4": [2.5, 0.25, undefined, 15],
      "gpt-5.4-mini": [0.75, 0.075, undefined, 4.5],
      "gpt-5.4-nano": [0.2, 0.02, undefined, 1.25],
      "gpt-5.5": [5, 0.5, undefined, 30],
      "claude-haiku-4.5": [1, 0.1, 1.25, 5],
      "claude-sonnet-4": [3, 0.3, 3.75, 15],
      "claude-sonnet-4.5": [3, 0.3, 3.75, 15],
      "claude-sonnet-4.6": [3, 0.3, 3.75, 15],
      "claude-opus-4.5": [5, 0.5, 6.25, 25],
      "claude-opus-4.6": [5, 0.5, 6.25, 25],
      "claude-opus-4.7": [5, 0.5, 6.25, 25],
      "claude-opus-4.8": [5, 0.5, 6.25, 25],
      "gemini-2.5-pro": [1.25, 0.125, undefined, 10],
      "gemini-3-flash": [0.5, 0.05, undefined, 3],
      "gemini-3.1-pro": [2, 0.2, undefined, 12],
      "gemini-3.5-flash": [1.5, 0.15, undefined, 9],
      "raptor-mini": [0.25, 0.025, undefined, 2],
      "mai-code-1-flash": [0.75, 0.075, undefined, 4.5],
    });
  });

  it("estimates prompt input USD and AI credits from selected model input prices", () => {
    const gpt55 = model("gpt-5.5");

    expect(estimateInputUsd(2_000, gpt55)).toBe(0.01);
    expect(estimateInputAiCredits(2_000, gpt55)).toBe(1);
    expect(inputAiCreditsPerMillionTokens(gpt55)).toBe(500);

    const gpt54 = model("gpt-5.4");
    expect(estimateInputAiCredits(2_000, gpt54)).toBe(0.5);
    expect(inputAiCreditsPerMillionTokens(gpt54)).toBe(250);

    const auto = COPILOT_MODEL_OPTIONS[0];
    expect(auto.id).toBe("auto");
    expect(estimateInputUsd(2_000, auto)).toBeCloseTo(0.009);
    expect(estimateInputAiCredits(2_000, auto)).toBeCloseTo(0.9);
    expect(inputAiCreditsPerMillionTokens(auto)).toBe(450);
  });

  it("keeps legacy request multipliers separate from usage-based AI credit pricing", () => {
    expect(model("gpt-5.5").legacyPremiumRequestMultiplier).toBe(57);
    expect(model("claude-opus-4.5").legacyPremiumRequestMultiplier).toBe(15);
    expect(model("claude-opus-4.8").legacyPremiumRequestMultiplier).toBe(27);
    expect(model("claude-sonnet-4").legacyPremiumRequestMultiplier).toBeUndefined();
    expect(COPILOT_MODEL_OPTIONS[0].legacyPremiumRequestMultiplier).toBeCloseTo(51.3);
  });

  it("keeps Auto as a single virtual model option outside provider groups", () => {
    expect(COPILOT_MODEL_OPTIONS.filter((candidate) => candidate.id === "auto")).toHaveLength(1);
    expect(COPILOT_MODELS.some((candidate) => candidate.id === "auto")).toBe(false);
  });
});

function model(id: string) {
  const found = COPILOT_MODELS.find((candidate) => candidate.id === id);
  expect(found).toBeDefined();
  return found!;
}

function priceRows() {
  return Object.fromEntries(
    COPILOT_MODELS.map((model) => [
      model.id,
      [
        model.pricing.inputPerMillionTokensUsd,
        model.pricing.cachedInputPerMillionTokensUsd,
        model.pricing.cacheWritePerMillionTokensUsd,
        model.pricing.outputPerMillionTokensUsd,
      ],
    ]),
  );
}
