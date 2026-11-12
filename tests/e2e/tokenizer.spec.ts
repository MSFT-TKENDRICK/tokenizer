import { expect, type Page, test } from "@playwright/test";
import { defaultUserRequest, promptPatchLayers } from "../../src/lib/examples";
import { tokenize } from "../../src/lib/tokenizer";

const heroHeading = ">_ GitHub Copilot Tokenization";

test.beforeEach(async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  (testInfo as typeof testInfo & { browserErrors: string[] }).browserErrors = browserErrors;

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: heroHeading })).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  const errors = (testInfo as typeof testInfo & { browserErrors?: string[] }).browserErrors ?? [];
  expect(errors, "Browser console errors and page errors").toEqual([]);
  await expect(page).toHaveTitle(/Copilot Token Estimator — Local Demo/);
});

test("clearly identifies the local estimate and current official references", async ({ page }) => {
  await expect(page.getByText(/does not connect to GitHub Copilot or send your messages anywhere/)).toBeVisible();
  await expect(page.getByLabel("Chat message input")).toHaveValue(defaultUserRequest);
  await expect(page.getByLabel("Assumed Auto model route")).toHaveValue("claude-sonnet-5.5");
  await expect(page.getByText(/Pricing checked/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Auto model details" })).toHaveAttribute(
    "href",
    "https://docs.github.com/en/copilot/concepts/models/auto-model-selection",
  );
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Draft estimate");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Cache write");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Cached");
  await expect(page.getByLabel("References")).toContainText("Supported AI models in GitHub Copilot");
});

test("switches accessible views and shows approximate positions instead of invented token IDs", async ({ page }) => {
  const tabs = page.getByRole("tablist", { name: "Tokenizer view mode" });
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(/<userRequest>/);
  await expect(page.locator(".plaintext-highlight .xml-tag").first()).toBeVisible();

  await page.getByRole("tab", { name: "Tokens" }).click();
  const tokenStream = page.getByLabel("Token text view");
  await expect(tokenStream).toContainText("GitHub Copilot");
  await expect(page.locator(".token-segment").first()).toHaveAttribute(
    "title",
    /Token 1 .* illustrative position 1/,
  );
  await page.getByRole("tab", { name: "Positions" }).click();
  await expect(page.getByLabel("Illustrative token positions")).toBeVisible();
  await expect(page.getByLabel("Illustrative token positions").locator(".token-segment").first()).toHaveText("1");

  await tabs.getByRole("tab", { name: "Positions" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Tokens" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Tokens" })).toBeFocused();
});

test("edits the local plaintext estimate and submits user-authored chat messages", async ({ page }) => {
  const editor = page.getByLabel("Plaintext editor");
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await editor.fill("Changed local prompt 🔍");
  await expect(page.getByText(/Editing it updates token and invoice estimates/)).toBeVisible();
  await expect(inlineMetric(page, "tokens")).toHaveText(String(tokenize("Changed local prompt 🔍").length));

  const composer = page.getByLabel("Chat message input");
  await composer.fill("Please inspect this sample code.");
  await page.getByRole("button", { name: "Submit user message" }).click();
  await expect(page.getByLabel("Chat transcript")).toContainText("Please inspect this sample code.");
  await expect(page.getByLabel("Chat transcript")).toContainText("Example assistant reply 1");
  await expect(page.getByLabel("Chat transcript")).toContainText("canned response");
  await expect(composer).toHaveValue("");
  await expect(page.getByLabel("Conversation turn invoice navigation")).toContainText("Turn 1 of 1");
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(editor).toHaveValue(/Please inspect this sample code\./);
});

test("keeps draft invoices aligned with edited prompts and formats tiny estimates", async ({ page }) => {
  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption("gpt-5.4-nano");
  await page.getByRole("button", { name: "Submit user message" }).click();
  await page.getByRole("tab", { name: "Plaintext" }).click();
  const editor = page.getByLabel("Plaintext editor");

  await page.getByRole("button", { name: "Workspace context" }).click();
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Draft estimate");
  expect(await invoiceValue(page, "Draft estimate", 3)).toBe(0);
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Workspace");

  await editor.fill("x");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Edited prompt");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Draft estimate");
  expect(await invoiceValue(page, "Draft estimate", 3)).toBe(0);
  await expect(page.locator(".cost-note")).toContainText(/0\.0000/);
  await expect(page.locator(".cost-note")).toContainText(/\$0\.0000002/);
  await expect(inlineMetric(page, "tokens")).toHaveText("1");
});

test("shows the saved model context for a historical turn", async ({ page }) => {
  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption("gpt-5.4-nano");
  await page.getByRole("button", { name: "Submit user message" }).click();
  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption("claude-sonnet-5.5");

  const contextBox = page.locator(".context-box");
  await expect(contextBox).toContainText(/GPT-5\.4 nano/i);
  await expect(contextBox).toContainText(/tokens remaining in a .* token window/);
});

test("supports more than the former five bundled turns and itemizes cached usage", async ({ page }) => {
  const composer = page.getByLabel("Chat message input");
  const submit = page.getByRole("button", { name: "Submit user message" });
  await submit.click();

  for (let turn = 2; turn <= 7; turn += 1) {
    await composer.fill(`User-authored message ${turn}`);
    await submit.click();
  }

  await expect(page.getByLabel("Conversation turn invoice navigation")).toContainText("Turn 7 of 7");
  await expect(page.getByLabel("Chat transcript")).toContainText("User-authored message 7");
  await expect(page.getByLabel("Chat transcript")).toContainText("Example assistant reply 7");
  await expect(page.getByRole("button", { name: "Submit user message" })).toBeDisabled();
  await expect(page.getByLabel("Prompt cost invoice").getByRole("columnheader", { name: "Cache write" })).toBeVisible();
  expect(await invoiceValue(page, "Assistant response", 3)).toBeGreaterThan(0);
  expect(await invoiceValue(page, "Turn total", 1) + await invoiceValue(page, "Turn total", 2)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Previous conversation turn" }).click();
  await expect(page.getByLabel("Conversation turn invoice navigation")).toContainText("Turn 6 of 7");
});

test("uses a selectable Auto route and preserves per-turn invoice rates", async ({ page }) => {
  const routeSelect = page.getByLabel("Assumed Auto model route");
  await routeSelect.selectOption("gpt-5.6-luna");
  await expect(routeSelect).toHaveValue("gpt-5.6-luna");
  await expect(page.getByText(/Auto has a 10% discount/)).toBeVisible();
  const submit = page.getByRole("button", { name: "Submit user message" });
  await submit.click();

  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption("gpt-5.4-nano");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("$0.20/1M");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Conversation total");
  await expect(page.getByLabel("Prompt cost invoice").locator("tr", { hasText: "Turn total" })).toBeVisible();
  await expect(page.getByLabel("Prompt cost invoice").locator("tr", { hasText: "Turn total" }).locator("td").last())
    .toHaveAttribute("title", /AI credits total/);
});

test("adds and removes illustrative prompt context and resets the complete simulation", async ({ page }) => {
  const workspaceButton = page.getByRole("button", { name: /Workspace context/ });
  await workspaceButton.click();
  await expect(workspaceButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(/<workspace_info>/);
  await page.getByLabel("Plaintext editor").fill("Manually edited local prompt");
  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption("gpt-5.4-nano");
  await expect(page.getByLabel("Chat transcript")).toHaveCount(0);

  await page.getByRole("button", { name: "Reset simulation" }).click();
  await expect(page.getByLabel("Chat message input")).toHaveValue(defaultUserRequest);
  await expect(page.getByLabel("GitHub Copilot model", { exact: true })).toHaveValue("auto");
  await expect(page.getByLabel("Assumed Auto model route")).toHaveValue("claude-sonnet-5.5");
  await expect(page.getByLabel("Conversation turn invoice navigation")).toContainText("Turn 0 of 0");
  await expect(workspaceButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Chat transcript")).toHaveText("");
  await expect(page.locator(".patch-layer-button")).toHaveCount(promptPatchLayers.length);
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(/<userRequest>/);
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(/tell me something new/);
  await expect(page.getByLabel("Plaintext editor")).not.toHaveValue(/Manually edited local prompt/);
});

test("keeps the mobile layout within the viewport with system and fallback fonts", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByRole("heading", { name: heroHeading })).toBeVisible();
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByLabel("Token text view")).toBeVisible();

  for (const font of ["system", "fallback"]) {
    if (font === "fallback") {
      await page.addStyleTag({ content: ':root { --font-mono: "Courier New", monospace; }' });
    }
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `${font} font at ${width}px`).toBe(false);
    }
  }
});

function inlineMetric(page: Page, label: string) {
  return page.locator(`[data-metric="${label}"] dd`);
}

async function invoiceValue(page: Page, label: string, columnIndex: number) {
  const text = await page.getByLabel("Prompt cost invoice").locator("tr", { hasText: label }).locator("td").nth(columnIndex).textContent();
  return Number(text?.replace(/,/g, "") ?? 0);
}
