// Tokenizer canvas iframe client. Pure client-side: imports the ported
// tokenizer + model catalog and renders live views. Talks to the extension
// over plain HTTP for persistence (/state) and agent-pushed text (SSE /events).

import { tokenize, summarizeTokens } from "./tokenizer.mjs";
import {
  COPILOT_MODEL_OPTIONS,
  estimateInputUsd,
  estimateInputAiCredits,
} from "./models.mjs";

const MAX_RENDERED_TOKENS = 1000;

// Mirrors the --cat-* / border-style affordances in styles.css so the legend
// conveys both the color and the non-color (border-style) cue per category.
const CATEGORY = {
  word: { label: "Word", color: "#0969da", style: "solid" },
  number: { label: "Number", color: "#8250df", style: "solid" },
  whitespace: { label: "Whitespace", color: "#9a6700", style: "dashed" },
  newline: { label: "Newline", color: "#bf8700", style: "dashed" },
  punctuation: { label: "Punctuation", color: "#cf222e", style: "dotted" },
  operator: { label: "Operator", color: "#bc4c00", style: "dotted" },
  emoji: { label: "Emoji", color: "#1a7f37", style: "double" },
  symbol: { label: "Symbol", color: "#6e7781", style: "double" },
  other: { label: "Other", color: "#57606a", style: "solid" },
};
const CATEGORY_ORDER = Object.keys(CATEGORY);

const SAMPLE_TEXT =
  "Tokenize me! GitHub Copilot supports GPT-5.5, Claude Opus 4.8, and Gemini 3.1 Pro.\n" +
  "Costs scale with tokens — 1 credit = $0.01. 🚀  const total = a + b >= 42;";

const els = {
  input: document.getElementById("text-input"),
  sample: document.getElementById("sample-btn"),
  clear: document.getElementById("clear-btn"),
  labelToggle: document.getElementById("label-toggle"),
  legend: document.getElementById("legend"),
  stream: document.getElementById("token-stream"),
  overflow: document.getElementById("token-overflow"),
  body: document.getElementById("models-body"),
  stat: {
    tokens: document.getElementById("stat-tokens"),
    characters: document.getElementById("stat-characters"),
    bytes: document.getElementById("stat-bytes"),
    words: document.getElementById("stat-words"),
    lines: document.getElementById("stat-lines"),
  },
};

const sortState = { key: "usd", dir: "asc" };

const intFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatInt(value) {
  return intFmt.format(value);
}

function formatUsd(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 0,
  }).format(value);
}

function formatCredits(value) {
  const maximumFractionDigits = value >= 10 ? 1 : value >= 1 ? 2 : 4;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: value > 0 && value < 0.0001 ? 6 : 0,
  }).format(value);
}

function formatPercent(value) {
  if (value === 0) return "0%";
  const digits = value >= 10 ? 0 : value >= 1 ? 1 : 2;
  return `${value.toFixed(digits)}%`;
}

function formatContextWindow(tokens) {
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

function displayToken(token) {
  if (token.category === "newline") return "↵";
  if (token.category === "whitespace") {
    return token.text.replace(/\t/g, "⇥").replace(/ /g, "·");
  }
  return token.text;
}

function renderSummary(summary) {
  els.stat.tokens.textContent = formatInt(summary.tokens);
  els.stat.characters.textContent = formatInt(summary.characters);
  els.stat.bytes.textContent = formatInt(summary.bytes);
  els.stat.words.textContent = formatInt(summary.words);
  els.stat.lines.textContent = formatInt(summary.lines);
}

function renderLegend(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token.category, (counts.get(token.category) ?? 0) + 1);
  }
  els.legend.replaceChildren();
  for (const category of CATEGORY_ORDER) {
    const count = counts.get(category);
    if (!count) continue;
    const meta = CATEGORY[category];
    const item = document.createElement("span");
    item.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.borderBottomStyle = meta.style;
    swatch.style.borderBottomColor = meta.color;
    swatch.style.borderBottomWidth = meta.style === "double" ? "5px" : "4px";

    const text = document.createElement("span");
    text.textContent = `${meta.label} (${formatInt(count)})`;

    item.append(swatch, text);
    els.legend.append(item);
  }
}

function renderTokens(tokens) {
  if (tokens.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No tokens yet — start typing above.";
    els.stream.replaceChildren(empty);
    els.overflow.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  const limit = Math.min(tokens.length, MAX_RENDERED_TOKENS);
  for (let i = 0; i < limit; i += 1) {
    const token = tokens[i];
    const meta = CATEGORY[token.category] ?? CATEGORY.other;
    const chip = document.createElement("span");
    chip.className = "token-chip";
    chip.setAttribute("role", "listitem");
    chip.dataset.category = token.category;
    chip.title = `Token ${token.index + 1} · ${token.category} · ${token.bytes} byte${token.bytes === 1 ? "" : "s"} · id ${token.id}`;
    chip.setAttribute(
      "aria-label",
      `Token ${token.index + 1}, ${meta.label}, ${token.bytes} byte${token.bytes === 1 ? "" : "s"}`,
    );

    const textSpan = document.createElement("span");
    textSpan.className = "token-text";
    textSpan.textContent = displayToken(token);

    const catSpan = document.createElement("span");
    catSpan.className = "token-cat";
    catSpan.textContent = meta.label;

    chip.append(textSpan, catSpan);
    fragment.append(chip);
  }
  els.stream.replaceChildren(fragment);

  if (tokens.length > limit) {
    els.overflow.hidden = false;
    els.overflow.textContent = `Showing first ${formatInt(limit)} of ${formatInt(tokens.length)} tokens. Counts and costs reflect all tokens.`;
  } else {
    els.overflow.hidden = true;
  }
}

function compareRows(a, b) {
  let result;
  if (sortState.key === "context") {
    result = a.contextPct - b.contextPct;
  } else if (sortState.key === "credits") {
    result = a.credits - b.credits;
  } else {
    result = a.usd - b.usd;
  }
  if (result === 0) result = a.model.name.localeCompare(b.model.name);
  return sortState.dir === "asc" ? result : -result;
}

function renderModels(tokenCount) {
  const rows = COPILOT_MODEL_OPTIONS.map((model) => {
    const usd = estimateInputUsd(tokenCount, model);
    const credits = estimateInputAiCredits(tokenCount, model);
    const contextPct = (tokenCount / model.contextWindow) * 100;
    return {
      model,
      usd,
      credits,
      contextPct,
      overLimit: tokenCount > model.contextWindow,
    };
  });
  rows.sort(compareRows);

  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.overLimit) tr.classList.add("over-limit");

    const nameCell = document.createElement("td");
    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = row.model.name;
    const status = document.createElement("span");
    status.className = "model-status";
    status.textContent = row.model.releaseStatus;
    nameCell.append(name, status);
    if (row.overLimit) {
      const flag = document.createElement("span");
      flag.className = "over-flag";
      flag.textContent = "▲ over";
      nameCell.append(flag);
    }

    const providerCell = document.createElement("td");
    providerCell.textContent = row.model.provider;

    const usdCell = document.createElement("td");
    usdCell.className = "num";
    usdCell.textContent = formatUsd(row.usd);

    const creditsCell = document.createElement("td");
    creditsCell.className = "num";
    creditsCell.textContent = formatCredits(row.credits);

    const contextCell = document.createElement("td");
    contextCell.className = "num";
    const pctText = document.createElement("div");
    pctText.textContent = `${formatPercent(row.contextPct)} of ${formatContextWindow(row.model.contextWindow)}`;
    const bar = document.createElement("div");
    bar.className = "context-bar";
    if (row.overLimit) bar.classList.add("over");
    const fill = document.createElement("span");
    fill.style.width = `${Math.min(100, row.contextPct)}%`;
    bar.append(fill);
    bar.setAttribute("role", "img");
    bar.setAttribute(
      "aria-label",
      row.overLimit
        ? `Over context limit: ${formatInt(tokenCount)} tokens exceed ${formatInt(row.model.contextWindow)}`
        : `${formatPercent(row.contextPct)} of context window used`,
    );
    contextCell.append(pctText, bar);

    tr.append(nameCell, providerCell, usdCell, creditsCell, contextCell);
    fragment.append(tr);
  }
  els.body.replaceChildren(fragment);
  updateSortIndicators();
}

function updateSortIndicators() {
  const buttons = document.querySelectorAll(".sort-btn");
  for (const button of buttons) {
    const th = button.closest("th");
    const caret = button.querySelector(".sort-caret");
    if (button.dataset.sort === sortState.key) {
      th.setAttribute("aria-sort", sortState.dir === "asc" ? "ascending" : "descending");
      if (caret) caret.textContent = sortState.dir === "asc" ? "▲" : "▼";
    } else {
      th.removeAttribute("aria-sort");
      if (caret) caret.textContent = "";
    }
  }
}

function getText() {
  return els.input.value;
}

let lastSummary = { characters: 0, bytes: 0, words: 0, lines: 0, tokens: 0 };

function render() {
  const text = getText();
  const tokens = tokenize(text);
  const summary = summarizeTokens(text, tokens);
  lastSummary = summary;
  renderSummary(summary);
  renderLegend(tokens);
  renderTokens(tokens);
  renderModels(summary.tokens);
}

// ---- Persistence + agent push -------------------------------------------

let persistTimer = null;
function persist(text) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    fetch("./state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => {
      /* persistence is best-effort; ignore transport errors */
    });
  }, 350);
}

async function restore() {
  try {
    const response = await fetch("./state");
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data.text === "string" && data.text.length > 0) {
      els.input.value = data.text;
    }
  } catch {
    /* no persisted state available */
  }
}

function subscribeToAgentPushes() {
  if (typeof EventSource === "undefined") return;
  try {
    const source = new EventSource("./events");
    source.addEventListener("settext", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof data.text === "string") {
          els.input.value = data.text;
          render();
          persist(data.text);
        }
      } catch {
        /* ignore malformed push */
      }
    });
  } catch {
    /* SSE unavailable; canvas still works locally */
  }
}

// ---- Events --------------------------------------------------------------

els.input.addEventListener("input", () => {
  render();
  persist(getText());
});

els.clear.addEventListener("click", () => {
  els.input.value = "";
  render();
  persist("");
  els.input.focus();
});

els.sample.addEventListener("click", () => {
  els.input.value = SAMPLE_TEXT;
  render();
  persist(SAMPLE_TEXT);
});

els.labelToggle.addEventListener("change", () => {
  els.stream.classList.toggle("show-labels", els.labelToggle.checked);
});

for (const button of document.querySelectorAll(".sort-btn")) {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (sortState.key === key) {
      sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    } else {
      sortState.key = key;
      sortState.dir = "asc";
    }
    renderModels(lastSummary.tokens);
  });
}

// ---- Live chat (ambient-auth, optional) ---------------------------------
// Guarded: if the engine isn't mounted (e.g. the SDLC static server, or a host
// without a Copilot runtime), /live/status fails and the panel stays hidden so
// the tokenizer keeps working untouched.

const liveEls = {
  section: document.getElementById("live-section"),
  statusText: document.getElementById("live-status-text"),
  statusLine: document.getElementById("live-status"),
  model: document.getElementById("live-model"),
  transcript: document.getElementById("live-transcript"),
  empty: document.getElementById("live-empty"),
  form: document.getElementById("live-form"),
  input: document.getElementById("live-input"),
  send: document.getElementById("live-send"),
};

function liveConversationId() {
  if (globalThis.crypto?.randomUUID) return `canvas-${globalThis.crypto.randomUUID()}`;
  return `canvas-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setLiveStatus(state, text) {
  if (!liveEls.statusLine) return;
  liveEls.statusLine.className = `live-status live-status-${state}`;
  if (liveEls.statusText) liveEls.statusText.textContent = text;
}

function appendLiveMessage(role, label, text) {
  if (liveEls.empty && liveEls.empty.parentElement) liveEls.empty.remove();
  const article = document.createElement("article");
  article.className = `live-message live-message-${role}`;
  const tag = document.createElement("span");
  tag.className = "live-message-label";
  tag.textContent = label;
  const body = document.createElement("p");
  body.textContent = text;
  article.append(tag, body);
  liveEls.transcript.append(article);
  liveEls.transcript.scrollTop = liveEls.transcript.scrollHeight;
  return { article, tag, body };
}

function setupLiveChat() {
  if (!liveEls.section) return;
  const baseUrl = new URL("live", document.baseURI).href;
  let client = null;
  let streaming = false;
  const conversationId = liveConversationId();

  function populateModels(models) {
    if (!Array.isArray(models) || models.length === 0) return;
    const previous = liveEls.model.value;
    liveEls.model.replaceChildren();
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name || model.id;
      liveEls.model.append(option);
    }
    if ([...liveEls.model.options].some((option) => option.value === previous)) {
      liveEls.model.value = previous;
    }
  }

  function applyStatus(status) {
    if (!status || !status.available) {
      liveEls.section.hidden = true;
      return false;
    }
    liveEls.section.hidden = false;
    populateModels(status.models);
    if (status.engineStatus === "ready") {
      if (!status.authenticated) {
        setLiveStatus("error", "Sign in to GitHub Copilot to chat.");
        liveEls.send.disabled = true;
        return false;
      }
      setLiveStatus(
        "ready",
        status.login ? `Ready · signed in as ${status.login}` : "Ready",
      );
      liveEls.send.disabled = streaming;
      return true;
    }
    if (status.engineStatus === "warming") {
      setLiveStatus("warming", "Starting Copilot runtime…");
      liveEls.send.disabled = true;
      return false;
    }
    setLiveStatus("error", "Live unavailable.");
    liveEls.send.disabled = true;
    return false;
  }

  async function pollUntilReady() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        const status = await client.getStatus();
        if (applyStatus(status)) return;
        if (!status?.available) return;
      } catch {
        setLiveStatus("error", "Live unavailable.");
        return;
      }
    }
  }

  async function send(message) {
    streaming = true;
    liveEls.send.disabled = true;
    liveEls.input.disabled = true;
    appendLiveMessage("user", "You", message);
    const assistant = appendLiveMessage("assistant", "Copilot", "");
    const cursor = document.createElement("span");
    cursor.className = "live-stream-cursor";
    cursor.setAttribute("aria-hidden", "true");
    assistant.body.after(cursor);
    let streamed = "";

    try {
      await client.streamChat(
        { conversationId, model: liveEls.model.value || "auto", message },
        {
          onDelta: (delta) => {
            streamed += delta;
            assistant.body.textContent = streamed;
            liveEls.transcript.scrollTop = liveEls.transcript.scrollHeight;
          },
          onMessage: (text) => {
            if (text) assistant.body.textContent = text;
          },
          onError: (msg) => {
            assistant.article.classList.add("live-message-error");
            assistant.tag.textContent = "Copilot · error";
            if (!assistant.body.textContent) assistant.body.textContent = msg;
          },
        },
      );
    } catch (error) {
      assistant.article.classList.add("live-message-error");
      assistant.tag.textContent = "Copilot · error";
      if (!assistant.body.textContent) {
        assistant.body.textContent =
          error instanceof Error ? error.message : "Live chat failed.";
      }
    } finally {
      cursor.remove();
      streaming = false;
      liveEls.input.disabled = false;
      liveEls.send.disabled = false;
      liveEls.input.focus();
    }
  }

  liveEls.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = liveEls.input.value.trim();
    if (!message || streaming) return;
    liveEls.input.value = "";
    void send(message);
  });

  (async function initLive() {
    try {
      const module = await import("./liveClient.mjs");
      client = module.createLiveClient(baseUrl);
      const status = await client.getStatus();
      const ready = applyStatus(status);
      if (!ready && status?.available && status.engineStatus === "warming") {
        void pollUntilReady();
      }
    } catch {
      // Engine absent — leave the panel hidden; tokenizer is unaffected.
      liveEls.section.hidden = true;
    }
  })();
}

// ---- Boot ----------------------------------------------------------------

(async function init() {
  await restore();
  render();
  subscribeToAgentPushes();
  setupLiveChat();
})();
