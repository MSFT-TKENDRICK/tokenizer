import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lint } from "@google/design.md/linter";

const designPath = "DESIGN.md";
const outputPath = join("design-fixtures", "generated", "command-line-editorial.html");

const designSource = await readFile(designPath, "utf8");
const report = lint(designSource);

if (report.summary.errors > 0) {
  console.error(JSON.stringify({ findings: report.findings, summary: report.summary }, null, 2));
  throw new Error("DESIGN.md lint errors remain; fixture generation stopped.");
}

const { designSystem } = report;
const rawTokens = parseFrontmatterTokens(designSource);

function parseFrontmatterTokens(source) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
  const typography = new Map();
  const componentTypographyRefs = new Map();
  let section = "";
  let currentTypography = "";
  let currentComponent = "";

  for (const line of frontmatter.split(/\r?\n/u)) {
    const topLevel = line.match(/^([A-Za-z][\w-]*):\s*$/u);
    if (topLevel) {
      section = topLevel[1];
      currentTypography = "";
      currentComponent = "";
      continue;
    }

    if (section === "typography") {
      const typographyName = line.match(/^  ([A-Za-z][\w-]*):\s*$/u);
      if (typographyName) {
        currentTypography = typographyName[1];
        typography.set(currentTypography, {});
        continue;
      }

      const property = line.match(/^    ([A-Za-z][\w-]*):\s*(.+)$/u);
      if (currentTypography && property) {
        typography.get(currentTypography)[property[1]] = property[2].replace(/^"|"$/gu, "");
      }
    }

    if (section === "components") {
      const componentName = line.match(/^  ([A-Za-z][\w-]*):\s*$/u);
      if (componentName) {
        currentComponent = componentName[1];
        continue;
      }

      const typographyRef = line.match(/^    typography:\s*"?\{typography\.([^}]+)\}"?\s*$/u);
      if (currentComponent && typographyRef) {
        componentTypographyRefs.set(currentComponent, typographyRef[1]);
      }
    }
  }

  return { typography, componentTypographyRefs };
}

function color(name) {
  return designSystem.colors.get(name)?.hex ?? "#000000";
}

function dim(name, collection) {
  const value = designSystem[collection].get(name);
  return value ? `${value.value}${value.unit}` : "0";
}

function cssValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value.type === "color") {
    return value.hex;
  }

  if (value.type === "dimension") {
    return `${value.value}${value.unit}`;
  }

  if (typeof value === "string") {
    return value;
  }

  return "";
}

function component(name, property) {
  return cssValue(designSystem.components.get(name)?.properties.get(property));
}

function typography(name) {
  const token = designSystem.typography.get(name);
  const rawToken = rawTokens.typography.get(name);
  if (!token) {
    return "";
  }

  return [
    token.fontFamily ? `font-family: ${token.fontFamily};` : "",
    token.fontSize ? `font-size: ${cssValue(token.fontSize)};` : "",
    token.lineHeight || rawToken?.lineHeight
      ? `line-height: ${cssValue(token.lineHeight ?? rawToken.lineHeight)};`
      : "",
    token.fontWeight ? `font-weight: ${token.fontWeight};` : "",
    token.letterSpacing ? `letter-spacing: ${cssValue(token.letterSpacing)};` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
}

function componentTypography(name) {
  const value = designSystem.components.get(name)?.properties.get("typography");
  const rawTokenName = rawTokens.componentTypographyRefs.get(name);
  const rawToken = rawTokenName ? rawTokens.typography.get(rawTokenName) : undefined;
  if (!value || value.type !== "typography") {
    return "";
  }

  return [
    value.fontFamily ? `font-family: ${value.fontFamily};` : "",
    value.fontSize ? `font-size: ${cssValue(value.fontSize)};` : "",
    value.lineHeight || rawToken?.lineHeight
      ? `line-height: ${cssValue(value.lineHeight ?? rawToken.lineHeight)};`
      : "",
    value.fontWeight ? `font-weight: ${value.fontWeight};` : "",
    value.letterSpacing ? `letter-spacing: ${cssValue(value.letterSpacing)};` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const lintSummary = `${report.summary.errors} errors / ${report.summary.warnings} warnings / ${report.summary.infos} infos`;
const overview =
  report.documentSections
    .find((section) => section.heading === "Overview")
    ?.content.trim()
    .replace(/^##\s+Overview\s*/u, "") ??
  "Generated validation fixture for DESIGN.md.";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(designSystem.name ?? "Design fixture")}</title>
  <style>
    :root {
      --color-primary: ${color("primary")};
      --color-background: ${color("background")};
      --color-muted: ${color("muted")};
      --color-accent: ${color("accent")};
      --color-border: ${color("border")};
      --color-border-subtle: ${color("borderSubtle")};
      --color-hover-highlight: ${color("hoverHighlight")};
      --color-code-block: ${color("codeBlock")};
      --color-dark-primary: ${color("darkPrimary")};
      --spacing-compact: ${dim("compact", "spacing")};
      --spacing-paragraph: ${dim("paragraph", "spacing")};
      --spacing-section: ${dim("section", "spacing")};
      --rounded-inline-code: ${dim("inlineCode", "rounded")};
      --rounded-block: ${dim("block", "rounded")};
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: ${component("page", "backgroundColor")};
      color: ${component("page", "textColor")};
      ${componentTypography("page")}
      padding: 0;
    }

    .article {
      max-width: ${component("article", "width")};
      margin: 0 auto;
      background: ${component("article", "backgroundColor")};
      color: ${component("article", "textColor")};
      ${componentTypography("article")}
      padding: 0 0 var(--spacing-section);
    }

    .site-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 24px 30px 48px;
      color: var(--color-primary);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--color-primary);
      ${typography("brand")}
    }

    .brand-mark {
      width: 20px;
      height: 16px;
      display: inline-block;
      position: relative;
      border-bottom: 3px solid var(--color-primary);
    }

    .brand-mark::before,
    .brand-mark::after {
      content: "";
      position: absolute;
      left: 0;
      width: 10px;
      height: 3px;
      background: var(--color-primary);
      transform-origin: left center;
    }

    .brand-mark::before {
      top: 2px;
      transform: rotate(42deg);
    }

    .brand-mark::after {
      top: 10px;
      transform: rotate(-42deg);
    }

    .site-kicker,
    .site-tools {
      ${componentTypography("shellFrame")}
    }

    .site-kicker {
      margin: 0;
      text-align: center;
      color: var(--color-primary);
    }

    .site-tools {
      display: flex;
      justify-content: flex-end;
      gap: 14px;
    }

    .hero-visual {
      width: ${component("article", "width")};
      max-width: calc(100vw - 32px);
      height: 370px;
      margin: 0 auto 38px;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--color-hover-highlight);
    }

    .hero-visual svg {
      width: 310px;
      max-width: 72%;
      height: auto;
      fill: none;
      stroke: var(--color-primary);
      stroke-width: 1.2;
    }

    .hero-title {
      max-width: ${component("prose", "width")};
      margin: 16px 0 14px;
      color: ${component("heroTitle", "textColor")};
      ${componentTypography("heroTitle")}
    }

    .headline-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }

    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 0 0 24px;
      color: ${component("metadata", "textColor")};
      ${componentTypography("metadata")}
    }

    .tag {
      display: inline-block;
      background: var(--color-primary);
      color: var(--color-dark-primary);
      ${componentTypography("tag")}
      padding: 6px 8px;
      border: 0;
      border-radius: ${component("tag", "rounded")};
      text-transform: uppercase;
    }

    .prose {
      max-width: ${component("prose", "width")};
      color: ${component("prose", "textColor")};
      ${componentTypography("prose")}
    }

    .article-summary {
      color: var(--color-muted);
      ${componentTypography("metadata")}
      font-size: 13px;
      line-height: 23px;
      margin-bottom: 22px;
    }

    .prose p,
    .prose ul,
    .prose ol,
    .prose table,
    .prose pre,
    .prose figure,
    .prose blockquote {
      margin: 0 0 var(--spacing-paragraph);
    }

    .prose a {
      background: ${component("link", "backgroundColor")};
      color: ${component("link", "textColor")};
      ${componentTypography("link")}
      text-decoration-thickness: 1px;
      text-underline-offset: 3px;
    }

    .prose a:hover {
      background: ${component("linkHover", "backgroundColor")};
      color: ${component("linkHover", "textColor")};
    }

    code {
      background: ${component("inlineCode", "backgroundColor")};
      color: ${component("inlineCode", "textColor")};
      ${componentTypography("inlineCode")}
      padding: 2px var(--spacing-compact);
      border-radius: ${component("inlineCode", "rounded")};
    }

    pre {
      overflow-x: auto;
      background: ${component("codeBlock", "backgroundColor")};
      color: ${component("codeBlock", "textColor")};
      ${componentTypography("codeBlock")}
      padding: ${component("codeBlock", "padding")};
      border-radius: ${component("codeBlock", "rounded")};
    }

    pre code {
      padding: 0;
      background: transparent;
      color: inherit;
      border-radius: 0;
    }

    .callout {
      padding: 18px 22px;
      border-left: ${component("focus", "height")} solid ${component("focus", "backgroundColor")};
      background: var(--color-border-subtle);
      color: var(--color-primary);
    }

    .callout strong {
      display: block;
      margin-bottom: 6px;
      ${typography("h3")}
    }

    .media-card {
      width: ${component("media", "width")};
      min-height: 150px;
      display: grid;
      place-items: center;
      padding: 24px;
      background: ${component("media", "backgroundColor")};
      color: ${component("media", "textColor")};
      ${componentTypography("media")}
      border-radius: ${component("media", "rounded")};
      border: 1px solid var(--color-border);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      ${typography("metadata")}
    }

    th,
    td {
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      text-align: left;
      vertical-align: top;
    }

    th {
      background: var(--color-border-subtle);
    }

    .divider {
      height: ${component("divider", "height")};
      margin: var(--spacing-section) 0 24px;
      background: ${component("divider", "backgroundColor")};
    }

    @media (max-width: 700px) {
      .site-header {
        grid-template-columns: 1fr auto;
        padding: 22px 16px 34px;
      }

      .site-kicker {
        display: none;
      }

      .brand {
        font-size: 16px;
      }

      .hero-visual {
        width: calc(100vw - 32px);
        height: 238px;
        margin-bottom: 36px;
      }

      .article {
        max-width: none;
        padding: 0 16px var(--spacing-section);
      }

      .hero-title {
        font-size: 28px;
        line-height: 1.2;
        letter-spacing: -0.5px;
      }

      .headline-row {
        margin-bottom: 18px;
      }
    }
  </style>
</head>
<body>
  <header class="site-header" aria-label="Command Line editorial header">
    <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>Command Line</span></div>
    <p class="site-kicker">By builders, for builders.</p>
    <div class="site-tools" aria-label="Page tools"><span>⌕</span><span>☼</span><span>▦</span></div>
  </header>

  <div class="hero-visual" aria-label="Abstract editorial hero visual">
    <svg viewBox="0 0 320 320" role="img" aria-label="Abstract line drawing">
      <path d="M165 36c54 12 88 61 78 110s-61 81-112 86-85-20-73-62 67-42 90-76 7-66 17-58z" />
      <path d="M186 46c47 23 68 78 46 123s-78 61-127 53-76-40-54-77 75-25 106-53 17-65 29-46z" />
      <path d="M206 64c37 33 42 91 11 129s-89 43-133 24-62-55-31-85 78-8 116-27 25-59 37-41z" />
      <path d="M222 88c23 40 10 95-29 122s-96 17-132-12-43-67-5-88 77 10 119 1 34-42 47-23z" />
      <path d="M229 116c8 44-22 91-67 105s-95-11-119-48-18-74 23-84 69 26 110 29 39-23 53-2z" />
      <path d="M224 146c-7 43-51 78-98 77s-86-40-97-81 8-73 49-70 56 42 94 58 38-5 52 16z" />
    </svg>
  </div>

  <article class="article" aria-labelledby="fixture-title">
    <header>
      <div class="headline-row">
        <span class="tag">Validation fixture</span>
        <span class="tag">Share</span>
      </div>
      <h1 class="hero-title" id="fixture-title">Turn design tokens into visual parity fixtures</h1>
      <p class="article-summary">A generated design fixture for comparing the Command Line editorial system against the source site's restrained article layout, typography rhythm, colors, and spacing.</p>
      <p class="metadata"><span>By DESIGN.md validation</span><span>Lint: ${escapeHtml(lintSummary)}</span></p>
    </header>

    <section class="prose" aria-label="Representative article content">
      <p>${escapeHtml(overview)}</p>
      <p>
        This throw-away page renders article prose, <a href="#token-table">link treatment</a>,
        inline <code>code</code>, lists, a code block, a callout, and structured media from
        the resolved design.md tokens.
      </p>

      <ul>
        <li>Centered article shell with a 740px maximum width.</li>
        <li>Comfortable prose rhythm held in a direct single-column measure.</li>
        <li>Monospace metadata, captions, tags, and command-adjacent chrome.</li>
      </ul>

      <pre><code>${escapeHtml(`const source = "DESIGN.md";
const lintErrors = 0;
renderFixture({ source, lintErrors });`)}</code></pre>

      <blockquote class="callout">
        <strong>Feedback loop applied</strong>
        The fixture is generated only after the design.md linter resolves tokens and reports zero errors.
      </blockquote>

      <figure>
        <div class="media-card">Flat media/card surface using the media component tokens.</div>
        <figcaption class="metadata">Caption treatment: bounded, editorial, and intentionally non-production.</figcaption>
      </figure>

      <table id="token-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Token evidence</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hero title</td>
            <td>Uses <code>components.heroTitle</code> typography and color.</td>
          </tr>
          <tr>
            <td>Code block</td>
            <td>Uses <code>components.codeBlock</code> background, text, radius, and padding.</td>
          </tr>
          <tr>
            <td>Link hover</td>
            <td>Uses <code>components.link</code> and <code>components.linkHover</code>.</td>
          </tr>
        </tbody>
      </table>
    </section>
  </article>
</body>
</html>
`;

await mkdir(join("design-fixtures", "generated"), { recursive: true });
await writeFile(outputPath, html, "utf8");

console.log(`Generated ${outputPath}`);
console.log(`DESIGN.md lint summary: ${lintSummary}`);
