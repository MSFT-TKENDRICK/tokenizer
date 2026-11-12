import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  summarizeTokens,
  tokenize,
  type Token,
} from "./lib/tokenizer";
import {
  AI_CREDIT_USD_VALUE,
  AUTO_ELIGIBLE_MODEL_IDS,
  COPILOT_MODELS,
  COPILOT_MODEL_OPTIONS,
  COPILOT_MODEL_FAMILIES,
  DEFAULT_AUTO_ROUTED_MODEL_ID,
  AUTO_MODEL_DISCOUNT,
  AUTO_MODEL_SOURCE_URL,
  PRICING_SOURCE_URL,
  PRICING_VERIFIED_ON,
  SUPPORTED_MODELS_SOURCE_URL,
  createAutoModel,
  estimateInputAiCredits,
  estimateInputUsd,
  estimateOutputAiCredits,
  estimateOutputUsd,
  modelById,
  pricingForPromptTokens,
  type CopilotModel,
  type CopilotModelFamilyId,
} from "./lib/copilotModels";
import { estimateTurnInvoice } from "./lib/invoice";
import {
  assistantResponseForTurn,
  composeConversationRequest,
  composePrompt,
  createPatchDiff,
  defaultUserRequest,
  getPromptSections,
  promptPatchLayers,
  type PromptSection,
} from "./lib/examples";
import "./App.css";

type ViewMode = "chat" | "plain" | "tokens" | "ids";
type InvoiceDirection = -1 | 0 | 1;

interface InvoiceRow {
  id: string;
  label: string;
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  aiCredits: number;
  active: boolean;
}

interface InvoiceTotal {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  aiCredits: number;
  contextTokens: number;
  contextPercentage: number;
  promptTokens: number;
  totalUsd: number;
}

interface InvoicePage {
  rows: InvoiceRow[];
  total: InvoiceTotal;
  requestText: string;
  model: CopilotModel;
  layerIds: string[];
}

const MODEL_GROUPS: readonly { id: CopilotModelFamilyId; label: string }[] = COPILOT_MODEL_FAMILIES;

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatCurrency(value: number) {
  const absoluteValue = Math.abs(value);
  const maximumFractionDigits = absoluteValue > 0 && absoluteValue < 1
    ? Math.min(10, Math.max(2, Math.ceil(-Math.log10(absoluteValue)) + 1))
    : 2;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: absoluteValue > 0 && absoluteValue < 1 ? 2 : 0,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatAiCredits(value: number) {
  const smallPositiveValue = value > 0 && value < 0.0001;
  const smallValueFractionDigits = smallPositiveValue
    ? Math.min(10, Math.max(6, Math.ceil(-Math.log10(value)) + 1))
    : 0;
  const maximumFractionDigits = Math.max(
    smallValueFractionDigits,
    value >= 10 ? 1 : value >= 1 ? 2 : 4,
  );
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: smallValueFractionDigits,
  }).format(value);
}

function invoicePageFromEstimate(
  model: CopilotModel,
  sections: readonly PromptSection[],
  previousRequestText: string,
  assistantResponse: string,
  layerIds: readonly string[],
): InvoicePage {
  const estimate = estimateTurnInvoice(model, sections, previousRequestText, assistantResponse);
  return {
    rows: estimate.rows.map((row) => ({ ...row, active: true })),
    total: {
      inputTokens: estimate.total.inputTokens,
      cachedTokens: estimate.total.cachedTokens,
      cacheWriteTokens: estimate.total.cacheWriteTokens,
      outputTokens: estimate.total.outputTokens,
      aiCredits: estimate.total.totalAiCredits,
      contextTokens: estimate.total.contextTokens,
      contextPercentage: estimate.total.contextPercentage,
      promptTokens: estimate.total.promptTokens,
      totalUsd: estimate.total.totalUsd,
    },
    requestText: estimate.requestText,
    model,
    layerIds: [...layerIds],
  };
}

function sameLayerIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function emptyInvoiceTotal(): InvoiceTotal {
  return {
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    aiCredits: 0,
    contextTokens: 0,
    contextPercentage: 0,
    promptTokens: 0,
    totalUsd: 0,
  };
}

function creditFormulaTitle(model: {
  pricing: {
    inputPerMillionTokensUsd: number;
    cachedInputPerMillionTokensUsd: number;
    cacheWritePerMillionTokensUsd?: number;
    outputPerMillionTokensUsd: number;
  };
}) {
  return [
    "AI credits = input credits + cached input credits + cache-write credits + output credits.",
    `input credits = uncached input tokens / 1,000,000 x ${formatCurrency(model.pricing.inputPerMillionTokensUsd)} / ${formatCurrency(AI_CREDIT_USD_VALUE)}`,
    `cached input credits = cached input tokens / 1,000,000 x ${formatCurrency(model.pricing.cachedInputPerMillionTokensUsd)} / ${formatCurrency(AI_CREDIT_USD_VALUE)}`,
    `cache-write credits = cache-write tokens / 1,000,000 x ${formatCurrency(model.pricing.cacheWritePerMillionTokensUsd ?? model.pricing.inputPerMillionTokensUsd)} / ${formatCurrency(AI_CREDIT_USD_VALUE)}`,
    `output credits = output tokens / 1,000,000 x ${formatCurrency(model.pricing.outputPerMillionTokensUsd)} / ${formatCurrency(AI_CREDIT_USD_VALUE)}`,
  ].join("\n");
}

function creditCalculationTitle(total: Pick<InvoiceTotal, "inputTokens" | "cachedTokens" | "cacheWriteTokens" | "outputTokens" | "aiCredits">, model: {
  pricing: {
    inputPerMillionTokensUsd: number;
    cachedInputPerMillionTokensUsd: number;
    cacheWritePerMillionTokensUsd?: number;
    outputPerMillionTokensUsd: number;
  };
}) {
  if (total.inputTokens + total.cachedTokens + total.cacheWriteTokens + total.outputTokens === 0) {
    return undefined;
  }

  const inputCredits = ((total.inputTokens / 1_000_000) * model.pricing.inputPerMillionTokensUsd) / AI_CREDIT_USD_VALUE;
  const cachedCredits = ((total.cachedTokens / 1_000_000) * model.pricing.cachedInputPerMillionTokensUsd) / AI_CREDIT_USD_VALUE;
  const cacheWriteCredits = ((total.cacheWriteTokens / 1_000_000) * (model.pricing.cacheWritePerMillionTokensUsd ?? model.pricing.inputPerMillionTokensUsd)) / AI_CREDIT_USD_VALUE;
  const outputCredits = ((total.outputTokens / 1_000_000) * model.pricing.outputPerMillionTokensUsd) / AI_CREDIT_USD_VALUE;
  return [
    `${formatAiCredits(total.aiCredits)} AI credits total`,
    `Uncached input: ${formatNumber(total.inputTokens)} tokens x ${formatCurrency(model.pricing.inputPerMillionTokensUsd)}/1M = ${formatAiCredits(inputCredits)} credits`,
    `Cached input: ${formatNumber(total.cachedTokens)} tokens x ${formatCurrency(model.pricing.cachedInputPerMillionTokensUsd)}/1M = ${formatAiCredits(cachedCredits)} credits`,
    `Cache write: ${formatNumber(total.cacheWriteTokens)} tokens x ${formatCurrency(model.pricing.cacheWritePerMillionTokensUsd ?? model.pricing.inputPerMillionTokensUsd)}/1M = ${formatAiCredits(cacheWriteCredits)} credits`,
    `Output: ${formatNumber(total.outputTokens)} tokens x ${formatCurrency(model.pricing.outputPerMillionTokensUsd)}/1M = ${formatAiCredits(outputCredits)} credits`,
  ].join("\n");
}

function rowCreditCalculationTitle(row: InvoiceRow, model: Parameters<typeof creditCalculationTitle>[1]) {
  return creditCalculationTitle({
    inputTokens: row.inputTokens,
    cachedTokens: row.cachedTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    outputTokens: row.outputTokens,
    aiCredits: row.aiCredits,
  }, model);
}

function visibleTokenText(token: Token) {
  return token.text;
}

function modelOptionLabel(modelId: string, autoModel?: CopilotModel) {
  const model = modelId === "auto" && autoModel ? autoModel : modelById(modelId);
  if (!model) {
    return modelId;
  }

  const creditRate = formatAiCredits(model.pricing.inputPerMillionTokensUsd / AI_CREDIT_USD_VALUE);
  const cachedCreditRate = formatAiCredits(model.pricing.cachedInputPerMillionTokensUsd / AI_CREDIT_USD_VALUE);
  const outputCreditRate = formatAiCredits(model.pricing.outputPerMillionTokensUsd / AI_CREDIT_USD_VALUE);
  const routeName = model.id === "auto"
    ? COPILOT_MODELS.find((candidate) => candidate.id === model.routedModelId)?.name ?? model.routedModelId
    : undefined;
  const suffix = model.id === "auto"
    ? `assumes ${routeName} · 10% off`
    : model.provider;
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

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M13 2.5V6H9.5l1.4-1.4A4.5 4.5 0 1 0 12.5 8h1A5.5 5.5 0 1 1 11.6 3.9L13 2.5Z" />
    </svg>
  );
}

export default function App() {
  const plainEditorRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatTranscriptRef = useRef<HTMLDivElement>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [draftUserMessage, setDraftUserMessage] = useState(defaultUserRequest);
  const [rawPromptOverride, setRawPromptOverride] = useState<string | null>(null);
  const [conversationTurns, setConversationTurns] = useState<string[]>([]);
  const [invoicePages, setInvoicePages] = useState<InvoicePage[]>([]);
  const [invoicePageIndex, setInvoicePageIndex] = useState(0);
  const [invoiceDirection, setInvoiceDirection] = useState<InvoiceDirection>(0);
  const [selectedModelId, setSelectedModelId] = useState("auto");
  const [autoRoutedModelId, setAutoRoutedModelId] = useState(DEFAULT_AUTO_ROUTED_MODEL_ID);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [plainScrollTop, setPlainScrollTop] = useState(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const selectedLayerSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds]);
  const selectedModel = selectedModelId === "auto"
    ? createAutoModel(autoRoutedModelId)
    : modelById(selectedModelId) ?? COPILOT_MODEL_OPTIONS[0];
  const selectedTurnIndex = conversationTurns.length === 0 ? -1 : Math.min(invoicePageIndex, conversationTurns.length - 1);
  const previewTurns = useMemo(
    () => selectedTurnIndex >= 0
      ? conversationTurns.slice(0, selectedTurnIndex + 1)
      : [draftUserMessage].filter((message) => message.trim().length > 0),
    [conversationTurns, draftUserMessage, selectedTurnIndex],
  );
  const activeConversationRequest = useMemo(
    () => composeConversationRequest(previewTurns, {
      includeAssistantResponses: selectedTurnIndex >= 0,
      omitLastAssistantResponse: true,
    }),
    [previewTurns, selectedTurnIndex],
  );
  const promptSections = useMemo(
    () => getPromptSections(selectedLayerIds, activeConversationRequest),
    [selectedLayerIds, activeConversationRequest],
  );
  const generatedText = useMemo(() => promptSections.map((section) => section.content).join("\n\n"), [promptSections]);
  const text = rawPromptOverride ?? generatedText;
  const tokens = useMemo(() => tokenize(text), [text]);
  const draftUserMessageTokens = useMemo(() => tokenize(draftUserMessage), [draftUserMessage]);
  const summary = useMemo(() => summarizeTokens(text, tokens, selectedModel), [text, tokens, selectedModel]);
  const selectedPricingTier = pricingForPromptTokens(selectedModel, tokens.length);
  const displayedTokens = tokens.slice(0, 2_000);
  const estimatedUserMessageCost = estimateInputUsd(draftUserMessageTokens.length, selectedModel);
  const estimatedUserMessageAiCredits = estimateInputAiCredits(draftUserMessageTokens.length, selectedModel);
  const savedInvoicePage = selectedTurnIndex >= 0 ? invoicePages[selectedTurnIndex] : undefined;
  const hasLayerEdits = savedInvoicePage !== undefined && !sameLayerIds(savedInvoicePage.layerIds, selectedLayerIds);
  const isDraftView = selectedTurnIndex < 0 || rawPromptOverride !== null || hasLayerEdits;
  const selectedInvoicePage = rawPromptOverride !== null
    ? invoicePageFromEstimate(
      selectedModel,
      [{ id: "edited-prompt", label: "Edited prompt", content: rawPromptOverride }],
      "",
      "",
      selectedLayerIds,
    )
    : hasLayerEdits
      ? invoicePageFromEstimate(selectedModel, promptSections, "", "", selectedLayerIds)
      : savedInvoicePage ?? buildInvoicePage(-1);
  const invoiceModel = selectedInvoicePage.model;
  const invoicePricing = pricingForPromptTokens(invoiceModel, selectedInvoicePage.total.promptTokens).pricing;
  const inputAiCreditRate = selectedPricingTier.pricing.inputPerMillionTokensUsd / AI_CREDIT_USD_VALUE;
  const invoiceRows = selectedInvoicePage.rows;
  const canonicalTokenCount = tokens.length;
  const contextPercent = selectedInvoicePage.total.contextPercentage;
  const displayContextWindow = invoiceModel.contextWindow;
  const remainingContext = Math.max(displayContextWindow - selectedInvoicePage.total.contextTokens, 0);
  const selectedOutputCost = isDraftView ? 0 : estimateOutputUsd(
    selectedInvoicePage.total.outputTokens,
    invoiceModel,
    selectedInvoicePage.total.promptTokens,
  );
  const selectedOutputAiCredits = isDraftView ? 0 : estimateOutputAiCredits(
    selectedInvoicePage.total.outputTokens,
    invoiceModel,
    selectedInvoicePage.total.promptTokens,
  );
  const selectedInputAiCredits = isDraftView
    ? selectedInvoicePage.total.aiCredits
    : Math.max(selectedInvoicePage.total.aiCredits - selectedOutputAiCredits, 0);
  const selectedInputCost = isDraftView
    ? selectedInvoicePage.total.totalUsd
    : Math.max(selectedInvoicePage.total.totalUsd - selectedOutputCost, 0);
  const conversationTotals = useMemo(
    () => invoicePages.slice(0, selectedTurnIndex + 1).reduce(
      (total, page) => ({
        inputTokens: total.inputTokens + page.total.inputTokens,
        cachedTokens: total.cachedTokens + page.total.cachedTokens,
        cacheWriteTokens: total.cacheWriteTokens + page.total.cacheWriteTokens,
        outputTokens: total.outputTokens + page.total.outputTokens,
        aiCredits: total.aiCredits + page.total.aiCredits,
        totalUsd: total.totalUsd + page.total.totalUsd,
        promptTokens: total.promptTokens + page.total.promptTokens,
        contextTokens: total.contextTokens + page.total.contextTokens,
        contextPercentage: 0,
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
      label: `Example assistant reply ${index + 1}`,
      content: assistantResponseForTurn(index),
    },
  ]);

  function buildInvoicePage(
    turnIndex: number,
    turns: readonly string[] = conversationTurns,
    model: CopilotModel = selectedModel,
    layerIds: readonly string[] = selectedLayerIds,
  ): InvoicePage {
    if (turnIndex < 0) {
      return invoicePageFromEstimate(model, getPromptSections(layerIds, activeConversationRequest), "", "", layerIds);
    }

    const request = composeConversationRequest(turns.slice(0, turnIndex + 1), {
      includeAssistantResponses: true,
      omitLastAssistantResponse: true,
    });
    const previousPage = turnIndex > 0 ? invoicePages[turnIndex - 1] : undefined;
    const previousRequestText = previousPage?.model.id === model.id &&
      previousPage.model.routedModelId === model.routedModelId
      ? previousPage.requestText
      : "";
    return invoicePageFromEstimate(
      model,
      getPromptSections(layerIds, request),
      previousRequestText,
      assistantResponseForTurn(turnIndex),
      layerIds,
    );
  }

  useEffect(() => {
    chatInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const showUpdate = () => setUpdateAvailable(true);
    window.addEventListener("pwa-update-available", showUpdate);
    return () => window.removeEventListener("pwa-update-available", showUpdate);
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
    setPlainScrollTop(0);
    requestAnimationFrame(() => {
      const editor = plainEditorRef.current;
      if (!editor) {
        return;
      }

      const markerIndex = marker ? textValue.indexOf(marker) : -1;
      const targetLine = markerIndex >= 0 ? textValue.slice(0, markerIndex).split("\n").length - 1 : 0;
      const styles = window.getComputedStyle(editor);
      const lineHeight = Number.parseFloat(styles.lineHeight);
      const nextScrollTop = markerIndex >= 0 ? Math.max(targetLine * lineHeight, 0) : 0;

      setPlainScrollTop(nextScrollTop);
      editor.scrollTop = nextScrollTop;
    });
  }

  function applyLayers(nextLayerIds: string[], focusMarker?: string) {
    const nextText = composePrompt(nextLayerIds, activeConversationRequest);
    setSelectedLayerIds(nextLayerIds);
    setRawPromptOverride(null);
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
    const nextText = composePrompt([], defaultUserRequest);
    setSelectedLayerIds([]);
    setDraftUserMessage(defaultUserRequest);
    setRawPromptOverride(null);
    setConversationTurns([]);
    setInvoicePages([]);
    setInvoicePageIndex(0);
    setInvoiceDirection(0);
    setSelectedModelId("auto");
    setAutoRoutedModelId(DEFAULT_AUTO_ROUTED_MODEL_ID);
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
    const nextConversationRequest = composeConversationRequest(nextTurns, {
      includeAssistantResponses: true,
      omitLastAssistantResponse: true,
    });
    const nextText = composePrompt(selectedLayerIds, nextConversationRequest);
    const nextInvoicePage = buildInvoicePage(nextTurnIndex, nextTurns, selectedModel, selectedLayerIds);
    setConversationTurns(nextTurns);
    setInvoicePages([...invoicePages, nextInvoicePage]);
    setDraftUserMessage("");
    setRawPromptOverride(null);
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
    setRawPromptOverride(null);
    setInvoicePageIndex((currentIndex) => Math.min(Math.max(currentIndex + direction, 0), conversationTurns.length - 1));
  }

  function handleViewTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const modes: ViewMode[] = ["chat", "plain", "tokens", "ids"];
    const currentIndex = modes.indexOf(viewMode);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % modes.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + modes.length) % modes.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? modes.length - 1
            : -1;

    if (nextIndex >= 0) {
      event.preventDefault();
      const nextMode = modes[nextIndex];
      setViewMode(nextMode);
      document.getElementById(`tab-${nextMode}`)?.focus();
    }
  }

  function marginalTokenDelta(layerId: string) {
    const nextLayerIds = selectedLayerSet.has(layerId)
      ? selectedLayerIds.filter((id) => id !== layerId)
      : [...selectedLayerIds, layerId];

    return tokenize(composePrompt(nextLayerIds, activeConversationRequest)).length -
      tokenize(composePrompt(selectedLayerIds, activeConversationRequest)).length;
  }

  return (
    <main className="app-shell" aria-labelledby="app-title">
      {updateAvailable && (
        <div className="update-banner" role="status">
          <span>A new version of this tokenizer is available.</span>
          <button type="button" onClick={() => window.dispatchEvent(new Event("pwa-update-now"))}>
            Update now
          </button>
          <button type="button" aria-label="Dismiss update notice" onClick={() => setUpdateAvailable(false)}>
            Dismiss
          </button>
        </div>
      )}
      <section className="hero panel">
        <div>
          <p className="eyebrow">GitHub Copilot</p>
          <h1 id="app-title">&gt;_ GitHub Copilot Tokenization</h1>
          <p className="hero-copy">
            A local-only visualizer: token boundaries are approximate, model context windows are planning estimates, and assistant replies are examples. This app does not connect to GitHub Copilot or send your messages anywhere.
          </p>
        </div>
      </section>

      <section className="workspace">
        <div className="editor-card panel">
          <div className="view-bar">
            <div className="view-toggle" role="tablist" aria-label="Tokenizer view mode" onKeyDown={handleViewTabKeyDown}>
              <button
                id="tab-chat"
                aria-selected={viewMode === "chat"}
                aria-controls="view-panel"
                className={viewMode === "chat" ? "active" : ""}
                role="tab"
                tabIndex={viewMode === "chat" ? 0 : -1}
                type="button"
                onClick={() => setViewMode("chat")}
              >
                Chat
              </button>
              <button
                id="tab-plain"
                aria-selected={viewMode === "plain"}
                aria-controls="view-panel"
                className={viewMode === "plain" ? "active" : ""}
                role="tab"
                tabIndex={viewMode === "plain" ? 0 : -1}
                type="button"
                onClick={() => setViewMode("plain")}
              >
                Plaintext
              </button>
              <button
                id="tab-tokens"
                aria-selected={viewMode === "tokens"}
                aria-controls="view-panel"
                className={viewMode === "tokens" ? "active" : ""}
                role="tab"
                tabIndex={viewMode === "tokens" ? 0 : -1}
                type="button"
                onClick={() => setViewMode("tokens")}
              >
                Tokens
              </button>
              <button
                id="tab-ids"
                aria-selected={viewMode === "ids"}
                aria-controls="view-panel"
                className={viewMode === "ids" ? "active" : ""}
                role="tab"
                tabIndex={viewMode === "ids" ? 0 : -1}
                type="button"
                onClick={() => setViewMode("ids")}
              >
                Positions
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
                  <option value="auto">{modelOptionLabel("auto", selectedModel)}</option>
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
              {selectedModelId === "auto" && (
                <label className="auto-route" htmlFor="auto-model-route">
                  Assume Auto routes to
                  <select
                    id="auto-model-route"
                    aria-label="Assumed Auto model route"
                    value={autoRoutedModelId}
                    onChange={(event) => setAutoRoutedModelId(event.target.value)}
                  >
                    {COPILOT_MODELS
                      .filter((model) => AUTO_ELIGIBLE_MODEL_IDS.includes(model.id))
                      .map((model) => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                  </select>
                </label>
              )}
              <dl className="model-pricing" aria-label="Model pricing metadata">
                <div>
                  <dt>input</dt>
                  <dd>{formatCurrency(selectedPricingTier.pricing.inputPerMillionTokensUsd)}/1M</dd>
                </div>
                <div>
                  <dt>cached</dt>
                  <dd>{formatCurrency(selectedPricingTier.pricing.cachedInputPerMillionTokensUsd)}/1M</dd>
                </div>
                {selectedPricingTier.pricing.cacheWritePerMillionTokensUsd !== undefined && (
                  <div>
                    <dt>cache write</dt>
                    <dd>{formatCurrency(selectedPricingTier.pricing.cacheWritePerMillionTokensUsd)}/1M</dd>
                  </div>
                )}
                <div>
                  <dt>output</dt>
                  <dd>{formatCurrency(selectedPricingTier.pricing.outputPerMillionTokensUsd)}/1M</dd>
                </div>
                <div>
                  <dt>credits</dt>
                  <dd>{formatAiCredits(inputAiCreditRate)}/1M</dd>
                </div>
              </dl>
              <div className="pricing-disclosure">
                <span>Pricing checked {PRICING_VERIFIED_ON}</span>
                {selectedModel.pricingUnverified && <strong>Promotional rate ended; replacement unverified</strong>}
                {selectedModel.promotionEndsOn && <strong>Promotion through {selectedModel.promotionEndsOn}</strong>}
                {selectedModel.notes && <span>{selectedModel.notes}</span>}
                {selectedPricingTier.tier === "long-context" && selectedModel.longContext && (
                  <span>
                    Long-context rates apply above {formatNumber(selectedModel.longContext.thresholdInputTokens)} input tokens.
                  </span>
                )}
                {selectedModelId === "auto" && (
                  <span>
                    Auto has a {formatNumber(AUTO_MODEL_DISCOUNT * 100)}% discount; routing varies per request.
                    {" "}<a href={AUTO_MODEL_SOURCE_URL}>Auto model details</a>
                  </span>
                )}
              </div>
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
            <div id="view-panel" role="tabpanel" aria-labelledby={`tab-${viewMode}`} tabIndex={0}>
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
                  onChange={(event) => setRawPromptOverride(event.target.value)}
                  onScroll={(event) => setPlainScrollTop(event.currentTarget.scrollTop)}
                  placeholder="Paste or type text here..."
                  aria-label="Plaintext editor"
                  spellCheck="true"
                />
              </div>
            ) : tokens.length === 0 ? (
              <div
                className="text-viewport readonly-view empty-view"
                aria-label={viewMode === "tokens" ? "Token text view" : "Illustrative token positions"}
              >
                Add text in Plaintext view to inspect approximate token boundaries.
              </div>
            ) : (
              <div
                className="text-viewport readonly-view token-stream"
                aria-label={viewMode === "tokens" ? "Token text view" : "Illustrative token positions"}
                tabIndex={0}
              >
                {displayedTokens.map((token) => (
                  <span
                    className={`token-segment token-${token.index % 6} token-kind-${token.category}`}
                    key={`${token.index}-${token.start}`}
                    title={`Token ${token.index + 1} · ${token.category} · ${token.bytes} bytes · illustrative position ${token.index + 1}`}
                  >
                    {viewMode === "tokens" ? visibleTokenText(token) : token.index + 1}
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
            {rawPromptOverride !== null && (
              <p className="edit-note">
                  The plaintext editor is a local prompt trace. Editing it updates token and invoice estimates, but does not change the chat transcript or make a live Copilot request.
              </p>
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
                onChange={(event) => setDraftUserMessage(event.target.value)}
                placeholder="Ask Copilot or paste the user request to estimate its prompt impact..."
                aria-label="Chat message input"
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
            <button className="reset-button" type="button" onClick={resetPrompt} aria-label="Reset simulation" title="Reset simulation">
              <RefreshIcon />
              <span>Reset simulation</span>
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
              <span>{invoiceModel.name}</span>
              <strong>{formatNumber(contextPercent)}%</strong>
            </div>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${contextPercent}%` }} />
            </div>
            <p>
              {`${formatNumber(remainingContext)} tokens remaining in a ${formatNumber(displayContextWindow)} token window.`}
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
              key={`${selectedTurnIndex}-${invoiceDirection}-${invoiceRows.map((row) => `${row.id}:${row.inputTokens}:${row.cachedTokens}:${row.cacheWriteTokens}:${row.outputTokens}`).join("|")}`}
              role="region"
              aria-label="Prompt cost breakdown"
              tabIndex={0}
            >
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Input</th>
                    <th scope="col">Cached</th>
                    <th scope="col">Cache write</th>
                    <th scope="col">Output</th>
                    <th scope="col" title={creditFormulaTitle({ pricing: invoicePricing })}>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((row) => (
                    <tr className={row.active ? "" : "inactive"} key={row.id}>
                      <th scope="row">{row.label}</th>
                      <td>{formatNumber(row.inputTokens)}</td>
                      <td>{formatNumber(row.cachedTokens)}</td>
                      <td>{formatNumber(row.cacheWriteTokens)}</td>
                      <td>{formatNumber(row.outputTokens)}</td>
                      <td title={rowCreditCalculationTitle(row, { pricing: invoicePricing })}>{formatAiCredits(row.aiCredits)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{isDraftView ? "Draft estimate" : "Turn total"}</th>
                    <td>{formatNumber(selectedInvoicePage.total.inputTokens)}</td>
                    <td>{formatNumber(selectedInvoicePage.total.cachedTokens)}</td>
                    <td>{formatNumber(selectedInvoicePage.total.cacheWriteTokens)}</td>
                    <td>{formatNumber(selectedInvoicePage.total.outputTokens)}</td>
                    <td title={creditCalculationTitle(selectedInvoicePage.total, invoiceModel)}>
                      {formatAiCredits(selectedInvoicePage.total.aiCredits)}
                    </td>
                  </tr>
                  <tr className="conversation-total">
                    <th scope="row">Conversation total</th>
                    <td>{formatNumber(conversationTotals.inputTokens)}</td>
                    <td>{formatNumber(conversationTotals.cachedTokens)}</td>
                    <td>{formatNumber(conversationTotals.cacheWriteTokens)}</td>
                    <td>{formatNumber(conversationTotals.outputTokens)}</td>
                    <td title="Sum of the per-turn AI credits using each turn's saved model and rate snapshot.">
                      {formatAiCredits(conversationTotals.aiCredits)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="help-text">
            Token splits are a readable approximation, not the tokenizer used by each model. Default context windows are planning estimates. Cache hits assume an identical token prefix in consecutive requests; real cache eligibility, duration, and billing are controlled by GitHub and providers. Prices were checked {PRICING_VERIFIED_ON}; conversation totals retain each turn's selected model and rate snapshot. No message is sent to Copilot.
          </p>
        </aside>
      </section>

      <footer className="references" aria-labelledby="references-title">
        <p className="eyebrow" id="references-title">References</p>
        <ol>
          <li>
            <cite>
              “Models and pricing for GitHub Copilot.” <span>GitHub Docs</span>,
              GitHub,{" "}
              <a href={PRICING_SOURCE_URL}>
                docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
              </a>.
            </cite>
            <p>Published model rates and the AI credit conversion used by the estimate. Checked {PRICING_VERIFIED_ON}.</p>
          </li>
          <li>
            <cite>
              “Supported AI models in GitHub Copilot.” <span>GitHub Docs</span>,{" "}
              <a href={SUPPORTED_MODELS_SOURCE_URL}>
                docs.github.com/en/copilot/reference/ai-models/supported-models
              </a>.
            </cite>
            <p>Model availability, status, and extended context support.</p>
          </li>
          <li>
            <cite>
              “Auto model selection.” <span>GitHub Docs</span>,{" "}
              <a href={AUTO_MODEL_SOURCE_URL}>
                docs.github.com/en/copilot/concepts/models/auto-model-selection
              </a>.
            </cite>
            <p>Auto's eligible models, discount, and variable routing behavior.</p>
          </li>
        </ol>
      </footer>
    </main>
  );
}
