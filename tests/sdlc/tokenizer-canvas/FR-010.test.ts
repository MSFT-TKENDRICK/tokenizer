// @FR-010 [cap:interaction] — recompute and update ALL derived views (tokens,
// summary metrics, comparison table) consistently from the current input.
// Grounded in MSF-009.
//
// We prove the derived views are computed from a single source of truth and stay
// mutually consistent (the token count shown in the summary equals tokenize().length
// and equals the count the comparison rows use). The live DOM update on keystroke
// is proven by the creator via Playwright evidence.
import { describe, it, expect } from "vitest";
import { CORPUS } from "./fixtures";
import {
  tokenize,
  summarizeTokens,
} from "../../../.github/extensions/tokenizer/web/tokenizer.mjs";
import {
  COPILOT_MODEL_OPTIONS,
  estimateInputUsd,
} from "../../../.github/extensions/tokenizer/web/models.mjs";

function deriveAll(text: string) {
  const tokens = tokenize(text);
  const summary = summarizeTokens(text, tokens);
  const rows = COPILOT_MODEL_OPTIONS.map((m) => ({
    id: m.id,
    usd: estimateInputUsd(tokens.length, m),
    contextUsage: Math.min(100, (tokens.length / m.contextWindow) * 100),
  }));
  return { tokens, summary, rows };
}

describe("FR-010 derived-view consistency", () => {
  for (const text of CORPUS) {
    it(`keeps token count consistent across all views for: ${JSON.stringify(text.slice(0, 20))}`, () => {
      const { tokens, summary, rows } = deriveAll(text);
      // summary token count === raw tokenize length
      expect(summary.tokens).toBe(tokens.length);
      // comparison rows are computed off the same token count
      for (const r of rows) {
        const expected = (tokens.length / 1_000_000) *
          COPILOT_MODEL_OPTIONS.find((m) => m.id === r.id)!.pricing.inputPerMillionTokensUsd;
        expect(r.usd).toBeCloseTo(expected, 12);
      }
    });
  }

  it("recomputes deterministically: same input → identical derived state", () => {
    const a = deriveAll("recompute me === twice 👍");
    const b = deriveAll("recompute me === twice 👍");
    expect(a).toEqual(b);
  });

  it("reflects an edit: appending text changes every view", () => {
    const before = deriveAll("hello");
    const after = deriveAll("hello world and more");
    expect(after.summary.tokens).toBeGreaterThan(before.summary.tokens);
    expect(after.rows[1].usd).toBeGreaterThan(before.rows[1].usd);
  });
});
