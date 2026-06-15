// @NFR-002 [cap:interaction] — Recomputing the full set of derived views after an
// input change MUST complete in under 50 ms for inputs up to 10,000 tokens.
// Grounded in MSF-009.
//
// We benchmark the pure recompute pipeline (tokenize → summarize → per-model cost
// for all 23 models) the canvas runs on every edit. We measure the median of N
// runs after a warmup to avoid JIT/GC noise.
import { describe, it, expect } from "vitest";
import { buildLargeInput } from "./fixtures";
import {
  tokenize,
  summarizeTokens,
} from "../../../.github/extensions/tokenizer/web/tokenizer.mjs";
import {
  COPILOT_MODEL_OPTIONS,
  estimateInputUsd,
  estimateInputAiCredits,
} from "../../../.github/extensions/tokenizer/web/models.mjs";

function recompute(text: string): number {
  const tokens = tokenize(text);
  const summary = summarizeTokens(text, tokens);
  let acc = summary.tokens;
  for (const m of COPILOT_MODEL_OPTIONS) {
    acc += estimateInputUsd(tokens.length, m) + estimateInputAiCredits(tokens.length, m);
    acc += Math.min(100, (tokens.length / m.contextWindow) * 100);
  }
  return acc;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

describe("NFR-002 recompute latency budget (<50ms @ 10k tokens)", () => {
  it("produces ~10,000 tokens from the large fixture", () => {
    const input = buildLargeInput(10_000);
    expect(tokenize(input).length).toBeGreaterThanOrEqual(10_000);
  });

  it("recomputes all derived views in under 50ms (median of 7 runs)", () => {
    const input = buildLargeInput(10_000);
    // warmup
    for (let i = 0; i < 3; i += 1) recompute(input);
    const samples: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const t0 = performance.now();
      recompute(input);
      samples.push(performance.now() - t0);
    }
    const med = median(samples);
    // Report for the evidence trail.
    // eslint-disable-next-line no-console
    console.log(`NFR-002 recompute median=${med.toFixed(2)}ms samples=${samples.map((s) => s.toFixed(1)).join(",")}`);
    expect(med).toBeLessThan(50);
  });
});
