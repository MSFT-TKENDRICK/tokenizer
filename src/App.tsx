import { useMemo, useState } from "react";
import {
  DEFAULT_MODEL_LIMITS,
  summarizeTokens,
  tokenize,
  type ModelLimit,
  type Token,
} from "./lib/tokenizer";
import { composePrompt, createPatchDiff, promptPatchLayers } from "./lib/examples";
import "./App.css";

type ViewMode = "plain" | "tokens" | "ids";

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
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [text, setText] = useState(composePrompt([]));
  const [modelIndex, setModelIndex] = useState(2);
  const [viewMode, setViewMode] = useState<ViewMode>("plain");

  const selectedLayerSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds]);
  const selectedModel = modelIndex === -1 ? undefined : DEFAULT_MODEL_LIMITS[modelIndex];
  const tokens = useMemo(() => tokenize(text), [text]);
  const summary = useMemo(() => summarizeTokens(text, tokens, selectedModel), [text, tokens, selectedModel]);
  const displayedTokens = tokens.slice(0, 500);
  const contextPercent = summary.model?.contextPercentage ?? 0;
  const remainingContext = selectedModel
    ? Math.max(selectedModel.contextWindow - summary.tokens, 0)
    : undefined;

  function applyLayers(nextLayerIds: string[]) {
    setSelectedLayerIds(nextLayerIds);
    setText(composePrompt(nextLayerIds));
    setViewMode("plain");
  }

  function toggleLayer(layerId: string) {
    const nextLayerIds = selectedLayerSet.has(layerId)
      ? selectedLayerIds.filter((id) => id !== layerId)
      : [...selectedLayerIds, layerId];

    applyLayers(nextLayerIds);
  }

  function resetPrompt() {
    applyLayers([]);
  }

  function clearPrompt() {
    setSelectedLayerIds([]);
    setText("");
    setViewMode("plain");
  }

  function marginalTokenDelta(layerId: string) {
    const nextLayerIds = selectedLayerSet.has(layerId)
      ? selectedLayerIds.filter((id) => id !== layerId)
      : [...selectedLayerIds, layerId];

    return tokenize(composePrompt(nextLayerIds)).length - tokens.length;
  }

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

          <section className="patch-board" aria-labelledby="patch-board-title">
            <div className="patch-board-copy">
              <p className="eyebrow">Patch composer</p>
              <h3 id="patch-board-title">Apply prompt context as diffs</h3>
              <p>
                Toggle each canonical GitHub Copilot context patch to apply it to the plaintext prompt.
                Token metrics update from the composed result.
              </p>
            </div>

            <div className="patch-layout">
              <div className="patch-layer-grid" aria-label="Prompt patch layers">
                {promptPatchLayers.map((layer) => {
                  const isSelected = selectedLayerSet.has(layer.id);
                  const delta = marginalTokenDelta(layer.id);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className="patch-layer-button"
                      key={layer.id}
                      type="button"
                      onClick={() => toggleLayer(layer.id)}
                    >
                      <span className="patch-layer-state">{isSelected ? "Applied" : "Patch"}</span>
                      <span className="patch-layer-name">{layer.name}</span>
                      <span className="patch-layer-description">{layer.description}</span>
                      <span className="patch-layer-delta">
                        {delta > 0 ? "+" : ""}
                        {formatNumber(delta)} tokens {isSelected ? "if removed" : "if applied"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="patch-preview" aria-label="Selected patch diff preview">
                <div className="patch-preview-header">
                  <span>{formatNumber(selectedLayerIds.length)} patches applied</span>
                  <button className="text-button" type="button" onClick={resetPrompt}>
                    Reset
                  </button>
                </div>
                {selectedLayerIds.length === 0 ? (
                  <p className="patch-empty">No patch diffs applied. The prompt contains only the base system prompt and user request.</p>
                ) : (
                  <pre>
                    {promptPatchLayers
                      .filter((layer) => selectedLayerSet.has(layer.id))
                      .map(createPatchDiff)
                      .join("\n\n")}
                  </pre>
                )}
              </div>
            </div>

            <div className="composition-rule" aria-label="Prompt composition order">
              <span>Base system</span>
              <span>Selected diffs</span>
              <span>User request</span>
            </div>
          </section>

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
            <button className="ghost-button" type="button" onClick={clearPrompt}>Clear</button>
            <button className="primary-button" type="button" onClick={resetPrompt}>
              Reset patches
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
