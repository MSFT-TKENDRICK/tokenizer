import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";
const outputDir = "visual-results";

const scenarios = [
  {
    name: "desktop-default",
    viewport: { width: 1440, height: 900 },
    run: async (page) => {
      await page.goto(baseURL);
      await page.getByRole("button", { name: "Mixed language" }).click();
      await page.getByLabel("Model context").selectOption({
        label: "Small context (8K) · 8,192 tokens",
      });
    },
  },
  {
    name: "desktop-edited",
    viewport: { width: 1280, height: 860 },
    run: async (page) => {
      await page.goto(baseURL);
      await page.getByLabel("Text to tokenize").fill("Hello, world! 🚀\nA second line with 42 tokens?");
    },
  },
  {
    name: "mobile-default",
    viewport: { width: 390, height: 844 },
    run: async (page) => {
      await page.goto(baseURL);
      await page.getByRole("button", { name: "Code sample" }).click();
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
    await page.getByLabel("Text to tokenize").waitFor();
    await page.locator(".token-segment").first().waitFor();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
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
