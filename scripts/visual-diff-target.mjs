import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const targetUrl = "https://commandline.microsoft.com/assert-written-intent-executable-evals/";
const fixtureUrl = pathToFileURL(resolve("design-fixtures", "generated", "command-line-editorial.html")).href;
const outputDir = "visual-diff";
const scenarios = [
  { name: "desktop", viewport: { width: 1366, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const report = {
  generatedAt: new Date().toISOString(),
  targetUrl,
  fixtureUrl,
  scenarios: [],
};

try {
  for (const scenario of scenarios) {
    const target = await capturePage({
      browser,
      url: targetUrl,
      screenshotPath: join(outputDir, `target-${scenario.name}.png`),
      scenario,
    });
    const fixture = await capturePage({
      browser,
      url: fixtureUrl,
      screenshotPath: join(outputDir, `fixture-${scenario.name}.png`),
      scenario,
    });
    const diff = await diffScreenshots({
      browser,
      expectedPath: target.screenshotPath,
      actualPath: fixture.screenshotPath,
      diffPath: join(outputDir, `diff-${scenario.name}.png`),
      viewport: scenario.viewport,
    });
    const findings = compareMetrics(target.metrics, fixture.metrics);
    report.scenarios.push({
      name: scenario.name,
      viewport: scenario.viewport,
      screenshots: {
        target: target.screenshotPath,
        fixture: fixture.screenshotPath,
        diff: diff.diffPath,
      },
      pixelDiff: diff,
      metrics: {
        target: target.metrics,
        fixture: fixture.metrics,
      },
      findings,
    });
  }
} finally {
  await browser.close();
}

await writeFile(join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Visual diff artifacts written to ${outputDir}`);
for (const scenario of report.scenarios) {
  console.log(
    `${scenario.name}: ${(scenario.pixelDiff.diffRatio * 100).toFixed(2)}% pixels differ; ${scenario.findings.length} metric findings`,
  );
}

async function capturePage({ browser, url, screenshotPath, scenario }) {
  const page = await browser.newPage({
    viewport: scenario.viewport,
    deviceScaleFactor: 1,
    isMobile: scenario.isMobile ?? false,
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
    await page.waitForTimeout(1500);
    const screenshot = await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      animations: "disabled",
    });
    const metrics = await page.evaluate(collectMetrics);
    metrics.page.screenshotBackgroundColor = await sampleScreenshotColor(page, screenshot, 8, 8);
    return { screenshotPath, metrics: { ...metrics, browserErrors: errors } };
  } finally {
    await page.close();
  }

  function backgroundAt(x, y) {
    let element = document.elementFromPoint(x, y);
    while (element) {
      const backgroundColor = getComputedStyle(element).backgroundColor;
      if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)") {
        return backgroundColor;
      }
      element = element.parentElement;
    }
    return "rgb(255, 255, 255)";
  }
}

async function sampleScreenshotColor(page, screenshot, x, y) {
  return page.evaluate(
    async ({ dataUrl, sampleX, sampleY }) => {
      const image = await new Promise((resolveImage, rejectImage) => {
        const pendingImage = new Image();
        pendingImage.onload = () => resolveImage(pendingImage);
        pendingImage.onerror = rejectImage;
        pendingImage.src = dataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const [red, green, blue, alpha] = context.getImageData(sampleX, sampleY, 1, 1).data;
      return alpha === 255
        ? `rgb(${red}, ${green}, ${blue})`
        : `rgba(${red}, ${green}, ${blue}, ${Number((alpha / 255).toFixed(3))})`;
    },
    {
      dataUrl: `data:image/png;base64,${screenshot.toString("base64")}`,
      sampleX: x,
      sampleY: y,
    },
  );
}

async function diffScreenshots({ browser, expectedPath, actualPath, diffPath, viewport }) {
  const [expected, actual] = await Promise.all([readFile(expectedPath), readFile(actualPath)]);
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  try {
    const result = await page.evaluate(
      async ({ expectedDataUrl, actualDataUrl, width, height }) => {
        const [expectedImage, actualImage] = await Promise.all([
          loadImage(expectedDataUrl),
          loadImage(actualDataUrl),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(expectedImage, 0, 0);
        const expectedPixels = context.getImageData(0, 0, width, height);
        context.clearRect(0, 0, width, height);
        context.drawImage(actualImage, 0, 0);
        const actualPixels = context.getImageData(0, 0, width, height);
        const diffPixels = context.createImageData(width, height);
        let changed = 0;
        let totalDelta = 0;
        const threshold = 24;

        for (let index = 0; index < expectedPixels.data.length; index += 4) {
          const red = Math.abs(expectedPixels.data[index] - actualPixels.data[index]);
          const green = Math.abs(expectedPixels.data[index + 1] - actualPixels.data[index + 1]);
          const blue = Math.abs(expectedPixels.data[index + 2] - actualPixels.data[index + 2]);
          const alpha = Math.abs(expectedPixels.data[index + 3] - actualPixels.data[index + 3]);
          const delta = red + green + blue + alpha;
          totalDelta += delta;

          if (delta > threshold) {
            changed += 1;
            diffPixels.data[index] = 255;
            diffPixels.data[index + 1] = 0;
            diffPixels.data[index + 2] = 180;
            diffPixels.data[index + 3] = 255;
          } else {
            const gray = Math.round(
              expectedPixels.data[index] * 0.3 +
                expectedPixels.data[index + 1] * 0.59 +
                expectedPixels.data[index + 2] * 0.11,
            );
            diffPixels.data[index] = gray;
            diffPixels.data[index + 1] = gray;
            diffPixels.data[index + 2] = gray;
            diffPixels.data[index + 3] = 80;
          }
        }

        context.putImageData(diffPixels, 0, 0);
        return {
          diffDataUrl: canvas.toDataURL("image/png"),
          changedPixels: changed,
          totalPixels: width * height,
          diffRatio: changed / (width * height),
          averageChannelDelta: totalDelta / (width * height * 4),
        };

        function loadImage(src) {
          return new Promise((resolveImage, rejectImage) => {
            const image = new Image();
            image.onload = () => resolveImage(image);
            image.onerror = rejectImage;
            image.src = src;
          });
        }
      },
      {
        expectedDataUrl: `data:image/png;base64,${expected.toString("base64")}`,
        actualDataUrl: `data:image/png;base64,${actual.toString("base64")}`,
        width: viewport.width,
        height: viewport.height,
      },
    );
    const base64 = result.diffDataUrl.replace(/^data:image\/png;base64,/u, "");
    await writeFile(diffPath, Buffer.from(base64, "base64"));
    return {
      diffPath,
      changedPixels: result.changedPixels,
      totalPixels: result.totalPixels,
      diffRatio: Number(result.diffRatio.toFixed(6)),
      averageChannelDelta: Number(result.averageChannelDelta.toFixed(3)),
    };
  } finally {
    await page.close();
  }
}

function collectMetrics() {
  const bodyStyle = getComputedStyle(document.body);
  const root = document.documentElement;
  const h1 = document.querySelector("h1");
  const paragraph = document.querySelector("main p, article p, p");
  const prose = document.querySelector(".prose, article, main, [role='main']");
  const code = document.querySelector("code");
  const pre = document.querySelector("pre");
  const pullQuote = document.querySelector("blockquote");
  const tag = document.querySelector(".tag, [class*='tag' i], [class*='eyebrow' i]");
  const article = document.querySelector("article, main, [role='main']") ?? document.body;

  return {
    url: location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    page: {
      backgroundColor: bodyStyle.backgroundColor,
      visibleBackgroundColor: backgroundAt(8, 8),
      color: bodyStyle.color,
      fontFamily: bodyStyle.fontFamily,
      fontSize: bodyStyle.fontSize,
      lineHeight: bodyStyle.lineHeight,
    },
    layout: {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      hasHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      article: rectMetrics(article),
      prose: rectMetrics(prose),
    },
    h1: styleMetrics(h1),
    paragraph: styleMetrics(paragraph),
    tag: styleMetrics(tag),
    inlineCode: styleMetrics(code),
    codeBlock: styleMetrics(pre),
    pullQuote: styleMetrics(pullQuote),
  };

  function styleMetrics(element) {
    if (!element) {
      return null;
    }
    const style = getComputedStyle(element);
    return {
      text: element.textContent.trim().slice(0, 120),
      rect: rectMetrics(element),
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      padding: style.padding,
      border: style.border,
      borderLeft: style.borderLeft,
      borderRadius: style.borderRadius,
    };
  }

  function rectMetrics(element) {
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function backgroundAt(x, y) {
    let element = document.elementFromPoint(x, y);
    while (element) {
      const backgroundColor = getComputedStyle(element).backgroundColor;
      if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)") {
        return backgroundColor;
      }
      element = element.parentElement;
    }
    return "rgb(255, 255, 255)";
  }
}

function compareMetrics(target, fixture) {
  const findings = [];
  const fixtureWidth = fixture.layout.article?.width ?? fixture.layout.prose?.width ?? 0;
  const targetWidth = target.layout.article?.width ?? target.layout.prose?.width ?? 0;
  const targetContentWidth = target.h1?.rect?.width ?? target.layout.prose?.width ?? targetWidth;
  const fixtureContentWidth = fixture.h1?.rect?.width ?? fixture.layout.prose?.width ?? fixtureWidth;
  compareNumber("content width", targetContentWidth, fixtureContentWidth, 180, "px");
  compareCss(
    "page background",
    target.page.screenshotBackgroundColor,
    fixture.page.screenshotBackgroundColor,
  );
  compareCss("page text color", target.page.color, fixture.page.color);
  compareNumber("h1 font size", px(target.h1?.fontSize), px(fixture.h1?.fontSize), 10, "px");
  compareNumber(
    "body font size",
    px(target.paragraph?.fontSize ?? target.page.fontSize),
    px(fixture.paragraph?.fontSize ?? fixture.page.fontSize),
    4,
    "px",
  );
  compareNumber(
    "body line height",
    px(target.paragraph?.lineHeight ?? target.page.lineHeight),
    px(fixture.paragraph?.lineHeight ?? fixture.page.lineHeight),
    12,
    "px",
  );

  if (target.layout.hasHorizontalOverflow) {
    findings.push("target has horizontal overflow");
  }
  if (fixture.layout.hasHorizontalOverflow) {
    findings.push("fixture has horizontal overflow");
  }
  if (!fixture.inlineCode) {
    findings.push("fixture is missing inline code treatment");
  }
  if (!fixture.codeBlock) {
    findings.push("fixture is missing code block treatment");
  }
  if (!fixture.pullQuote) {
    findings.push("fixture is missing pull quote/callout treatment");
  }
  return findings;

  function compareCss(label, expected, actual) {
    if (expected !== actual) {
      findings.push(`${label}: target ${expected}, fixture ${actual}`);
    }
  }

  function compareNumber(label, expected, actual, tolerance, unit) {
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
      findings.push(`${label}: unavailable`);
      return;
    }
    const delta = Math.abs(expected - actual);
    if (delta > tolerance) {
      findings.push(
        `${label}: target ${expected}${unit}, fixture ${actual}${unit}, delta ${delta.toFixed(1)}${unit}`,
      );
    }
  }

  function px(value) {
    const match = String(value ?? "").match(/^-?\d+(?:\.\d+)?/u);
    return match ? Number(match[0]) : Number.NaN;
  }
}
