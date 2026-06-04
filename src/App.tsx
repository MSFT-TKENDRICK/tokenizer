import { useMemo, useState } from "react";
import {
  DEFAULT_MODEL_LIMITS,
  summarizeTokens,
  tokenize,
  type ModelLimit,
  type Token,
} from "./lib/tokenizer";
import "./App.css";

const examples = [
  {
    name: "Tokenizer sample",
    text: "Many words map to one token, but some don't: indivisible.\n\nUnicode characters like emojis may be split into many tokens containing the underlying bytes: 🚀🚀🚀🚀\n\nSequences of characters commonly found next to each other may be grouped together: 1234567890",
  },
  {
    name: "Code sample",
    text: "function greet(name: string) {\n  return `Hello, ${name}!`;\n}",
  },
  {
    name: "Mixed language",
    text: "Tokenization handles words, numbers like 128000, emoji 🚀, punctuation, and line breaks.",
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
  const [tokenView, setTokenView] = useState<"text" | "ids">("text");

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
        <div className="hero-card" aria-label="Current token summary">
          <span>{summary.tokens}</span>
          <small>tokens estimated</small>
        </div>
      </section>

      <section className="workspace">
        <div className="editor-card panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Input</p>
              <h2>Text to tokenize</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => setText("")}>Clear</button>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste or type text here..."
            aria-label="Text to tokenize"
            spellCheck="true"
          />

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
            <button className="primary-button" type="button" onClick={() => setText(examples[0].text)}>
              Reset example
            </button>
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
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Counts</p>
              <h2>Prompt metrics</h2>
            </div>
          </div>

          <dl className="stats-grid">
            <div><dt>Tokens</dt><dd>{formatNumber(summary.tokens)}</dd></div>
            <div><dt>Characters</dt><dd>{formatNumber(summary.characters)}</dd></div>
            <div><dt>Words</dt><dd>{formatNumber(summary.words)}</dd></div>
            <div><dt>Bytes</dt><dd>{formatNumber(summary.bytes)}</dd></div>
          </dl>

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

      <section className="panel token-panel" aria-labelledby="token-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Visualization</p>
            <h2 id="token-title">Token visualization</h2>
          </div>
          <span className="chip-count">{formatNumber(displayedTokens.length)} shown</span>
        </div>

        {tokens.length === 0 ? (
          <p className="empty-state">Add text above to see tokens highlighted as a contiguous stream.</p>
        ) : (
          <div className="token-viewer" aria-label="Tokenized text visualization">
            <div className="token-stream" aria-label={tokenView === "text" ? "Token text view" : "Token ID view"}>
              {displayedTokens.map((token) => (
                <span
                  className={`token-segment token-${token.index % 6} token-kind-${token.category}`}
                  key={`${token.index}-${token.start}`}
                  title={`Token ${token.index + 1} · ${token.category} · ${token.bytes} bytes · ID ${token.id}`}
                >
                  {tokenView === "text" ? visibleTokenText(token) : token.id}
                </span>
              ))}
              {tokens.length > displayedTokens.length && (
                <span className="token-segment token-more">
                  +{formatNumber(tokens.length - displayedTokens.length)} more
                </span>
              )}
            </div>
            <div className="token-toggle" role="tablist" aria-label="Token visualization mode">
              <button
                aria-selected={tokenView === "text"}
                className={tokenView === "text" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setTokenView("text")}
              >
                Text
              </button>
              <button
                aria-selected={tokenView === "ids"}
                className={tokenView === "ids" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setTokenView("ids")}
              >
                Token IDs
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
