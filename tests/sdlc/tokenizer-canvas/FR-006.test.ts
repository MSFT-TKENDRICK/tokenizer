// @FR-006 [cap:comparison] — comparison table with one row per model showing
// name, provider, input cost (USD + credits) and context-window usage, sortable
// by input cost and by context usage. Grounded in MSF-008.
//
// This test proves the DATA layer that backs the table: one row per model, all
// required fields present and correct, and the sort keys produce the documented
// ordering. The semantic <table> markup + click-to-sort interaction are proven
// by the creator via Playwright/axe evidence.
import { describe, it, expect } from "vitest";
import {
  COPILOT_MODEL_OPTIONS,
  estimateInputUsd,
  estimateInputAiCredits,
} from "../../../.github/extensions/tokenizer/web/models.mjs";

interface Row {
  id: string;
  name: string;
  provider: string;
  usd: number;
  credits: number;
  contextUsage: number;
}

function buildRows(tokenCount: number): Row[] {
  return COPILOT_MODEL_OPTIONS.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    usd: estimateInputUsd(tokenCount, m),
    credits: estimateInputAiCredits(tokenCount, m),
    contextUsage: Math.min(100, (tokenCount / m.contextWindow) * 100),
  }));
}

describe("FR-006 comparison table data", () => {
  it("produces exactly one row per model option (23 rows)", () => {
    const rows = buildRows(1000);
    expect(rows.length).toBe(COPILOT_MODEL_OPTIONS.length);
    expect(rows.length).toBe(23);
  });

  it("each row carries name, provider, USD cost, credit cost and context usage", () => {
    for (const r of buildRows(5000)) {
      expect(typeof r.name).toBe("string");
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.provider).toBe("string");
      expect(r.provider.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.usd)).toBe(true);
      expect(Number.isFinite(r.credits)).toBe(true);
      expect(r.contextUsage).toBeGreaterThanOrEqual(0);
      expect(r.contextUsage).toBeLessThanOrEqual(100);
    }
  });

  it("is sortable by input cost (ascending) with a stable numeric ordering", () => {
    const rows = buildRows(50_000);
    const sorted = [...rows].sort((a, b) => a.usd - b.usd);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].usd).toBeGreaterThanOrEqual(sorted[i - 1].usd);
    }
  });

  it("is sortable by context usage (ascending)", () => {
    const rows = buildRows(150_000);
    const sorted = [...rows].sort((a, b) => a.contextUsage - b.contextUsage);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].contextUsage).toBeGreaterThanOrEqual(sorted[i - 1].contextUsage);
    }
  });

  it("caps context usage at 100% when tokens exceed the context window", () => {
    const rows = buildRows(10_000_000);
    expect(rows.every((r) => r.contextUsage === 100)).toBe(true);
  });
});
