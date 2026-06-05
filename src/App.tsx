import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  estimateOutputAiCredits,
  estimateOutputUsd,
  inputAiCreditsPerMillionTokens,
  modelById,
  type CopilotModelFamilyId,
} from "./lib/copilotModels";
import {
  assistantResponseForTurn,
  assistantResponseTraceForTurn,
  composeConversationRequest,
  composePrompt,
  conversationUserRequests,
  createPatchDiff,
  defaultUserRequest,
  getPromptSections,
  promptPatchLayers,
} from "./lib/examples";
import "./App.css";

type ViewMode = "chat" | "plain" | "tokens" | "ids";
type InvoiceDirection = -1 | 0 | 1;

interface InvoiceRow {
  id: string;
  label: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  aiCredits: number;
  active: boolean;
}

interface InvoiceTotal {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  aiCredits: number;
}

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

function estimateCachedInputAiCredits(tokenCount: number, model: { pricing: { cachedInputPerMillionTokensUsd: number } }) {
  return ((tokenCount / 1_000_000) * model.pricing.cachedInputPerMillionTokensUsd) / 0.01;
}

function estimateMixedInputAiCredits(inputTokens: number, cachedTokens: number, model: { pricing: { inputPerMillionTokensUsd: number; cachedInputPerMillionTokensUsd: number } }) {
  const inputCredits = ((inputTokens / 1_000_000) * model.pricing.inputPerMillionTokensUsd) / 0.01;
  return inputCredits + estimateCachedInputAiCredits(cachedTokens, model);
}

function emptyInvoiceTotal(): InvoiceTotal {
  return { inputTokens: 0, cachedTokens: 0, outputTokens: 0, aiCredits: 0 };
}

function creditFormulaTitle(model: {
  pricing: {
    inputPerMillionTokensUsd: number;
    cachedInputPerMillionTokensUsd: number;
    outputPerMillionTokensUsd: number;
  };
}) {
  return [
    "AI credits = input credits + cached input credits + output credits.",
    `input credits = uncached input tokens / 1,000,000 x ${formatCurrency(model.pricing.inputPerMillionTokensUsd)} / ${formatCurrency(0.01)}`,
    `cached input credits = cached input tokens / 1,000,000 x ${formatCurrency(model.pricing.cachedInputPerMillionTokensUsd)} / ${formatCurrency(0.01)}`,
    `output credits = output tokens / 1,000,000 x ${formatCurrency(model.pricing.outputPerMillionTokensUsd)} / ${formatCurrency(0.01)}`,
  ].join("\n");
}

function creditCalculationTitle(total: InvoiceTotal, model: {
  pricing: {
    inputPerMillionTokensUsd: number;
    cachedInputPerMillionTokensUsd: number;
    outputPerMillionTokensUsd: number;
  };
}) {
  if (total.inputTokens + total.cachedTokens + total.outputTokens === 0) {
    return undefined;
  }

  const inputCredits = ((total.inputTokens / 1_000_000) * model.pricing.inputPerMillionTokensUsd) / 0.01;
  const cachedCredits = ((total.cachedTokens / 1_000_000) * model.pricing.cachedInputPerMillionTokensUsd) / 0.01;
  const outputCredits = ((total.outputTokens / 1_000_000) * model.pricing.outputPerMillionTokensUsd) / 0.01;
  return [
    `${formatAiCredits(total.aiCredits)} AI credits total`,
    `Uncached input: ${formatNumber(total.inputTokens)} tokens x ${formatCurrency(model.pricing.inputPerMillionTokensUsd)}/1M = ${formatAiCredits(inputCredits)} credits`,
    `Cached input: ${formatNumber(total.cachedTokens)} tokens x ${formatCurrency(model.pricing.cachedInputPerMillionTokensUsd)}/1M = ${formatAiCredits(cachedCredits)} credits`,
    `Output: ${formatNumber(total.outputTokens)} tokens x ${formatCurrency(model.pricing.outputPerMillionTokensUsd)}/1M = ${formatAiCredits(outputCredits)} credits`,
  ].join("\n");
}

function rowCreditCalculationTitle(row: InvoiceRow, model: Parameters<typeof creditCalculationTitle>[1]) {
  return creditCalculationTitle({
    inputTokens: row.inputTokens,
    cachedTokens: row.cachedTokens,
    outputTokens: row.outputTokens,
    aiCredits: row.aiCredits,
  }, model);
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
  const outputCreditRate = formatAiCredits(model.pricing.outputPerMillionTokensUsd / 0.01);
  const suffix = model.id === "auto" ? "10% off" : model.provider;
  return `${model.name} · ${suffix} · ${creditRate}/1M in · ${cachedCreditRate}/1M cached · ${outputCreditRate}/1M out`;
}

function highlightXml(value: string) {
  const segments: { kind: "text" | "comment" | "tag"; value: string }[] = [];
  const xmlPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[\w:-]+(?:\s+[\w:-]+=(?:"[^"]*"|'[^']*'))*\s*\/?>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = xmlPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: value.slice(lastIndex, match.index) });
    }

    const [token] = match;
    segments.push({
      kind: token.startsWith("<!--") || token.startsWith("<![CDATA[") ? "comment" : "tag",
      value: token,
    });
    lastIndex = match.index + token.length;
  }

  if (lastIndex < value.length) {
    segments.push({ kind: "text", value: value.slice(lastIndex) });
  }

  return segments.map((segment, index) => {
    if (segment.kind === "comment") {
      return <span className="xml-comment" key={index}>{segment.value}</span>;
    }

    if (segment.kind === "text") {
      return <span key={index}>{segment.value}</span>;
    }

    const parts = segment.value.split(/(\s+[\w:-]+)(=)("[^"]*"|'[^']*')/g);
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

function SubmitIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M1.5 13.5 14.5 8 1.5 2.5v4.3L8.8 8l-7.3 1.2v4.3Zm1-1.5V10l6.4-1.1V7.1L2.5 6V4l9.4 4-9.4 4Z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M10.7 3.3 6 8l4.7 4.7-.7.7L4.6 8 10 2.6l.7.7Z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m5.3 12.7.7.7L11.4 8 6 2.6l-.7.7L10 8l-4.7 4.7Z" />
    </svg>
  );
}

export default function App() {
  const plainEditorRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatTranscriptRef = useRef<HTMLDivElement>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [draftUserMessage, setDraftUserMessage] = useState(defaultUserRequest);
  const [conversationTurns, setConversationTurns] = useState<string[]>([]);
  const [invoicePageIndex, setInvoicePageIndex] = useState(0);
  const [invoiceDirection, setInvoiceDirection] = useState<InvoiceDirection>(0);
  const [selectedModelId, setSelectedModelId] = useState("auto");
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [plainScrollTop, setPlainScrollTop] = useState(0);

  const selectedLayerSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds]);
  const selectedModel = modelById(selectedModelId) ?? COPILOT_MODEL_OPTIONS[0];
  const selectedTurnIndex = conversationTurns.length === 0 ? -1 : Math.min(invoicePageIndex, conversationTurns.length - 1);
  const previewTurns = useMemo(
    () => selectedTurnIndex >= 0
      ? conversationTurns.slice(0, selectedTurnIndex + 1)
      : [draftUserMessage].filter((message) => message.trim().length > 0),
    [conversationTurns, draftUserMessage, selectedTurnIndex],
  );
  const activeConversationRequest = useMemo(
    () => composeConversationRequest(previewTurns, { includeAssistantResponses: selectedTurnIndex >= 0 }),
    [previewTurns, selectedTurnIndex],
  );
  const promptSections = useMemo(
    () => getPromptSections(selectedLayerIds, activeConversationRequest),
    [selectedLayerIds, activeConversationRequest],
  );
  const text = useMemo(() => promptSections.map((section) => section.content).join("\n\n"), [promptSections]);
  const tokens = useMemo(() => tokenize(text), [text]);
  const draftUserMessageTokens = useMemo(() => tokenize(draftUserMessage), [draftUserMessage]);
  const summary = useMemo(() => summarizeTokens(text, tokens, selectedModel), [text, tokens, selectedModel]);
  const displayedTokens = tokens;
  const estimatedUserMessageCost = estimateInputUsd(draftUserMessageTokens.length, selectedModel);
  const estimatedUserMessageAiCredits = estimateInputAiCredits(draftUserMessageTokens.length, selectedModel);
  const inputAiCreditRate = inputAiCreditsPerMillionTokens(selectedModel);
  const invoicePages = useMemo(
    () => conversationTurns.map((_, index) => buildInvoicePage(index)),
    [conversationTurns, selectedLayerIds, selectedModel],
  );
  const selectedInvoicePage = selectedTurnIndex >= 0 ? invoicePages[selectedTurnIndex] : buildInvoicePage(-1);
  const invoiceRows = selectedInvoicePage.rows;
  const canonicalTokenCount = selectedInvoicePage.total.inputTokens + selectedInvoicePage.total.outputTokens;
  const contextPercent = Math.min((canonicalTokenCount / selectedModel.contextWindow) * 100, 100);
  const remainingContext = Math.max(selectedModel.contextWindow - canonicalTokenCount, 0);
  const selectedInputAiCredits = Math.max(selectedInvoicePage.total.aiCredits - estimateOutputAiCredits(selectedInvoicePage.total.outputTokens, selectedModel), 0);
  const selectedInputCost = selectedInputAiCredits * 0.01;
  const selectedOutputCost = estimateOutputUsd(selectedInvoicePage.total.outputTokens, selectedModel);
  const selectedOutputAiCredits = estimateOutputAiCredits(selectedInvoicePage.total.outputTokens, selectedModel);
  const conversationTotals = useMemo(
    () => invoicePages.slice(0, selectedTurnIndex + 1).reduce(
      (total, page) => ({
        inputTokens: total.inputTokens + page.total.inputTokens,
        cachedTokens: total.cachedTokens + page.total.cachedTokens,
        outputTokens: total.outputTokens + page.total.outputTokens,
        aiCredits: total.aiCredits + page.total.aiCredits,
      }),
      emptyInvoiceTotal(),
    ),
    [invoicePages, selectedTurnIndex],
  );
  const invoicePageCount = conversationTurns.length;
  const canNavigateInvoiceBack = selectedTurnIndex > 0;
  const canNavigateInvoiceForward = selectedTurnIndex >= 0 && selectedTurnIndex < conversationTurns.length - 1;
  const canSubmitUserMessage = draftUserMessage.trim().length > 0;
  const chatTranscript = conversationTurns.flatMap((message, index) => [
    { id: `user-${index}`, role: "user" as const, label: `User message ${index + 1}`, content: message },
    {
      id: `assistant-${index}`,
      role: "assistant" as const,
      label: `Assistant response ${index + 1}`,
      content: assistantResponseForTurn(index),
    },
  ]);

  function buildInvoicePage(turnIndex: number) {
    const optionalRows = promptPatchLayers.map((layer) => ({
      id: layer.id,
      label: layer.id === "instructions" ? "Custom instructions" : layer.name,
    }));

    if (turnIndex < 0) {
      const rows: InvoiceRow[] = [
        { id: "system", label: "System prompt" },
        ...optionalRows,
        { id: "user", label: "User message" },
        { id: "assistant", label: "Assistant response" },
      ].map((row) => ({
        ...row,
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        aiCredits: 0,
        active: false,
      }));

      return {
        rows,
        total: emptyInvoiceTotal(),
      };
    }

    const pageConversationRequest = composeConversationRequest(turnIndex >= 0 ? conversationTurns.slice(0, turnIndex + 1) : []);
    const previousConversationRequest = composeConversationRequest(turnIndex > 0 ? conversationTurns.slice(0, turnIndex) : []);
    const pageRows = buildInvoiceRows(getPromptSections(selectedLayerIds, pageConversationRequest));
    const previousRows = new Map(buildInvoiceRows(getPromptSections(selectedLayerIds, previousConversationRequest)).map((row) => [row.id, row.inputTokens]));

    const activeRows = new Map(pageRows.map((row) => [row.id, row]));
    const rows = [
      activeRows.get("system"),
      ...optionalRows.map((row) => activeRows.get(row.id) ?? {
        ...row,
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        aiCredits: 0,
        active: false,
      }),
      activeRows.get("user") ?? {
        id: "user",
        label: "User message",
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        aiCredits: 0,
        active: false,
      },
    ].filter((row): row is InvoiceRow => row !== undefined).map((row) => {
      const rawCachedTokens = turnIndex > 0 ? previousRows.get(row.id) ?? 0 : 0;
      const cachedTokens = Math.min(rawCachedTokens, row.inputTokens);
      const uncachedInputTokens = Math.max(row.inputTokens - cachedTokens, 0);
      return {
        ...row,
        inputTokens: uncachedInputTokens,
        cachedTokens,
        aiCredits: estimateMixedInputAiCredits(uncachedInputTokens, cachedTokens, selectedModel),
      };
    });
    const assistantOutputTokens = tokenize(assistantResponseTraceForTurn(turnIndex)).length;
    rows.push({
      id: "assistant",
      label: "Assistant response",
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: assistantOutputTokens,
      aiCredits: estimateOutputAiCredits(assistantOutputTokens, selectedModel),
      active: true,
    });

    return {
      rows,
      total: rows.reduce(
        (total, row) => ({
          inputTokens: total.inputTokens + row.inputTokens,
          cachedTokens: total.cachedTokens + row.cachedTokens,
          outputTokens: total.outputTokens + row.outputTokens,
          aiCredits: total.aiCredits + row.aiCredits,
        }),
        emptyInvoiceTotal(),
      ),
    };
  }

  function buildInvoiceRows(sections: ReturnType<typeof getPromptSections>) {
    return sections.map((section, index) => {
      const billedContent = index === 0 ? section.content : `\n\n${section.content}`;
      const tokenCount = tokenize(billedContent).length;
      return {
        id: section.id,
        label: section.label,
        inputTokens: tokenCount,
        cachedTokens: 0,
        outputTokens: 0,
        aiCredits: estimateInputAiCredits(tokenCount, selectedModel),
        active: true,
      };
    });
  }

  useEffect(() => {
    chatInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (viewMode !== "chat" || conversationTurns.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      if (chatTranscriptRef.current) {
        chatTranscriptRef.current.scrollTop = chatTranscriptRef.current.scrollHeight;
      }
    });
  }, [conversationTurns.length, viewMode]);

  function scrollPlainEditorTo(textValue: string, marker?: string) {
    const markerIndex = marker ? textValue.indexOf(marker) : -1;
    const targetText = markerIndex >= 0 ? textValue.slice(0, markerIndex) : "";
    const targetLine = targetText.split("\n").length - 1;
    const lineHeight = 29;
    const nextScrollTop = markerIndex >= 0 ? Math.max(targetLine * lineHeight - 24, 0) : 0;

    setPlainScrollTop(nextScrollTop);
    requestAnimationFrame(() => {
      if (plainEditorRef.current) {
        plainEditorRef.current.scrollTop = nextScrollTop;
      }
    });
  }

  function applyLayers(nextLayerIds: string[], focusMarker?: string) {
    const nextText = composePrompt(nextLayerIds, activeConversationRequest);
    setSelectedLayerIds(nextLayerIds);
    setViewMode("plain");
    scrollPlainEditorTo(nextText, focusMarker);
  }

  function toggleLayer(layerId: string) {
    const nextLayerIds = selectedLayerSet.has(layerId)
      ? selectedLayerIds.filter((id) => id !== layerId)
      : [...selectedLayerIds, layerId];

    const toggledLayer = promptPatchLayers.find((layer) => layer.id === layerId);
    const focusMarker = selectedLayerSet.has(layerId) ? undefined : toggledLayer?.content.split("\n")[0];
    applyLayers(nextLayerIds, focusMarker);
  }

  function resetPrompt() {
    const nextText = composePrompt([], "");
    setSelectedLayerIds([]);
    setDraftUserMessage(defaultUserRequest);
    setConversationTurns([]);
    setInvoicePageIndex(0);
    setInvoiceDirection(0);
    setViewMode("chat");
    scrollPlainEditorTo(nextText);
  }

  function clearPrompt() {
    const nextText = composePrompt([], "");
    setSelectedLayerIds([]);
    setDraftUserMessage("");
    setConversationTurns([]);
    setInvoicePageIndex(0);
    setInvoiceDirection(0);
    setViewMode("chat");
    scrollPlainEditorTo(nextText);
  }

  function submitUserMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitUserMessage) {
      return;
    }

    const nextTurns = [...conversationTurns, draftUserMessage];
    const nextTurnIndex = nextTurns.length - 1;
    const nextConversationRequest = composeConversationRequest(nextTurns, { includeAssistantResponses: true });
    const nextText = composePrompt(selectedLayerIds, nextConversationRequest);
    setConversationTurns(nextTurns);
    setDraftUserMessage(conversationUserRequests[nextTurns.length] ?? "");
    setInvoicePageIndex(nextTurnIndex);
    setInvoiceDirection(1);
    setViewMode("chat");
    scrollPlainEditorTo(nextText, "<userRequest>");
    chatInputRef.current?.focus({ preventScroll: true });
  }

  function navigateInvoice(direction: InvoiceDirection) {
    if (direction === 0 || conversationTurns.length === 0) {
      return;
    }

    setInvoiceDirection(direction);
    setInvoicePageIndex((currentIndex) => Math.min(Math.max(currentIndex + direction, 0), conversationTurns.length - 1));
  }

  function marginalTokenDelta(layerId: string) {
    const nextLayerIds = selectedLayerSet.has(layerId)
      ? selectedLayerIds.filter((id) => id !== layerId)
      : [...selectedLayerIds, layerId];

    return tokenize(composePrompt(nextLayerIds, activeConversationRequest)).length - tokens.length;
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
                aria-selected={viewMode === "chat"}
                className={viewMode === "chat" ? "active" : ""}
                role="tab"
                type="button"
                onClick={() => setViewMode("chat")}
              >
                Chat
              </button>
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
                  <dt>output</dt>
                  <dd>${formatNumber(selectedModel.pricing.outputPerMillionTokensUsd)}/1M</dd>
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
            {viewMode === "chat" ? (
              <div ref={chatTranscriptRef} className="text-viewport chat-transcript" aria-label="Chat transcript" role="log" tabIndex={0}>
                {chatTranscript.map((message) => (
                  <article className={`chat-message chat-message-${message.role}`} key={message.id}>
                    <span className="chat-message-label">{message.label}</span>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
            ) : viewMode === "plain" ? (
              <div className="plaintext-shell">
                <pre
                  className="text-viewport plaintext-highlight"
                  aria-hidden="true"
                >
                  <span
                    className="plaintext-highlight-content"
                    style={{ transform: `translateY(-${plainScrollTop}px)` }}
                  >
                    {text ? highlightXml(text) : <span className="placeholder-highlight">Paste or type text here...</span>}
                  </span>
                </pre>
                <textarea
                  ref={plainEditorRef}
                  className="text-viewport text-input"
                  value={text}
                  onScroll={(event) => setPlainScrollTop(event.currentTarget.scrollTop)}
                  placeholder="Paste or type text here..."
                  aria-label="Plaintext editor"
                  aria-readonly="true"
                  readOnly
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
            <form className="chat-composer" aria-label="Chat message composer" onSubmit={submitUserMessage}>
              <label className="chat-composer-label" htmlFor="chat-message">
                User message
              </label>
              <textarea
                ref={chatInputRef}
                id="chat-message"
                className="chat-input"
                value={draftUserMessage}
                placeholder="Ask Copilot or paste the user request to estimate its prompt impact..."
                aria-label="Chat message input"
                aria-readonly="true"
                readOnly
                rows={2}
                spellCheck="true"
              />
              <button
                className="chat-submit"
                type="submit"
                aria-label="Submit user message"
                title={canSubmitUserMessage ? "Submit user message" : "No more sample messages"}
                disabled={!canSubmitUserMessage}
              >
                <SubmitIcon />
              </button>
              <dl className="chat-impact" aria-label="Chat message token and credit impact">
                <div>
                  <dd>{formatNumber(draftUserMessageTokens.length)}</dd>
                  <dt>tokens</dt>
                </div>
                <div>
                  <dd>{formatAiCredits(estimatedUserMessageAiCredits)}</dd>
                  <dt>AI credits</dt>
                </div>
                <div>
                  <dd>{formatCurrency(estimatedUserMessageCost)}</dd>
                  <dt>input</dt>
                </div>
              </dl>
            </form>
          </div>

          <div className="editor-actions">
            <button className="ghost-button" type="button" onClick={clearPrompt}>Clear</button>
            <button className="primary-button" type="button" onClick={resetPrompt}>
              Restore sample
            </button>
          </div>

          <div className="controls-row">
            <p className="cost-note">
              Estimated selected turn: {formatAiCredits(selectedInputAiCredits)} input credits ({formatCurrency(selectedInputCost)}) and {formatAiCredits(selectedOutputAiCredits)} output credits ({formatCurrency(selectedOutputCost)}).
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

          <dl className="context-metrics" aria-label="Prompt metrics">
            <div data-metric="tokens">
              <dt>tokens</dt>
              <dd aria-label="Current token count">{formatNumber(canonicalTokenCount)}</dd>
            </div>
            <div data-metric="characters">
              <dt>characters</dt>
              <dd>{formatNumber(summary.characters)}</dd>
            </div>
            <div data-metric="words">
              <dt>words</dt>
              <dd>{formatNumber(summary.words)}</dd>
            </div>
            <div data-metric="bytes">
              <dt>bytes</dt>
              <dd>{formatNumber(summary.bytes)}</dd>
            </div>
            <div data-metric="ai-credits">
              <dt>AI credits</dt>
              <dd>{formatAiCredits(selectedInvoicePage.total.aiCredits)}</dd>
            </div>
          </dl>

          <div className="invoice-panel" aria-label="Prompt cost invoice">
            <div className="invoice-nav" aria-label="Conversation turn invoice navigation">
              <button
                aria-label="Previous conversation turn"
                type="button"
                onClick={() => navigateInvoice(-1)}
                disabled={!canNavigateInvoiceBack}
              >
                <ArrowLeftIcon />
              </button>
              <span aria-live="polite">
                {invoicePageCount === 0 ? "Turn 0 of 0" : `Turn ${selectedTurnIndex + 1} of ${invoicePageCount}`}
              </span>
              <button
                aria-label="Next conversation turn"
                type="button"
                onClick={() => navigateInvoice(1)}
                disabled={!canNavigateInvoiceForward}
              >
                <ArrowRightIcon />
              </button>
            </div>
            <div
              className={`invoice-slide invoice-slide-${invoiceDirection > 0 ? "next" : invoiceDirection < 0 ? "previous" : "static"}`}
              key={`${selectedTurnIndex}-${invoiceDirection}-${invoiceRows.map((row) => `${row.id}:${row.inputTokens}:${row.cachedTokens}:${row.outputTokens}`).join("|")}`}
            >
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Input</th>
                    <th scope="col">Cached</th>
                    <th scope="col">Output</th>
                    <th scope="col" title={creditFormulaTitle(selectedModel)}>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((row) => (
                    <tr className={row.active ? "" : "inactive"} key={row.id}>
                      <th scope="row">{row.label}</th>
                      <td>{formatNumber(row.inputTokens)}</td>
                      <td>{formatNumber(row.cachedTokens)}</td>
                      <td>{formatNumber(row.outputTokens)}</td>
                      <td title={rowCreditCalculationTitle(row, selectedModel)}>{formatAiCredits(row.aiCredits)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Turn total</th>
                    <td>{formatNumber(selectedInvoicePage.total.inputTokens)}</td>
                    <td>{formatNumber(selectedInvoicePage.total.cachedTokens)}</td>
                    <td>{formatNumber(selectedInvoicePage.total.outputTokens)}</td>
                    <td title={creditCalculationTitle(selectedInvoicePage.total, selectedModel)}>
                      {formatAiCredits(selectedInvoicePage.total.aiCredits)}
                    </td>
                  </tr>
                  <tr className="conversation-total">
                    <th scope="row">Conversation total</th>
                    <td>{formatNumber(conversationTotals.inputTokens)}</td>
                    <td>{formatNumber(conversationTotals.cachedTokens)}</td>
                    <td>{formatNumber(conversationTotals.outputTokens)}</td>
                    <td title={creditCalculationTitle(conversationTotals, selectedModel)}>
                      {formatAiCredits(conversationTotals.aiCredits)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="help-text">
            Counts and AI credits are deterministic in this app and intended for planning. Conversation totals sum per-turn billing impact across repeated prompt input, cached input, and assistant output; production tokenizers and cached-token billing may differ by provider, model version, and interaction.
          </p>
        </aside>
      </section>

      <footer className="references" aria-labelledby="references-title">
        <p className="eyebrow" id="references-title">References</p>
        <ol>
          <li>
            <cite>
              “Models and Pricing for GitHub Copilot.” <span>GitHub Docs</span>,
              GitHub,{" "}
              <a href="https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing">
                docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
              </a>.
            </cite>
            <p>Primary pricing reference for Copilot model input, cached input, and output token rates.</p>
          </li>
          <li>
            <cite>
              “GitHub Copilot Usage-Based Billing Preview.” <span>Azure Static Web Apps</span>,{" "}
              <a href="https://white-cliff-095e8700f.7.azurestaticapps.net/index.html">
                white-cliff-095e8700f.7.azurestaticapps.net/index.html
              </a>.
            </cite>
            <p>Preview calculator used to compare app estimates against a usage-based billing interface.</p>
          </li>
          <li>
            <cite>
              “User-Level Budgets Preview.” <span>GitHub App Preview</span>,{" "}
              <a href="https://user-level-budgets-p--holly-kassel.github.app/">
                user-level-budgets-p--holly-kassel.github.app
              </a>.
            </cite>
            <p>Reference for budget-focused Copilot usage controls and user-level spend framing.</p>
          </li>
          <li>
            <cite>
              “Copilot Billing Training Reference.” <span>Articulate</span>,{" "}
              <a href="https://share.articulate.com/pmpueguUReJvPTq-7f_aY">
                share.articulate.com/pmpueguUReJvPTq-7f_aY
              </a>.
            </cite>
            <p>Training material used for terminology, billing concepts, and explanatory copy alignment.</p>
          </li>
          <li>
            <cite>
              “Copilot Billing Preview.” <span>GitHub Pages</span>,{" "}
              <a href="https://copilot-billing-preview.github.com/">
                copilot-billing-preview.github.com
              </a>.
            </cite>
            <p>Preview experience used as a comparison point for Copilot billing presentation and usage summaries.</p>
          </li>
        </ol>
      </footer>
    </main>
  );
}
