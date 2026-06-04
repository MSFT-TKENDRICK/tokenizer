import { expect, type Page, test } from "@playwright/test";

const productNote =
  "Many words map to one token, but some don't: indivisible.\n\nUnicode characters like emojis may be split into many tokens containing the underlying bytes: 🚀🚀🚀🚀\n\nSequences of characters commonly found next to each other may be grouped together: 1234567890";
const codeSample = "function greet(name: string) {\n  return `Hello, ${name}!`;\n}";
const mixedLanguage =
  "Tokenization handles words, numbers like 128000, emoji 🚀, punctuation, and line breaks.";

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
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(productNote);
  await expect(page.getByLabel("Current token summary")).toContainText(/\d+/);
  await expect(page.getByText(/\d+ shown/)).toBeVisible();
});

test("toggles one shared viewport between plaintext, tokens, and token IDs", async ({ page }) => {
  const plaintextBox = page.getByLabel("Plaintext editor");
  const plaintextBounds = await plaintextBox.boundingBox();
  expect(plaintextBounds).not.toBeNull();

  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByRole("tab", { name: "Tokens" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Plaintext editor")).toBeHidden();
  const stream = page.getByLabel("Token text view");
  await expect(stream).toContainText("Many words map to one token");
  await expect(stream).toContainText("Unicode characters like emojis");
  await expect(stream).toContainText("1234567890");

  const firstToken = page.locator(".token-segment").first();
  await expect(firstToken).toHaveText("Many");
  await expect(firstToken).toHaveAttribute("title", /Token 1 · word · 4 bytes · ID \d+/);
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
  await expect(metric(page, "Tokens")).toHaveText("7");
  await expect(metric(page, "Characters")).toHaveText("15");
  await expect(metric(page, "Words")).toHaveText("2");
  await expect(metric(page, "Bytes")).toHaveText("18");
  await expect(page.getByLabel("Current token summary")).toContainText("7");
  await expect(page.getByText("7 shown")).toBeVisible();

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
  await expect(metric(page, "Tokens")).toHaveText("0");
  await expect(metric(page, "Characters")).toHaveText("0");
  await expect(metric(page, "Words")).toHaveText("0");
  await expect(metric(page, "Bytes")).toHaveText("0");
  await expect(page.getByText("0 shown")).toBeVisible();

  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.getByText("Add text in Plaintext view to inspect token boundaries.")).toBeVisible();

  await page.getByRole("button", { name: "Reset example" }).click();
  await page.getByRole("tab", { name: "Plaintext" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(productNote);
});

test("example buttons load distinct examples", async ({ page }) => {
  await page.getByRole("button", { name: "Code sample" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(codeSample);
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.locator(".token-segment", { hasText: "function" })).toBeVisible();
  await expect(page.locator(".token-segment", { hasText: "return" })).toBeVisible();

  await page.getByRole("tab", { name: "Plaintext" }).click();
  await page.getByRole("button", { name: "Mixed language" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(mixedLanguage);
  await page.getByRole("tab", { name: "Tokens" }).click();
  await expect(page.locator(".token-segment", { hasText: "128000" })).toBeVisible();
  await expect(page.locator(".token-segment", { hasText: "🚀" })).toBeVisible();

  await page.getByRole("tab", { name: "Plaintext" }).click();
  await page.getByRole("button", { name: "Tokenizer sample" }).click();
  await expect(page.getByLabel("Plaintext editor")).toHaveValue(productNote);
});

test("model selector changes context copy and meter width", async ({ page }) => {
  const longPrompt = `${"token ".repeat(1_000)}done`;
  await page.getByLabel("Plaintext editor").fill(longPrompt);
  await expect(metric(page, "Tokens")).toHaveText("2,001");

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

function metric(page: Page, label: string) {
  return page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd");
}
