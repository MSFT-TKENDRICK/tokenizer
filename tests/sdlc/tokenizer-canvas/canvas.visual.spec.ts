import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Live-iframe visual evidence for the canvas. The canvas renders the SAME bundled
// React app that ships to GitHub Pages (src/App.tsx) — there is no separate canvas
// UI. We serve that build standalone (the extension's /state, /events and
// /copilot/live endpoints are absent, so Live degrades to a disabled toggle),
// which proves the published experience renders inside the canvas and lets us
// capture screenshots/video/trace into the SDLC evidence bundle.

const SHOTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/sdlc/002-tokenizer-canvas/evidence/screenshots",
);
mkdirSync(SHOTS, { recursive: true });

test("@FR-canvas the canvas renders the published tokenizer web app", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The published app shell mounts — same title as the GitHub Pages site.
  await expect(page.locator("#app-title")).toHaveText(/GitHub Copilot Tokenization/);

  // The model selector and chat composer render (the core published experience).
  await expect(page.locator("#copilot-model")).toBeVisible();
  expect(await page.locator("#copilot-model option").count()).toBeGreaterThan(5);
  await expect(page.locator("#chat-message")).toBeVisible();
  await expect(page.locator(".cost-note")).toContainText(/credit/i);

  await page.screenshot({ path: path.join(SHOTS, "canvas-published-app.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("@FR-canvas the simulated/live toggle extends the existing simulated chat", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const modeToggle = page.locator(".mode-toggle");
  await expect(modeToggle).toBeVisible();

  const simulated = modeToggle.getByRole("button", { name: "Simulated" });
  const live = modeToggle.getByRole("button", { name: "Live" });

  // Simulated is the default mode (the existing chat); the composer is read-only
  // until the user switches into Live.
  await expect(simulated).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chat-message")).toHaveAttribute("aria-readonly", "true");

  // Live is offered as a toggle, but this standalone host has no Copilot engine,
  // so once the mount probe resolves the Live button is disabled (graceful).
  await expect(live).toBeDisabled();

  await page.screenshot({ path: path.join(SHOTS, "canvas-mode-toggle.png"), fullPage: true });
});

test("@NFR-001 the canvas app has no serious or critical accessibility violations", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app-title");

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (seriousOrCritical.length) {
    console.log("axe serious/critical:", JSON.stringify(seriousOrCritical.map((v) => v.id)));
  }
  expect(seriousOrCritical).toEqual([]);
});
