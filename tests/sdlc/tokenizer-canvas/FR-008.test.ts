// @FR-008 [cap:canvas-integration] — the canvas exposes agent/host-callable
// actions set_text (load text) and get_summary (return current metrics).
//
// The action wiring itself lives in extension.mjs and was runtime-validated by
// the top-level orchestrator (open_canvas/list_canvas_capabilities/
// invoke_canvas_action). Here we cross-validate the *contract values* those
// actions return against the shared pure module, so the numbers get_summary
// reports are provably correct and stable. Grounded in MSF-007.
import { describe, it, expect } from "vitest";
import { summarizeTokens } from "../../../.github/extensions/tokenizer/web/tokenizer.mjs";
import {
  COPILOT_MODEL_OPTIONS,
  modelById,
  estimateInputUsd,
} from "../../../.github/extensions/tokenizer/web/models.mjs";

describe("FR-008 canvas action contract values", () => {
  it("get_summary shape for the open() sample matches the runtime-reported metrics", () => {
    // open_canvas({text:"Hello canvas 🚀 — tokens cost credits!"})
    const s = summarizeTokens("Hello canvas 🚀 — tokens cost credits!");
    expect(s).toMatchObject({ characters: 37, bytes: 42, words: 5, lines: 1, tokens: 14 });
  });

  it("get_summary after set_text matches the runtime-reported metrics", () => {
    // set_text("const total = a + b >= 42;\nSecond line with 3 numbers: 7, 8, 9.")
    const s = summarizeTokens("const total = a + b >= 42;\nSecond line with 3 numbers: 7, 8, 9.");
    expect(s).toMatchObject({ characters: 63, bytes: 63, words: 13, lines: 2, tokens: 36 });
  });

  it("returns the five metric fields get_summary advertises", () => {
    const s = summarizeTokens("anything");
    expect(Object.keys(s).sort()).toEqual(["bytes", "characters", "lines", "tokens", "words"]);
  });

  it("model catalog + cost facts the canvas reports are stable", () => {
    expect(COPILOT_MODEL_OPTIONS.length).toBe(23);
    expect(estimateInputUsd(100_000, modelById("gpt-5.5")!)).toBeCloseTo(0.5, 9);
    expect(estimateInputUsd(100_000, modelById("auto")!)).toBeCloseTo(0.45, 9); // 10% discount
    expect(200_000 > modelById("gpt-5-mini")!.contextWindow).toBe(true); // over 128K window
  });
});
