import { expect, type Page, test } from "@playwright/test";

const copilotSystemPrompt =
  "Public-safe GitHub Copilot-style system prompt for token planning (not a hidden or internal prompt):\n\nYou are GitHub Copilot, an AI pair programmer working in a repository. Help the developer make precise, working code changes. Read repository instructions before editing. Preserve user changes. Prefer existing scripts, tests, and conventions. When changing this tokenizer app, apply DESIGN.md, keep the PWA fast, validate with design lint, unit tests, typecheck, build, E2E, and visual checks, and publish only to MSFT-TKENDRICK/tokenizer when asked.";
const agentSkills =
  "GitHub Copilot agent skill example:\n\nUse the xlsx skill when a spreadsheet is the primary input or output. Read the workbook, preserve formulas and formatting, add the requested summary sheet, and save a new .xlsx file. For this tokenizer repo, use the web artifact/design workflow only for standalone HTML artifacts; otherwise keep changes in React, TypeScript, and CSS. Do not expose secrets, do not overwrite unrelated work, and run the repo's validation scripts before finishing.";
const mcpTools =
  "GitHub Copilot MCP tools example:\n\nConnect Copilot Chat to Model Context Protocol servers so the agent can use approved tools. A workspace might configure a GitHub MCP server for issues, pull requests, commits, and repository metadata, plus a fetch MCP server for documentation lookup. Ask: \"Use the GitHub MCP tools to find the latest Pages deployment for MSFT-TKENDRICK/tokenizer, inspect failures if any, then summarize the blocking workflow step.\"";
const customAgents =
  "GitHub Copilot custom agent example:\n\nCreate a repo-focused tokenizer-maintainer agent. Instructions: read DESIGN.md and .github/copilot-instructions.md first; keep the UI close to commandline.microsoft.com; maintain the shared Plaintext, Tokens, and Token IDs viewport; use Windows-style paths in local commands; run npm run design:lint, npm test, npm run typecheck, npm run build, npm run test:e2e, and npm run test:visual; never publish outside MSFT-TKENDRICK/tokenizer.";

test.beforeEach(async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  (testInfo as typeof testInfo & { browserErrors: string[] }).browserErrors = browserErrors;

  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tokenizer workspace" })).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  const errors = (testInfo as typeof testInfo & { browserErrors?: string[] }).browserErrors ?? [];
  expect(errors, "Browser console errors and page errors").toEqual([]);
  await expect(page).toHaveTitle(/Tokenizer/);
});

test("renders the tokenizer workspace with the default plaintext view", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Plaintext" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(copilotSystemPrompt);
  await expect(page.getByLabel("Prompt metrics")).toContainText(/\d+tokens/);
  await expect(page.getByLabel("Current token summary")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Prompt metrics" })).toHaveCount(0);
});

test("toggles one shared viewport between plaintext, tokens, and token IDs", async ({ page }) => {
  const plaintextBox = page.getByLabel("Plaintext editor");
  const plaintextBounds = await plaintextBox.boundingBox();
  expect(plaintextBounds).not.toBeNull();

  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByRole("tab", { name: "Tokens" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Plaintext editor")).toBeHidden();
  const stream = page.getByLabel("Token text view");
  await expect(stream).toContainText("GitHub Copilot");
  await expect(stream).toContainText("MSFT-TKENDRICK/tokenizer");

  const firstToken = page.locator(".token-segment").first();
  await expect(firstToken).toHaveText("Public-safe");
  await expect(firstToken).toHaveAttribute("title", /Token 1 · word · 11 bytes · ID \d+/);
  const tokenBounds = await stream.boundingBox();
  expect(tokenBounds?.width).toBeCloseTo(plaintextBounds?.width ?? 0, 0);

  await page.getByRole("tab", { name: "Token IDs" }).click();
  await expect(page.getByRole("tab", { name: "Token IDs" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Token ID view")).toBeVisible();
  await expect(firstToken).toHaveText(/^\d+$/);
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toBeVisible();
});

test("typing and pasting input updates counts and token visualization", async ({ page }) => {
  const textarea = page.getByLabel("Plaintext editor");

  await textarea.fill("");
  await textarea.pressSequentially("Hello, ");
  await page.keyboard.insertText("world! 🚀");

  await expect(textarea).toHaveValue("Hello, world! 🚀");
  await expect(inlineMetric(page, "tokens")).toHaveText("7");
  await expect(inlineMetric(page, "characters")).toHaveText("15");
  await expect(inlineMetric(page, "words")).toHaveText("2");
  await expect(inlineMetric(page, "bytes")).toHaveText("18");

  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.locator(".token-segment", { hasText: "Hello" })).toHaveAttribute(
    "title",
    /Token 1 · word · 5 bytes · ID \d+/,
  );
  await expect(page.locator(".token-segment", { hasText: "🚀" })).toHaveAttribute(
    "title",
    /Token 7 · emoji · 4 bytes · ID \d+/,
  );
});

test("Clear empties state and Reset example restores the default text", async ({ page }) => {
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue("");
  await expect(page.getByLabel("Plaintext editor")).toHaveValue("");
  await expect(inlineMetric(page, "tokens")).toHaveText("0");
  await expect(inlineMetric(page, "characters")).toHaveText("0");
  await expect(inlineMetric(page, "words")).toHaveText("0");
  await expect(inlineMetric(page, "bytes")).toHaveText("0");

  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByText("Add text in Plaintext view to inspect token boundaries.")).toBeVisible();

  await page.getByRole("button", { name: "Reset example" }).click();
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(copilotSystemPrompt);
});

test("example buttons load distinct examples", async ({ page }) => {
  await page.getByRole("button", { name: "Agent skills" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(agentSkills);
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.locator(".token-segment", { hasText: "xlsx" }).first()).toBeVisible();
  await expect(page.locator(".token-segment", { hasText: "DESIGN" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Plaintext" }).click();
  await page.getByRole("button", { name: "MCP tools" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(mcpTools);
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.locator(".token-segment", { hasText: "Model" }).first()).toBeVisible();
  await expect(page.locator(".token-segment", { hasText: "Context" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Plaintext" }).click();
  await page.getByRole("button", { name: "Custom agents" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(customAgents);
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.locator(".token-segment", { hasText: "tokenizer" }).first()).toBeVisible();
  await expect(page.locator(".token-segment", { hasText: "maintainer" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Plaintext" }).click();
  await page.getByRole("button", { name: "Copilot system prompt" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(copilotSystemPrompt);
});

test("model selector changes context copy and meter width", async ({ page }) => {
  const longPrompt = `${"token ".repeat(1_000)}done`;
  await page.getByLabel("Plaintext editor").fill(longPrompt);
  await expect(inlineMetric(page, "tokens")).toHaveText("2,001");

  const meter = page.locator(".meter span");
  const initialWidth = await meter.evaluate((element) => getComputedStyle(element).width);

  await page.getByLabel("Model context").selectOption({ label: "No context limit" });
  await expect(page.locator(".context-label")).toContainText("No context limit");
  await expect(page.locator(".context-label strong")).toHaveText("—");
  await expect(page.getByText("Choose a context size to estimate prompt window usage.")).toBeVisible();
  await expect(meter).toHaveAttribute("style", "width: 0%;");

  await page.getByLabel("Model context").selectOption({ label: "Small context (8K) · 8,192 tokens" });
  await expect(page.locator(".context-label")).toContainText("Small context (8K)");
  await expect(page.locator(".context-label strong")).toHaveText("24.4%");
  await expect(page.getByText("6,191 tokens remaining in a 8,192 token window.")).toBeVisible();

  const smallWidth = await meter.evaluate((element) => getComputedStyle(element).width);
  expect(parseFloat(smallWidth)).toBeGreaterThan(parseFloat(initialWidth));
});

test("mobile viewport keeps visible features usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Tokenizer workspace" })).toBeVisible();
  await expect(page.getByLabel("Plaintext editor")).toBeVisible();
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByLabel("Token text view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset example" })).toBeVisible();
  await expect(page.getByLabel("Tokenizer statistics")).toBeVisible();
  await expect(page.locator(".token-segment").first()).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

function inlineMetric(page: Page, label: string) {
  return page.locator(`[data-metric="${label}"] dd`);
}
