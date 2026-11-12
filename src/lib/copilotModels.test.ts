import { describe, expect, it } from "vitest";

import {
  AI_CREDIT_USD_VALUE,
  AUTO_ELIGIBLE_MODEL_IDS,
  AUTO_MODEL_DISCOUNT,
  COPILOT_MODEL_OPTIONS,
  COPILOT_MODELS,
  catalogForDate,
  cacheWritePerMillionTokensUsd,
  createAutoModel,
  estimateInputAiCredits,
  estimateInputUsd,
  estimateRequestCost,
  inputAiCreditsPerMillionTokens,
  pricingForPromptTokens,
  usdToAiCredits,
  type CopilotModel,
} from "./copilotModels";

describe("Copilot model pricing", () => {
  it("uses the published AI credit conversion", () => {
    expect(AI_CREDIT_USD_VALUE).toBe(0.01);
    expect(AUTO_MODEL_DISCOUNT).toBe(0.1);
    expect(usdToAiCredits(1)).toBe(100);
  });

  it("includes current model rates and model families", () => {
    expect(price("gpt-5.4-nano")).toEqual([0.2, 0.02, undefined, 1.25]);
    expect(price("gpt-5.6-luna")).toEqual([0.2, 0.02, 0.25, 1.2]);
    expect(price("gpt-5.6-terra")).toEqual([2, 0.2, 2.5, 12]);
    expect(price("claude-sonnet-5.5")).toEqual([2, 0.1, 2.5, 10]);
    expect(price("gemini-4-carbon")).toEqual([2, 0.1, undefined, 10]);
    expect(price("kimi-k3")).toEqual([3, 0.3, undefined, 15]);
    expect(COPILOT_MODELS.every((model) => model.familyId.length > 0)).toBe(true);
  });

  it("switches the Carbon rate on its published effective date", () => {
    const before = modelAtDate("gemini-4-carbon", new Date("2026-11-30T12:00:00Z"));
    const after = modelAtDate("gemini-4-carbon", new Date("2026-12-01T12:00:00Z"));

    expect(before.pricing.inputPerMillionTokensUsd).toBe(2);
    expect(after.pricing).toMatchObject({
      inputPerMillionTokensUsd: 4,
      cachedInputPerMillionTokensUsd: 0.2,
      outputPerMillionTokensUsd: 20,
    });
    expect(after.pricingUnverified).toBeUndefined();
  });

  it("marks expired promotions unverified until replacement rates are published", () => {
    const argon = modelAtDate("gemini-4-argon", new Date("2026-12-01T00:00:00Z"));
    const flash = modelAtDate("gemini-3.8-flash", new Date("2027-01-01T00:00:00Z"));
    expect(argon.pricingUnverified).toBe(true);
    expect(flash.pricingUnverified).toBe(true);
    expect(argon.notes).toContain("Promotional pricing ended");
  });

  it("uses the long-context tier only after the threshold and for all token types", () => {
    const gptLuna = model("gpt-5.6-luna");
    const threshold = gptLuna.longContext!.thresholdInputTokens;

    expect(pricingForPromptTokens(gptLuna, threshold).tier).toBe("default");
    expect(pricingForPromptTokens(gptLuna, threshold + 1).tier).toBe("long-context");
    expect(estimateRequestCost(gptLuna, {
      inputTokens: threshold,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1,
    }).tier).toBe("default");
    expect(estimateRequestCost(gptLuna, {
      inputTokens: threshold,
      cachedInputTokens: 1,
      cacheWriteTokens: 0,
      outputTokens: 1,
    })).toMatchObject({ tier: "long-context", pricing: gptLuna.longContext!.pricing });
  });

  it("falls back to regular input pricing when cache-write pricing is absent", () => {
    const pricing = model("gpt-5.4-nano").pricing;
    expect(cacheWritePerMillionTokensUsd(pricing)).toBe(pricing.inputPerMillionTokensUsd);
    expect(cacheWritePerMillionTokensUsd(model("claude-sonnet-5.5").pricing)).toBe(2.5);
  });

  it("estimates input cost and the virtual Auto rate", () => {
    const gptLuna = model("gpt-5.6-luna");
    expect(estimateInputUsd(2_000, gptLuna)).toBe(0.0004);
    expect(estimateInputAiCredits(2_000, gptLuna)).toBeCloseTo(0.04);
    expect(inputAiCreditsPerMillionTokens(gptLuna)).toBe(20);

    const auto = COPILOT_MODEL_OPTIONS[0];
    expect(auto.id).toBe("auto");
    expect(estimateInputUsd(2_000, auto)).toBeCloseTo(0.00027);
    expect(inputAiCreditsPerMillionTokens(auto)).toBe(180);
  });

  it("keeps Auto separate and rejects models outside its eligibility list", () => {
    expect(COPILOT_MODEL_OPTIONS.filter((candidate) => candidate.id === "auto")).toHaveLength(1);
    expect(COPILOT_MODELS.some((candidate) => candidate.id === "auto")).toBe(false);
    expect(() => createAutoModel("gpt-5.4-nano")).toThrow(/not eligible for Auto/);
    for (const id of AUTO_ELIGIBLE_MODEL_IDS) {
      expect(() => createAutoModel(id)).not.toThrow();
    }
  });
});

function model(id: string) {
  const found = COPILOT_MODELS.find((candidate) => candidate.id === id);
  expect(found, `Expected model ${id} in catalog`).toBeDefined();
  return found!;
}

function modelAtDate(id: string, date: Date): CopilotModel {
  const found = catalogForDate(date).find((candidate) => candidate.id === id);
  expect(found, `Expected model ${id} in dated catalog`).toBeDefined();
  return found!;
}

function price(id: string) {
  const { pricing } = model(id);
  return [
    pricing.inputPerMillionTokensUsd,
    pricing.cachedInputPerMillionTokensUsd,
    pricing.cacheWritePerMillionTokensUsd,
    pricing.outputPerMillionTokensUsd,
  ];
}
