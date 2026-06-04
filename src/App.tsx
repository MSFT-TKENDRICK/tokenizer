import { useMemo, useState } from "react";
import {
  DEFAULT_MODEL_LIMITS,
  summarizeTokens,
  tokenize,
  type ModelLimit,
  type Token,
} from "./lib/tokenizer";
import "./App.css";

type ViewMode = "plain" | "tokens" | "ids";

const examples = [
  {
    name: "Copilot system prompt",
    text: "Public-safe GitHub Copilot-style system prompt for token planning (not a hidden or internal prompt):\n\nYou are GitHub Copilot, an AI pair programmer working in a repository. Help the developer make precise, working code changes. Read repository instructions before editing. Preserve user changes. Prefer existing scripts, tests, and conventions. When changing this tokenizer app, apply DESIGN.md, keep the PWA fast, validate with design lint, unit tests, typecheck, build, E2E, and visual checks, and publish only to MSFT-TKENDRICK/tokenizer when asked.",
  },
  {
    name: "Agent skills",
    text: "GitHub Copilot agent skill example:\n\nUse the xlsx skill when a spreadsheet is the primary input or output. Read the workbook, preserve formulas and formatting, add the requested summary sheet, and save a new .xlsx file. For this tokenizer repo, use the web artifact/design workflow only for standalone HTML artifacts; otherwise keep changes in React, TypeScript, and CSS. Do not expose secrets, do not overwrite unrelated work, and run the repo's validation scripts before finishing.",
  },
  {
    name: "MCP tools",
    text: "GitHub Copilot MCP tools example:\n\nConnect Copilot Chat to Model Context Protocol servers so the agent can use approved tools. A workspace might configure a GitHub MCP server for issues, pull requests, commits, and repository metadata, plus a fetch MCP server for documentation lookup. Ask: \"Use the GitHub MCP tools to find the latest Pages deployment for MSFT-TKENDRICK/tokenizer, inspect failures if any, then summarize the blocking workflow step.\"",
  },
  {
    name: "Custom agents",
    text: "GitHub Copilot custom agent example:\n\nCreate a repo-focused tokenizer-maintainer agent. Instructions: read DESIGN.md and .github/copilot-instructions.md first; keep the UI close to commandline.microsoft.com; maintain the shared Plaintext, Tokens, and Token IDs viewport; use Windows-style paths in local commands; run npm run design:lint, npm test, npm run typecheck, npm run build, npm run test:e2e, and npm run test:visual; never publish outside MSFT-TKENDRICK/tokenizer.",
  },
];

const emptyModel: ModelLimit = {
  name: "No context limit",
  contextWindow: 0,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function visibleTokenText(token: Token) {
  return token.text;
}

export default function App() {
  const [text, setText] = useState(examples[0].text);
  const [modelIndex, setModelIndex] = useState(2);
  const [viewMode, setViewMode] = useState<ViewMode>("plain");

  const selectedModel = modelIndex === -1 ? undefined : DEFAULT_MODEL_LIMITS[modelIndex];
  const tokens = useMemo(() => tokenize(text), [text]);
  const summary = useMemo(() => summarizeTokens(text, tokens, selectedModel), [text, tokens, selectedModel]);
  const displayedTokens = tokens.slice(0, 500);
  const contextPercent = summary.model?.contextPercentage ?? 0;
  const remainingContext = selectedModel
    ? Math.max(selectedModel.contextWindow - summary.tokens, 0)
    : undefined;

  return (
    <main className="app-shell" aria-labelledby="app-title">
      <section className="hero panel">
        <div>
          <p className="eyebrow">Local text insight</p>
          <h1 id="app-title">Tokenizer workspace</h1>
          <p className="hero-copy">
            Paste text to inspect an approximate token breakdown, readable usage counts, and how much of a selected context window your prompt may consume.
          </p>
        </div>
      </section>

      <section className="workspace">
        <div className="editor-card panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>Text, tokens, and token IDs</h2>
            </div>
          </div>

          <div className="view-bar">
            <div className="view-toggle" role="tablist" aria-label="Tokenizer view mode">
              <button
                aria-selected={viewMode === "plain"}
                className={viewMode === "plain" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setViewMode("plain")}
              >
                Plaintext
              </button>
              <button
                aria-selected={viewMode === "tokens"}
                className={viewMode === "tokens" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setViewMode("tokens")}
              >
                Tokens
              </button>
              <button
                aria-selected={viewMode === "ids"}
                className={viewMode === "ids" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setViewMode("ids")}
              >
                Token IDs
              </button>
            </div>
            <dl className="inline-metrics" aria-label="Prompt metrics">
              <div data-metric="tokens">
                <dd aria-label="Current token count">{formatNumber(summary.tokens)}</dd>
                <dt>tokens</dt>
              </div>
              <div data-metric="characters">
                <dd>{formatNumber(summary.characters)}</dd>
                <dt>characters</dt>
              </div>
              <div data-metric="words">
                <dd>{formatNumber(summary.words)}</dd>
                <dt>words</dt>
              </div>
              <div data-metric="bytes">
                <dd>{formatNumber(summary.bytes)}</dd>
                <dt>bytes</dt>
              </div>
            </dl>
          </div>

          <div className="text-surface">
            {viewMode === "plain" ? (
              <textarea
                className="text-viewport text-input"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste or type text here..."
                aria-label="Plaintext editor"
                spellCheck="true"
              />
            ) : tokens.length === 0 ? (
              <div
                className="text-viewport readonly-view empty-view"
                aria-label={viewMode === "tokens" ? "Token text view" : "Token ID view"}
              >
                Add text in Plaintext view to inspect token boundaries.
              </div>
            ) : (
              <div
                className="text-viewport readonly-view token-stream"
                aria-label={viewMode === "tokens" ? "Token text view" : "Token ID view"}
                tabIndex={0}
              >
                {displayedTokens.map((token) => (
                  <span
                    className={`token-segment token-${token.index % 6} token-kind-${token.category}`}
                    key={`${token.index}-${token.start}`}
                    title={`Token ${token.index + 1} · ${token.category} · ${token.bytes} bytes · ID ${token.id}`}
                  >
                    {viewMode === "tokens" ? visibleTokenText(token) : token.id}
                  </span>
                ))}
                {tokens.length > displayedTokens.length && (
                  <span className="token-segment token-more">
                    +{formatNumber(tokens.length - displayedTokens.length)} more
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="editor-actions">
            <button className="ghost-button" type="button" onClick={() => setText("")}>Clear</button>
            <button className="primary-button" type="button" onClick={() => setText(examples[0].text)}>
              Reset example
            </button>
          </div>

          <div className="controls-row">
            <label>
              Model context
              <select
                value={modelIndex}
                onChange={(event) => setModelIndex(Number(event.target.value))}
              >
                <option value={-1}>{emptyModel.name}</option>
                {DEFAULT_MODEL_LIMITS.map((model, index) => (
                  <option key={model.name} value={index}>
                    {model.name} · {formatNumber(model.contextWindow)} tokens
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="example-grid" aria-label="Load example text">
            {examples.map((example) => (
              <button key={example.name} type="button" onClick={() => setText(example.text)}>
                {example.name}
              </button>
            ))}
          </div>
        </div>

        <aside className="stats-card panel" aria-label="Tokenizer statistics">
          <div className="context-box">
            <div className="context-label">
              <span>{selectedModel?.name ?? emptyModel.name}</span>
              <strong>{selectedModel ? `${formatNumber(contextPercent)}%` : "—"}</strong>
            </div>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${contextPercent}%` }} />
            </div>
            <p>
              {selectedModel
                ? `${formatNumber(remainingContext ?? 0)} tokens remaining in a ${formatNumber(selectedModel.contextWindow)} token window.`
                : "Choose a context size to estimate prompt window usage."}
            </p>
          </div>

          <p className="help-text">
            Counts are deterministic in this app and intended for planning. Production model tokenizers may differ by provider and model version.
          </p>
        </aside>
      </section>
    </main>
  );
}
