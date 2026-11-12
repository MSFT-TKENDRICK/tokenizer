import {
  AI_CREDIT_USD_VALUE,
  estimateRequestCost,
  type CopilotModel,
  type RequestCost,
} from "./copilotModels";
import { estimateContextPercentage, tokenize } from "./tokenizer";
import type { PromptSection } from "./examples";

export interface InvoiceRow {
  id: string;
  label: string;
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  aiCredits: number;
}

export interface TurnInvoice {
  requestText: string;
  rows: InvoiceRow[];
  total: RequestCost & {
    inputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    contextTokens: number;
    contextPercentage: number;
  };
}

export function estimateTurnInvoice(
  model: CopilotModel,
  sections: readonly PromptSection[],
  previousRequestText: string,
  assistantResponse: string,
): TurnInvoice {
  const requestText = sections.map((section) => section.content).join("\n\n");
  const requestTokens = tokenize(requestText).map((token) => token.text);
  const previousTokens = tokenize(previousRequestText).map((token) => token.text);
  const cachedTokens = sharedPrefixLength(previousTokens, requestTokens);
  const freshTokens = requestTokens.length - cachedTokens;
  const hasCacheWritePrice = model.pricing.cacheWritePerMillionTokensUsd !== undefined;
  const inputTokens = hasCacheWritePrice ? 0 : freshTokens;
  const cacheWriteTokens = hasCacheWritePrice ? freshTokens : 0;
  const outputTokens = tokenize(assistantResponse).length;
  const usage = { inputTokens, cachedInputTokens: cachedTokens, cacheWriteTokens, outputTokens };
  const cost = estimateRequestCost(model, usage);
  const rows = allocateRows(model, sections, cachedTokens, outputTokens, assistantResponse, cost);
  const contextTokens = requestTokens.length + outputTokens;

  return {
    requestText,
    rows,
    total: {
      ...cost,
      inputTokens,
      cachedTokens,
      cacheWriteTokens,
      outputTokens,
      contextTokens,
      contextPercentage: estimateContextPercentage(contextTokens, model.contextWindow),
    },
  };
}

function sharedPrefixLength(previous: readonly string[], current: readonly string[]) {
  let index = 0;
  while (index < previous.length && index < current.length && previous[index] === current[index]) {
    index += 1;
  }
  return index;
}

function allocateRows(
  model: CopilotModel,
  sections: readonly PromptSection[],
  cachedPrefixLength: number,
  outputTokens: number,
  assistantResponse: string,
  cost: RequestCost,
): InvoiceRow[] {
  let tokenOffset = 0;
  const rows = sections.map((section, index) => {
    const sectionText = index === 0 ? section.content : `\n\n${section.content}`;
    const sectionTokens = tokenize(sectionText).length;
    const cachedTokens = Math.max(0, Math.min(sectionTokens, cachedPrefixLength - tokenOffset));
    const freshTokens = sectionTokens - cachedTokens;
    tokenOffset += sectionTokens;

    return {
      id: section.id,
      label: section.label,
      inputTokens: model.pricing.cacheWritePerMillionTokensUsd === undefined ? freshTokens : 0,
      cachedTokens,
      cacheWriteTokens: model.pricing.cacheWritePerMillionTokensUsd === undefined ? 0 : freshTokens,
      outputTokens: 0,
      aiCredits: model.pricing.cacheWritePerMillionTokensUsd === undefined
        ? creditsFor(freshTokens, cachedTokens, 0, 0, cost)
        : creditsFor(0, cachedTokens, freshTokens, 0, cost),
    };
  });

  rows.push({
    id: "assistant",
    label: "Assistant response",
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens,
    aiCredits: creditsFor(0, 0, 0, outputTokens, cost),
  });
  return rows;
}

function creditsFor(inputTokens: number, cachedTokens: number, cacheWriteTokens: number, outputTokens: number, cost: RequestCost) {
  const pricing = cost.pricing;
  const inputUsd = (inputTokens / 1_000_000) * pricing.inputPerMillionTokensUsd;
  const cachedUsd = (cachedTokens / 1_000_000) * pricing.cachedInputPerMillionTokensUsd;
  const writeUsd = (cacheWriteTokens / 1_000_000) * (pricing.cacheWritePerMillionTokensUsd ?? pricing.inputPerMillionTokensUsd);
  const outputUsd = (outputTokens / 1_000_000) * pricing.outputPerMillionTokensUsd;
  return (inputUsd + cachedUsd + writeUsd + outputUsd) / AI_CREDIT_USD_VALUE;
}
