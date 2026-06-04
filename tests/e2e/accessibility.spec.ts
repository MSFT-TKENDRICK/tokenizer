import { expect, test, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const THEMES = ["light", "dark"] as const;

for (const theme of THEMES) {
  test(`has no automated accessibility violations in ${theme} theme`, async ({ page }) => {
    await page.goto(`/?scoutTheme=${theme}`);
    await expect(page.getByRole("heading", { name: "GitHub Copilot Tokenization" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test(`keeps context icons visible in ${theme} theme`, async ({ page }) => {
    await page.goto(`/?scoutTheme=${theme}`);
    const buttons = page.locator(".patch-layer-button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      await expect(button.locator("svg")).toBeVisible();
      expect(await iconContrastRatio(button)).toBeGreaterThanOrEqual(3);

      await button.click();
      expect(await iconContrastRatio(button)).toBeGreaterThanOrEqual(3);
    }
  });
}

async function iconContrastRatio(button: Locator) {
  const { background, foreground } = await button.evaluate((element) => {
    const svg = element.querySelector("svg");
    const path = svg?.querySelector("path") ?? svg;
    if (!path) {
      throw new Error("Patch icon SVG path was not found");
    }

    return {
      foreground: getComputedStyle(path).fill,
      background: getComputedStyle(element).backgroundColor,
    };
  });

  return contrastRatio(parseRgb(foreground), parseRgb(background));
}

function parseRgb(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse color: ${value}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function contrastRatio(
  [redA, greenA, blueA]: readonly [number, number, number],
  [redB, greenB, blueB]: readonly [number, number, number],
) {
  const lightA = luminance(redA, greenA, blueA);
  const lightB = luminance(redB, greenB, blueB);
  const lighter = Math.max(lightA, lightB);
  const darker = Math.min(lightA, lightB);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(red: number, green: number, blue: number) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
