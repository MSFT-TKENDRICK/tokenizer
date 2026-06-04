import { expect, type Page, test } from "@playwright/test";
import { composePrompt, promptPatchLayers } from "../../src/lib/examples";

const basePrompt = composePrompt([]);
const allLayerIds = promptPatchLayers.map((layer) => layer.id);
const fullPrompt = composePrompt(allLayerIds);

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
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(basePrompt);
  await expect(page.getByLabel("Prompt metrics")).toContainText(/\d+tokens/);
  await expect(page.getByLabel("GitHub Copilot model selector")).toBeVisible();
  await expect(page.getByRole("tab", { name: "OpenAI" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("GitHub Copilot model", { exact: true })).toHaveValue("gpt-5.5");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("57x");
  await expect(page.getByLabel("Prompt patch diffs")).toBeVisible();
  await expect(page.getByLabel("Selected patch diff preview")).toContainText("No diffs applied.");
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
  await expect(stream).toContainText("coding_agent_instructions");

  const firstToken = page.locator(".token-segment").first();
  await expect(firstToken).toHaveText("<");
  await expect(firstToken).toHaveAttribute("title", /Token 1 · operator · 1 bytes · ID \d+/);
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

test("Clear empties state and Reset patches restores the base prompt", async ({ page }) => {
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue("");
  await expect(page.getByLabel("Plaintext editor")).toHaveValue("");
  await expect(inlineMetric(page, "tokens")).toHaveText("0");
  await expect(inlineMetric(page, "characters")).toHaveText("0");
  await expect(inlineMetric(page, "words")).toHaveText("0");
  await expect(inlineMetric(page, "bytes")).toHaveText("0");

  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByText("Add text in Plaintext view to inspect token boundaries.")).toBeVisible();

  await page.getByRole("button", { name: "Reset patches" }).click();
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(basePrompt);
});

test("patch layer buttons apply and remove prompt diffs", async ({ page }) => {
  const workspaceButton = page.getByRole("button", { name: /Workspace/ });
  const toolsButton = page.getByRole("button", { name: /Tools/ });
  const editor = page.getByLabel("Plaintext editor");
  const baseTokens = Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""));

  await expect(workspaceButton).toHaveAttribute("aria-pressed", "false");
  await workspaceButton.click();
  await expect(workspaceButton).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(composePrompt(["workspace"]));
  await expect(page.getByLabel("Selected patch diff preview")).toContainText("diff --git");
  await expect(page.getByLabel("Selected patch diff preview")).toContainText("+<workspace_info>");
  expect(Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""))).toBeGreaterThan(baseTokens);

  await toolsButton.click();
  await expect(editor).toHaveValue(composePrompt(["workspace", "tools"]));
  await expect(page.getByLabel("Selected patch diff preview")).toContainText("+<name>web-design-reviewer</name>");
  await expect(page.getByLabel("Selected patch diff preview")).toContainText("+<instruction forToolsWithPrefix=\"mcp_github\">");

  await workspaceButton.click();
  await expect(workspaceButton).toHaveAttribute("aria-pressed", "false");
  await expect(editor).toHaveValue(composePrompt(["tools"]));
  await expect(editor).not.toHaveValue(/workspace_info/);
});

test("patch layers isolate canonical Copilot context sources", async ({ page }) => {
  const expectedFragments = [
    ["Workspace", "workspace_info"],
    ["AGENTS.md", "AGENTS.md"],
    ["Repo instructions", ".github/copilot-instructions.md"],
    ["Tools", "mcp_github"],
    ["Custom agent", "SecurityReviewer"],
    ["Terminal", "Terminals:"],
  ] as const;

  for (const [name, fragment] of expectedFragments) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    expect(await page.getByLabel("Plaintext editor").inputValue()).toContain(fragment);
  }

  await expect(page.getByLabel("Plaintext editor")).toHaveValue(fullPrompt);
});

test("model selector changes context copy and meter width", async ({ page }) => {
  const longPrompt = `${"token ".repeat(1_000)}done`;
  await page.getByLabel("Plaintext editor").fill(longPrompt);
  await expect(inlineMetric(page, "tokens")).toHaveText("2,001");

  const meter = page.locator(".meter span");
  const initialWidth = await meter.evaluate((element) => getComputedStyle(element).width);

  await expect(page.locator(".context-label")).toContainText("GPT-5.5");
  await expect(page.locator(".context-label strong")).toHaveText("1.6%");
  await expect(page.getByText("125,999 tokens remaining in a 128,000 token window.")).toBeVisible();
  await expect(page.getByText("Estimated input usage: $0 at current Copilot usage-based pricing.")).toBeVisible();

  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption({ label: "GPT-5.4 · 272,000 tokens" });
  await expect(page.locator(".context-label")).toContainText("GPT-5.4");
  await expect(page.locator(".context-label strong")).toHaveText("0.7%");
  await expect(page.getByText("269,999 tokens remaining in a 272,000 token window.")).toBeVisible();
  await expect(page.getByLabel("Model pricing metadata")).toContainText("$2.5/1M");

  const largerContextWidth = await meter.evaluate((element) => getComputedStyle(element).width);
  expect(parseFloat(largerContextWidth)).toBeLessThan(parseFloat(initialWidth));

  await page.getByRole("tab", { name: "Claude" }).click();
  await expect(page.getByRole("tab", { name: "Claude" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("GitHub Copilot model", { exact: true })).toHaveValue("claude-haiku-4.5");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("0.33x");
});

test("mobile viewport keeps visible features usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Tokenizer workspace" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "OpenAI" })).toBeVisible();
  await expect(page.getByLabel("Plaintext editor")).toBeVisible();
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByLabel("Token text view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Workspace patch/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Workspace patch/ }).locator("svg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset patches" })).toBeVisible();
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
