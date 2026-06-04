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
  await expect(page.getByRole("heading", { name: "GitHub Copilot Tokenization" })).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  const errors = (testInfo as typeof testInfo & { browserErrors?: string[] }).browserErrors ?? [];
  expect(errors, "Browser console errors and page errors").toEqual([]);
  await expect(page).toHaveTitle(/GitHub Copilot Tokenization/);
});

test("renders the tokenizer workspace with the default plaintext view", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Plaintext" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "GitHub Copilot Tokenization" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Text, tokens, and token IDs" })).toHaveCount(0);
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(basePrompt);
  await expect(inlineMetric(page, "tokens")).toHaveText(/\d+/);
  await expect(page.getByLabel("Prompt metrics")).toContainText("AI credits");
  await expect(page.getByLabel("Chat message input")).toHaveValue(
    "Update the shopping cart so signed-in users can add products, edit quantities, remove items, and see the order total before checkout.",
  );
  await expect(page.getByLabel("Chat message input")).toBeFocused();
  await expect(page.getByRole("button", { name: "Submit user message" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit user message" }).locator("svg")).toBeVisible();
  await expect(page.getByText("Submit", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Chat message token and credit impact")).toContainText("tokens");
  await expect(page.getByLabel("Chat message token and credit impact")).toContainText("AI credits");
  await expect(page.getByLabel("GitHub Copilot model selector")).toBeVisible();
  await expect(page.getByLabel("GitHub Copilot model", { exact: true })).toHaveValue("auto");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("450/1M");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("$0.5/1M");
  await expect(page.getByLabel("Model pricing metadata")).not.toContainText("legacy");
  await expect(page.getByLabel("Prompt context controls")).toBeVisible();
  await expect(page.locator(".plaintext-highlight .xml-tag").first()).toBeVisible();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(/  <coding_agent_instructions>/);
  await expect(page.locator(".plaintext-highlight")).toContainText("</coding_agent_instructions>");
  await expect(page.locator(".plaintext-highlight")).toContainText("</system>");
  expect(await page.locator(".plaintext-highlight").textContent()).toBe(basePrompt);
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("System prompt");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Custom instructions");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Tools");
  await expect(page.getByLabel("Prompt cost invoice")).toContainText("Total");
  await expect(page.getByLabel("Selected context preview")).toContainText("No context added.");
  await expect(page.getByText("Diffs")).toHaveCount(0);
  await expect(page.getByText("Patch", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pricing and billing sources" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub Docs: Models and pricing for GitHub Copilot" })).toHaveAttribute(
    "href",
    "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing",
  );
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

test("plaintext prompt is read-only and chat composer updates counts", async ({ page }) => {
  const textarea = page.getByLabel("Plaintext editor");
  const chatInput = page.getByLabel("Chat message input");
  const initialPrompt = await textarea.inputValue();
  const baseTokens = Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""));

  expect(await textarea.evaluate((element) => element.readOnly)).toBe(true);
  await expect(chatInput).toHaveCSS("resize", "none");
  await textarea.focus();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await textarea.pressSequentially("Hello, ");
  await page.keyboard.insertText("world! 🚀");

  await expect(textarea).toHaveValue(initialPrompt);
  await expect(inlineMetric(page, "tokens")).toHaveText(formatMetric(baseTokens));

  await chatInput.fill("Hello, world! 🚀");
  await expect(textarea).toHaveValue(composePrompt([], "Hello, world! 🚀"));
  await expect(chatImpactMetric(page, "tokens")).toHaveText("7");
  await expect(chatImpactMetric(page, "AI credits")).toHaveText("0.0032");
  expect(Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""))).toBeLessThan(baseTokens);
  await page.getByRole("button", { name: "Submit user message" }).click();
  await expect(page.locator(".plaintext-highlight .xml-tag", { hasText: "<userRequest>" })).toBeInViewport();
  await expect(chatInput).toBeFocused();

  await page.getByRole("button", { name: /Workspace context/ }).click();
  await expect(textarea).toHaveValue(composePrompt(["workspace"], "Hello, world! 🚀"));
  expect(Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""))).toBeGreaterThan(
    Number((await chatImpactMetric(page, "tokens").textContent())?.replace(/,/g, "")),
  );
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByLabel("Token text view")).toContainText("workspace_info");
});

test("XML syntax highlighting preserves readonly closing tags while scrolling", async ({ page }) => {
  const editor = page.getByLabel("Plaintext editor");
  await expect(page.locator(".plaintext-highlight")).toHaveText(basePrompt);
  await expect(page.locator(".plaintext-highlight .xml-tag", { hasText: "</coding_agent_instructions>" })).toBeVisible();
  await expect(page.locator(".plaintext-highlight .xml-tag", { hasText: "</system>" })).toHaveCount(1);

  await editor.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(page.locator(".plaintext-highlight")).toContainText("</userRequest>");
});

test("Clear empties chat input and Restore sample restores the base prompt", async ({ page }) => {
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Chat message input")).toHaveValue("");
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(composePrompt([], ""));
  await expect(chatImpactMetric(page, "tokens")).toHaveText("0");
  await expect(chatImpactMetric(page, "AI credits")).toHaveText("0");
  expect(Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""))).toBeGreaterThan(0);

  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByLabel("Token text view")).toContainText("userRequest");

  await page.getByRole("button", { name: "Restore sample" }).click();
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(basePrompt);
  await expect(page.getByLabel("Chat message input")).toHaveValue(
    "Update the shopping cart so signed-in users can add products, edit quantities, remove items, and see the order total before checkout.",
  );
});

test("context layer buttons apply and remove prompt diffs", async ({ page }) => {
  const workspaceButton = page.getByRole("button", { name: /Workspace/ });
  const toolsButton = page.getByRole("button", { name: /Tools/ });
  const editor = page.getByLabel("Plaintext editor");
  const baseTokens = Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""));

  await expect(workspaceButton).toHaveAttribute("aria-pressed", "false");
  await workspaceButton.click();
  await expect(workspaceButton).toHaveAttribute("aria-pressed", "true");
  await expect(editor).toHaveValue(composePrompt(["workspace"]));
  await expect(page.locator(".plaintext-highlight")).toHaveText(composePrompt(["workspace"]));
  await expect(page.locator(".plaintext-highlight .xml-tag", { hasText: "<workspace_info>" })).toBeInViewport();
  await expect(page.getByLabel("Selected context preview")).toContainText("diff --git");
  await expect(page.getByLabel("Selected context preview")).toContainText("+<workspace_info>");
  expect(Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""))).toBeGreaterThan(baseTokens);

  await toolsButton.click();
  await expect(editor).toHaveValue(composePrompt(["workspace", "tools"]));
  await expect(page.locator(".plaintext-highlight")).toHaveText(composePrompt(["workspace", "tools"]));
  await expect(page.locator(".plaintext-highlight .xml-tag", { hasText: "<skills>" })).toBeInViewport();
  await expect(editor).toHaveValue(/  <skill>/);
  await expect(page.getByLabel("Selected context preview")).toContainText("+<name>web-design-reviewer</name>");
  await expect(page.getByLabel("Selected context preview")).toContainText("+<instruction forToolsWithPrefix=\"mcp_github\">");

  await workspaceButton.click();
  await expect(workspaceButton).toHaveAttribute("aria-pressed", "false");
  await expect(editor).toHaveValue(composePrompt(["tools"]));
  await expect(page.locator(".plaintext-highlight")).toHaveText(composePrompt(["tools"]));
  await expect(editor).not.toHaveValue(/workspace_info/);
});

test("context layers isolate canonical Copilot context sources", async ({ page }) => {
  const expectedFragments = [
    ["Workspace", "workspace_info"],
    ["Instructions", "AGENTS.md"],
    ["Tools", "mcp_github"],
    ["Custom agent", "SecurityReviewer"],
  ] as const;

  for (const [name, fragment] of expectedFragments) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    expect(await page.getByLabel("Plaintext editor").inputValue()).toContain(fragment);
  }

  expect(await page.getByLabel("Plaintext editor").inputValue()).toContain(".github/copilot-instructions.md");
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(fullPrompt);
});

test("model selector changes context copy and meter width", async ({ page }) => {
  const meter = page.locator(".meter span");
  const initialWidth = await meter.evaluate((element) => getComputedStyle(element).width);
  const initialCredits = Number((await inlineMetric(page, "ai-credits").textContent())?.replace(/,/g, ""));

  await expect(page.locator(".context-label")).toContainText("Auto");
  await expect(page.getByText(/tokens remaining in a 128,000 token window\./)).toBeVisible();
  await expect(page.getByText(/Estimated prompt input: .* AI credits .* at current Copilot usage-based pricing\./)).toBeVisible();

  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption("gpt-5.4");
  await expect(page.locator(".context-label")).toContainText("GPT-5.4");
  await expect(page.getByText(/tokens remaining in a 272,000 token window\./)).toBeVisible();
  await expect(page.getByLabel("Model pricing metadata")).toContainText("$2.5/1M");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("$0.3/1M");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("250/1M");
  expect(Number((await inlineMetric(page, "ai-credits").textContent())?.replace(/,/g, ""))).toBeLessThan(initialCredits);

  const largerContextWidth = await meter.evaluate((element) => getComputedStyle(element).width);
  expect(parseFloat(largerContextWidth)).toBeLessThan(parseFloat(initialWidth));

  await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption("claude-haiku-4.5");
  await expect(page.getByLabel("GitHub Copilot model", { exact: true })).toHaveValue("claude-haiku-4.5");
  await expect(page.getByLabel("Model pricing metadata")).toContainText("100/1M");
});

test("itemized invoice totals match prompt metrics", async ({ page }) => {
  const invoice = page.getByLabel("Prompt cost invoice");
  const totalTokens = Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, ""));

  expect(await invoiceTokenValue(page, "System prompt")).toBeGreaterThan(0);
  expect(await invoiceTokenValue(page, "Custom instructions")).toBe(0);
  expect(await invoiceTokenValue(page, "Tools")).toBe(0);
  expect(await invoiceTokenValue(page, "Total")).toBe(totalTokens);

  await page.getByRole("button", { name: /Instructions context/ }).click();
  await page.getByRole("button", { name: /Tools context/ }).click();
  await expect(invoice).toContainText("Custom instructions");
  await expect(invoice).toContainText("Tools");
  expect(await invoiceTokenValue(page, "Custom instructions")).toBeGreaterThan(0);
  expect(await invoiceTokenValue(page, "Tools")).toBeGreaterThan(0);
  expect(await invoiceTokenValue(page, "Total")).toBe(
    Number((await inlineMetric(page, "tokens").textContent())?.replace(/,/g, "")),
  );
});

test("mobile viewport keeps visible features usable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "GitHub Copilot Tokenization" })).toBeVisible();
  await expect(page.getByLabel("GitHub Copilot model", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Plaintext editor")).toBeVisible();
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByLabel("Token text view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Workspace context/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Workspace context/ }).locator("svg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore sample" })).toBeVisible();
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

function chatImpactMetric(page: Page, label: string) {
  return page.getByLabel("Chat message token and credit impact").locator("div", { hasText: label }).locator("dd");
}

async function invoiceTokenValue(page: Page, label: string) {
  const text = await page.getByLabel("Prompt cost invoice").locator("tr", { hasText: label }).locator("td").first().textContent();
  return Number(text?.replace(/,/g, "") ?? 0);
}

function formatMetric(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}
