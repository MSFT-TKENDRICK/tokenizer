// @FR-005 [cap:cost-estimation] — The system MUST compute the estimated input
// cost in USD and in AI credits (1 credit = $0.01) for every model in
// COPILOT_MODEL_OPTIONS. Grounded in MSF-008.
import { describe, it, expect } from "vitest";
import {
  COPILOT_MODEL_OPTIONS,
  AI_CREDIT_USD_VALUE,
  estimateInputUsd,
  estimateInputAiCredits,
  usdToAiCredits,
} from "../../../.github/extensions/tokenizer/web/models.mjs";
import {
  COPILOT_MODEL_OPTIONS as SRC_OPTIONS,
  estimateInputUsd as srcEstimateInputUsd,
} from "../../../src/lib/copilotModels";

describe("FR-005 input cost estimation", () => {
  it("documents 1 AI credit = $0.01", () => {
    expect(AI_CREDIT_USD_VALUE).toBe(0.01);
    expect(usdToAiCredits(1)).toBe(100);
  });

  it("ports the full model catalog 1:1 from src (Auto + 22 = 23 options)", () => {
    expect(COPILOT_MODEL_OPTIONS.length).toBe(23);
    expect(COPILOT_MODEL_OPTIONS.length).toBe(SRC_OPTIONS.length);
    expect(COPILOT_MODEL_OPTIONS.map((m) => m.id)).toEqual(SRC_OPTIONS.map((m) => m.id));
  });

  it("computes USD AND credits for EVERY model in COPILOT_MODEL_OPTIONS", () => {
    const tokenCount = 12_345;
    for (const model of COPILOT_MODEL_OPTIONS) {
      const usd = estimateInputUsd(tokenCount, model);
      const credits = estimateInputAiCredits(tokenCount, model);
      const expectedUsd = (tokenCount / 1_000_000) * model.pricing.inputPerMillionTokensUsd;
      expect(usd).toBeCloseTo(expectedUsd, 12);
      // credits derive from USD via the documented conversion
      expect(credits).toBeCloseTo(usd / AI_CREDIT_USD_VALUE, 9);
      expect(usd).toBeGreaterThanOrEqual(0);
    }
  });

  it("matches the src USD estimate for every model", () => {
    const tokenCount = 7_777;
    for (let i = 0; i < COPILOT_MODEL_OPTIONS.length; i += 1) {
      expect(estimateInputUsd(tokenCount, COPILOT_MODEL_OPTIONS[i])).toBeCloseTo(
        srcEstimateInputUsd(tokenCount, SRC_OPTIONS[i]),
        12,
      );
    }
  });

  it("scales linearly and is zero at zero tokens", () => {
    const m = COPILOT_MODEL_OPTIONS[1];
    expect(estimateInputUsd(0, m)).toBe(0);
    expect(estimateInputUsd(2_000_000, m)).toBeCloseTo(2 * m.pricing.inputPerMillionTokensUsd, 9);
  });
});
