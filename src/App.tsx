import { useMemo, useState } from "react";
import {
  summarizeTokens,
  tokenize,
  type Token,
} from "./lib/tokenizer";
import {
  COPILOT_MODELS,
  COPILOT_MODEL_OPTIONS,
  estimateInputAiCredits,
  estimateInputUsd,
  inputAiCreditsPerMillionTokens,
  modelById,
  type CopilotModelFamilyId,
} from "./lib/copilotModels";
import { composePrompt, createPatchDiff, promptPatchLayers } from "./lib/examples";
import "./App.css";

type ViewMode = "plain" | "tokens" | "ids";

const MODEL_GROUPS: readonly { id: CopilotModelFamilyId; label: string }[] = [
  { id: "anthropic", label: "Copilot · Claude" },
  { id: "openai", label: "Copilot · OpenAI" },
  { id: "google", label: "Copilot · Gemini" },
  { id: "github-microsoft", label: "Copilot · GitHub + Microsoft" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value < 0.01 ? 4 : 2,
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 0,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatAiCredits(value: number) {
  const maximumFractionDigits = value >= 10 ? 1 : value >= 1 ? 2 : 4;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: value > 0 && value < 0.0001 ? 6 : 0,
  }).format(value);
}

function visibleTokenText(token: Token) {
  return token.text;
}

function modelOptionLabel(modelId: string) {
  const model = modelById(modelId);
  if (!model) {
    return modelId;
  }

  const creditRate = formatAiCredits(inputAiCreditsPerMillionTokens(model));
  const cachedCreditRate = formatAiCredits(model.pricing.cachedInputPerMillionTokensUsd / 0.01);
  const suffix = model.id === "auto" ? "10% off" : model.provider;
  return `${model.name} · ${suffix} · ${creditRate}/1M in · ${cachedCreditRate}/1M cached`;
}

function highlightXml(value: string) {
  const segments = value.split(/(<\/?[\w:-]+(?:\s+[\w:-]+=(?:"[^"]*"|'[^']*'))*\s*\/?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("<!--") || segment.startsWith("<![CDATA[")) {
      return <span className="xml-comment" key={index}>{segment}</span>;
    }

    if (!segment.startsWith("<")) {
      return <span key={index}>{segment}</span>;
    }

    const parts = segment.split(/(\s+[\w:-]+)(=)("[^"]*"|'[^']*')/g);
    return (
      <span className="xml-tag" key={index}>
        {parts.map((part, partIndex) => {
          if (/^\s+[\w:-]+$/.test(part)) {
            return <span className="xml-attr" key={partIndex}>{part}</span>;
          }
          if (part === "=") {
            return <span className="xml-punctuation" key={partIndex}>{part}</span>;
          }
          if (/^["']/.test(part)) {
            return <span className="xml-string" key={partIndex}>{part}</span>;
          }
          return <span key={partIndex}>{part}</span>;
        })}
      </span>
    );
  });
}

function PatchLayerIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "folder":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M1.5 3h4l1.4 1.5h7.6v8.5h-13V3Zm1 2v7h11V5.5H6.45L5.05 4H2.5v1Z" />
        </svg>
      );
    case "book":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H7c.38 0 .73.14 1 .38C8.27 1.14 8.62 1 9 1h3.5A1.5 1.5 0 0 1 14 2.5V13H9a1 1 0 0 0-1 1 1 1 0 0 0-1-1H2V2.5Zm1 .5v9h4.5V2.5A.5.5 0 0 0 7 2H3.5a.5.5 0 0 0-.5.5V3Zm5.5 9H13V2.5a.5.5 0 0 0-.5-.5H9a.5.5 0 0 0-.5.5V12Z" />
        </svg>
      );
    case "code":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M3.4 10.9 1 8.5l2.4-2.4.7.7-1.7 1.7 1.7 1.7-.7.7Zm9.2 0-.7-.7 1.7-1.7-1.7-1.7.7-.7L15 8.5l-2.4 2.4ZM6.6 12.7l-1-.3 3.8-8.8 1 .4-3.8 8.7Z" />
        </svg>
      );
    case "tools":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M6.2 1.2a3.8 3.8 0 0 0-4.7 4.7l3.3-3.3 1.4 1.4-3.3 3.3a3.8 3.8 0 0 0 4.7-4.7l6 6a1.5 1.5 0 0 1-2.1 2.1l-6-6ZM12 10.4a.5.5 0 1 0 .7.7.5.5 0 0 0-.7-.7Z" />
        </svg>
      );
    case "agent":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M7.5 1h1v2H12l1 1v7l-1 1H9.5L7 14.5V12H4l-1-1V4l1-1h3.5V1ZM4 4v7h4v1.1L9.1 11H12V4H4Zm2 2h1v1H6V6Zm3 0h1v1H9V6Zm-3 3h4v1H6V9Z" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M1.5 3h13v10h-13V3Zm1 1v8h11V4h-11Zm2 2.2.7-.7L7.7 8l-2.5 2.5-.7-.7L6.3 8 4.5 6.2ZM8.5 10h4v1h-4v-1Z" />
        </svg>
      );
  }
}

export default function App() {
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [text, setText] = useState(composePrompt([]));
  const [selectedModelId, setSelectedModelId] = useState("auto");
  const [viewMode, setViewMode] = useState<ViewMode>("plain");
  const [plainScrollTop, setPlainScrollTop] = useState(0);

  const selectedLayerSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds]);
  const selectedModel = modelById(selectedModelId) ?? COPILOT_MODEL_OPTIONS[0];
  const tokens = useMemo(() => tokenize(text), [text]);
  const summary = useMemo(() => summarizeTokens(text, tokens, selectedModel), [text, tokens, selectedModel]);
  const displayedTokens = tokens.slice(0, 500);
  const contextPercent = summary.model?.contextPercentage ?? 0;
  const remainingContext = Math.max(selectedModel.contextWindow - summary.tokens, 0);
  const estimatedInputCost = estimateInputUsd(summary.tokens, selectedModel);
  const estimatedInputAiCredits = estimateInputAiCredits(summary.tokens, selectedModel);
  const inputAiCreditRate = inputAiCreditsPerMillionTokens(selectedModel);

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
          <p className="eyebrow">GitHub Copilot</p>
          <h1 id="app-title">GitHub Copilot Tokenization</h1>
          <p className="hero-copy">
            Paste text to inspect an approximate token breakdown, readable usage counts, and how much of a selected context window your prompt may consume.
          </p>
        </div>
      </section>

      <section className="workspace">
        <div className="editor-card panel">
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
              <div data-metric="ai-credits">
                <dd>{formatAiCredits(estimatedInputAiCredits)}</dd>
                <dt>AI credits</dt>
              </div>
            </dl>
          </div>

          <div className="text-surface">
            <div className="input-toolbar" aria-label="Prompt context controls">
              <div className="model-compact" aria-label="GitHub Copilot model selector">
                <label className="model-compact-label" htmlFor="copilot-model">
                  Model
                </label>
                <select
                  id="copilot-model"
                  aria-label="GitHub Copilot model"
                  value={selectedModel.id}
                  onChange={(event) => setSelectedModelId(event.target.value)}
                >
                  <option value="auto">{modelOptionLabel("auto")}</option>
                  {MODEL_GROUPS.map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {COPILOT_MODELS
                        .filter((model) => model.familyId === group.id)
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {modelOptionLabel(model.id)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <dl className="model-pricing" aria-label="Model pricing metadata">
                <div>
                  <dt>input</dt>
                  <dd>${formatNumber(selectedModel.pricing.inputPerMillionTokensUsd)}/1M</dd>
                </div>
                <div>
                  <dt>cached</dt>
                  <dd>${formatNumber(selectedModel.pricing.cachedInputPerMillionTokensUsd)}/1M</dd>
                </div>
                <div>
                  <dt>credits</dt>
                  <dd>{formatAiCredits(inputAiCreditRate)}/1M</dd>
                </div>
              </dl>
              <div className="patch-layer-grid" aria-label="Prompt context layers">
                {promptPatchLayers.map((layer) => {
                  const isSelected = selectedLayerSet.has(layer.id);
                  const delta = marginalTokenDelta(layer.id);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className="patch-layer-button"
                      key={layer.id}
                      title={`${layer.name}: ${layer.description}`}
                      aria-label={`${layer.name} context`}
                      type="button"
                      onClick={() => toggleLayer(layer.id)}
                    >
                      <span className="patch-layer-icon">
                        <PatchLayerIcon icon={layer.icon} />
                      </span>
                      <span className="patch-layer-delta">
                        {delta > 0 ? "+" : ""}
                        {formatNumber(delta)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="patch-preview sr-only" aria-label="Selected context preview">
                {selectedLayerIds.length === 0
                  ? "No context added."
                  : promptPatchLayers
                    .filter((layer) => selectedLayerSet.has(layer.id))
                    .map(createPatchDiff)
                    .join("\n\n")}
              </div>
            </div>
            {viewMode === "plain" ? (
              <div className="plaintext-shell">
                <pre
                  className="text-viewport plaintext-highlight"
                  aria-hidden="true"
                  style={{ transform: `translateY(-${plainScrollTop}px)` }}
                >
                  {text ? highlightXml(text) : <span className="placeholder-highlight">Paste or type text here...</span>}
                </pre>
                <textarea
                  className="text-viewport text-input"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onScroll={(event) => setPlainScrollTop(event.currentTarget.scrollTop)}
                  placeholder="Paste or type text here..."
                  aria-label="Plaintext editor"
                  spellCheck="true"
                />
              </div>
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
              Restore sample
            </button>
          </div>

          <div className="controls-row">
            <p className="cost-note">
              Estimated prompt input: {formatAiCredits(estimatedInputAiCredits)} AI credits ({formatCurrency(estimatedInputCost)}) at current Copilot usage-based pricing.
            </p>
          </div>

        </div>

        <aside className="stats-card panel" aria-label="Tokenizer statistics">
          <div className="context-box">
            <div className="context-label">
              <span>{selectedModel.name}</span>
              <strong>{formatNumber(contextPercent)}%</strong>
            </div>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${contextPercent}%` }} />
            </div>
            <p>
              {`${formatNumber(remainingContext)} tokens remaining in a ${formatNumber(selectedModel.contextWindow)} token window.`}
            </p>
          </div>

          <p className="help-text">
            Counts and input AI credits are deterministic in this app and intended for planning. Production tokenizers, output tokens, and cached-token billing may differ by provider, model version, and interaction.
          </p>
        </aside>
      </section>

      <footer className="references" aria-labelledby="references-title">
        <p className="eyebrow">References</p>
        <h2 id="references-title">Pricing and billing sources</h2>
        <ol>
          <li>
            <a href="https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing">
              GitHub Docs: Models and pricing for GitHub Copilot
            </a>
          </li>
          <li>
            <a href="https://white-cliff-095e8700f.7.azurestaticapps.net/index.html">
              GitHub Copilot usage-based billing preview
            </a>
          </li>
          <li>
            <a href="https://user-level-budgets-p--holly-kassel.github.app/">
              User-level budgets preview
            </a>
          </li>
          <li>
            <a href="https://share.articulate.com/pmpueguUReJvPTq-7f_aY">
              Copilot billing training reference
            </a>
          </li>
          <li>
            <a href="https://copilot-billing-preview.github.com/">
              Copilot billing preview
            </a>
          </li>
        </ol>
      </footer>
    </main>
  );
}
