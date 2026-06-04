import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseURL = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:4173";
const outputDir = process.env.VISUAL_OUTPUT_DIR ?? "visual-results";

const scenarios = [
  {
    name: "desktop-tokens",
    viewport: { width: 1440, height: 900 },
    run: async (page) => {
      await page.goto(baseURL);
      await page.getByRole("button", { name: /Workspace/ }).click();
      await page.getByRole("button", { name: /AGENTS.md/ }).click();
      await page.getByRole("button", { name: /Tools/ }).click();
      await page.getByRole("button", { name: /Custom agent/ }).click();
      await page.getByLabel("GitHub Copilot model", { exact: true }).selectOption({ label: "GPT-5.4 · 272,000 tokens" });
      await page.getByRole("tab", { name: "Tokens" }).click();
    },
  },
  {
    name: "desktop-token-ids",
    viewport: { width: 1280, height: 860 },
    run: async (page) => {
      await page.goto(baseURL);
      await page.getByLabel("Plaintext editor").fill("Hello, world! 🚀\nA second line with 42 tokens?");
      await page.getByRole("tab", { name: "Token IDs" }).click();
    },
  },
  {
    name: "mobile-tokens",
    viewport: { width: 390, height: 844 },
    run: async (page) => {
      await page.goto(baseURL);
      await page.getByRole("button", { name: /Tools/ }).click();
      await page.getByRole("tab", { name: "Tokens" }).click();
    },
  },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];

for (const scenario of scenarios) {
  const page = await browser.newPage({ viewport: scenario.viewport });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await scenario.run(page);
    await page.getByRole("heading", { name: "Tokenizer workspace" }).waitFor();
    await page.getByLabel(/Token (text|ID) view/).waitFor();
    await page.locator(".token-segment").first().waitFor();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    const viewportMetrics = await page.evaluate(() => {
      const surface = document.querySelector(".text-surface")?.getBoundingClientRect();
      const view = document.querySelector(".text-viewport")?.getBoundingClientRect();
      const style = document.querySelector(".text-viewport")
        ? getComputedStyle(document.querySelector(".text-viewport"))
        : undefined;
      return {
        surfaceWidth: surface?.width ?? 0,
        viewWidth: view?.width ?? 0,
        fontFamily: style?.fontFamily ?? "",
        fontSize: style?.fontSize ?? "",
      };
    });
    if (viewportMetrics.surfaceWidth === 0 || viewportMetrics.viewWidth === 0) {
      failures.push(`${scenario.name}: shared viewport did not render`);
    }
    if (!viewportMetrics.fontFamily.includes("Consolas")) {
      failures.push(`${scenario.name}: expected monospace viewport font`);
    }
    if (hasHorizontalOverflow) {
      failures.push(`${scenario.name}: horizontal overflow detected`);
    }
    if (errors.length > 0) {
      failures.push(`${scenario.name}: browser errors: ${errors.join(" | ")}`);
    }
    await page.screenshot({
      path: `${outputDir}/${scenario.name}.png`,
      fullPage: true,
    });
  } finally {
    await page.close();
  }
}

await browser.close();

if (failures.length > 0) {
  throw new Error(failures.join("\n"));
}

console.log(`Captured ${scenarios.length} visual validation screenshots in ${outputDir}`);
