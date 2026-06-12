import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Live-iframe visual evidence for spec 002. The canvas UI is served standalone
// (the extension's /state + /events are absent; the iframe degrades gracefully),
// which lets us prove the rendered DOM, the non-color affordances, table
// semantics, sorting, the over-limit highlight, and a11y — and capture
// screenshots/video/trace into the SDLC evidence bundle.

const SHOTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/sdlc/002-tokenizer-canvas/evidence/screenshots",
);
mkdirSync(SHOTS, { recursive: true });

const SAMPLE = "Hello canvas 🚀 — tokens cost credits!";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#text-input");
});

test("@FR-003 @FR-010 summary metrics render and update live as the user types", async ({ page }) => {
  await page.fill("#text-input", SAMPLE);
  // FR-010: derived views update on input without manual refresh.
  await expect(page.locator("#stat-tokens")).toHaveText("14");
  await expect(page.locator("#stat-characters")).toHaveText("37");
  await expect(page.locator("#stat-bytes")).toHaveText("42");
  await expect(page.locator("#stat-words")).toHaveText("5");
  await expect(page.locator("#stat-lines")).toHaveText("1");
  await page.screenshot({ path: path.join(SHOTS, "FR-003-summary.png"), fullPage: true });

  // Editing changes every view (FR-010).
  await page.fill("#text-input", `${SAMPLE} more words here`);
  await expect(page.locator("#stat-tokens")).not.toHaveText("14");
});

test("@FR-004 token segments render with a non-color affordance (label + legend pattern)", async ({ page }) => {
  await page.fill("#text-input", SAMPLE);
  const chips = page.locator(".token-chip");
  await expect(chips.first()).toBeVisible();
  expect(await chips.count()).toBeGreaterThan(0);

  // Categories carried on each chip (used for both color and label).
  const cats = await page.$$eval(".token-chip", (els) =>
    Array.from(new Set(els.map((e) => (e as HTMLElement).dataset.category))),
  );
  expect(cats).toContain("word");
  expect(cats).toContain("emoji");

  // Non-color affordance #1: per-chip category label text exists (revealed by toggle).
  await page.check("#label-toggle");
  await expect(page.locator("#token-stream")).toHaveClass(/show-labels/);
  await expect(page.locator(".token-chip").first().locator(".token-cat")).toHaveText(/\w+/);

  // Non-color affordance #2: legend swatches use distinct border-styles per category.
  const styles = await page.$$eval(".legend-swatch", (els) =>
    Array.from(new Set(els.map((e) => getComputedStyle(e as HTMLElement).borderBottomStyle))),
  );
  expect(styles.length).toBeGreaterThan(1); // not relying on color alone
  await page.screenshot({ path: path.join(SHOTS, "FR-004-tokens-labeled.png"), fullPage: true });
});

test("@FR-006 @NFR-001 comparison table is semantic and sortable by cost & context", async ({ page }) => {
  await page.fill("#text-input", SAMPLE);

  // NFR-001: semantic table markup with a header row.
  await expect(page.locator("table.models-table thead th[scope=col]")).toHaveCount(5);
  const rowCount = await page.locator("#models-body tr").count();
  expect(rowCount).toBe(23); // Auto + 22 catalog models

  // Sortable by input cost (USD). USD is the default sort key (ascending), so
  // assert the initial ascending order, then a click toggles to descending.
  await expect(page.locator('th:has(.sort-btn[data-sort="usd"])')).toHaveAttribute("aria-sort", "ascending");
  const usdAsc = await page.$$eval("#models-body tr td:nth-child(3)", (tds) =>
    tds.map((t) => Number((t.textContent ?? "").replace(/[^0-9.]/g, ""))),
  );
  expect([...usdAsc].sort((a, b) => a - b)).toEqual(usdAsc);

  // Click the active column = toggle to descending.
  await page.click('.sort-btn[data-sort="usd"]');
  await expect(page.locator('th:has(.sort-btn[data-sort="usd"])')).toHaveAttribute("aria-sort", "descending");
  const usdDesc = await page.$$eval("#models-body tr td:nth-child(3)", (tds) =>
    tds.map((t) => Number((t.textContent ?? "").replace(/[^0-9.]/g, ""))),
  );
  expect([...usdDesc].sort((a, b) => b - a)).toEqual(usdDesc);
  await page.click('.sort-btn[data-sort="context"]');
  await expect(page.locator('th:has(.sort-btn[data-sort="context"])')).toHaveAttribute("aria-sort", "ascending");
  await page.screenshot({ path: path.join(SHOTS, "FR-006-table-sorted.png"), fullPage: true });

  // NFR-001: axe scan — fail only on serious/critical violations.
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (seriousOrCritical.length) {
    console.log("axe serious/critical:", JSON.stringify(seriousOrCritical.map((v) => v.id)));
  }
  expect(seriousOrCritical).toEqual([]);
});

test("@FR-007 models over the context window get a non-color over-limit affordance", async ({ page }) => {
  // ~130,000 tokens exceeds the 128K-window models (e.g. GPT-5 mini).
  const big = "ab ".repeat(65_000);
  await page.$eval(
    "#text-input",
    (el, val) => {
      (el as HTMLTextAreaElement).value = val as string;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    big,
  );

  const overRows = page.locator("#models-body tr.over-limit");
  expect(await overRows.count()).toBeGreaterThan(0);
  // Non-color affordance: textual "▲ over" flag, not just a colour.
  await expect(overRows.first().locator(".over-flag")).toHaveText(/over/);
  await page.screenshot({ path: path.join(SHOTS, "FR-007-over-limit.png"), fullPage: true });
});
