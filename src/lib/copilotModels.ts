import type { ModelLimit } from "./tokenizer";

export type CopilotModelFamilyId =
  | "openai"
  | "anthropic"
  | "google"
  | "microsoft"
  | "xai"
  | "moonshot";

/** Prices are USD per 1 million tokens. */
export interface TokenPricing {
  inputPerMillionTokensUsd: number;
  cachedInputPerMillionTokensUsd: number;
  /** Omitted when GitHub does not publish a separate cache write price; cache writes then bill as regular input. */
  cacheWritePerMillionTokensUsd?: number;
  outputPerMillionTokensUsd: number;
}

export interface LongContextTier {
  /** The long-context tier applies when a request's total input tokens exceed this threshold. */
  thresholdInputTokens: number;
  pricing: TokenPricing;
}

export interface ScheduledPricingChange {
  /** ISO date (UTC) when the published regular pricing replaces a promotional rate. */
  effectiveFrom: string;
  pricing: TokenPricing;
}

export interface CopilotModel extends ModelLimit {
  id: string;
  familyId: CopilotModelFamilyId;
  provider: string;
  category: "Lightweight" | "Versatile" | "Powerful";
  releaseStatus: "GA" | "Public preview";
  /** Planning estimate for the default context window used in this visualizer. */
  contextWindow: number;
  /** Optional 1M-token context window (VS Code and Copilot CLI only). */
  extendedContextWindow?: number;
  pricing: TokenPricing;
  longContext?: LongContextTier;
  /** ISO date (UTC) on which promotional pricing stops applying. */
  promotionEndsOn?: string;
  scheduledPricing?: ScheduledPricingChange;
  /** Set when a promotion has ended and GitHub has not published the replacement price. */
  pricingUnverified?: boolean;
  /** Set on the virtual Auto option to show which eligible model the estimate assumes. */
  routedModelId?: string;
  notes?: string;
}

export interface CopilotModelFamily {
  id: CopilotModelFamilyId;
  label: string;
}

export const COPILOT_MODEL_FAMILIES: readonly CopilotModelFamily[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
  { id: "microsoft", label: "Microsoft" },
  { id: "xai", label: "xAI" },
  { id: "moonshot", label: "Moonshot AI" },
];

export const AI_CREDIT_USD_VALUE = 0.01;
export const AUTO_MODEL_DISCOUNT = 0.1;
export const EXTENDED_CONTEXT_WINDOW = 1_000_000;
export const PRICING_SOURCE_URL = "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing";
export const SUPPORTED_MODELS_SOURCE_URL = "https://docs.github.com/en/copilot/reference/ai-models/supported-models";
export const AUTO_MODEL_SOURCE_URL = "https://docs.github.com/en/copilot/concepts/models/auto-model-selection";
export const PRICING_VERIFIED_ON = "2026-11-12";

function price(
  inputPerMillionTokensUsd: number,
  cachedInputPerMillionTokensUsd: number,
  cacheWritePerMillionTokensUsd: number | undefined,
  outputPerMillionTokensUsd: number,
): TokenPricing {
  return cacheWritePerMillionTokensUsd === undefined
    ? { inputPerMillionTokensUsd, cachedInputPerMillionTokensUsd, outputPerMillionTokensUsd }
    : { inputPerMillionTokensUsd, cachedInputPerMillionTokensUsd, cacheWritePerMillionTokensUsd, outputPerMillionTokensUsd };
}

// Sources (verified PRICING_VERIFIED_ON):
// - Prices: GitHub Docs, "Models and pricing for GitHub Copilot" (PRICING_SOURCE_URL). 1 AI credit = $0.01 USD.
// - Availability and 1M-context support: GitHub Docs, "Supported AI models in GitHub Copilot" (SUPPORTED_MODELS_SOURCE_URL).
// - GitHub does not publish default context window sizes. Defaults below are planning estimates: the long-context
//   pricing threshold where one exists, otherwise a conservative provider-typical window.
const CATALOG: readonly CopilotModel[] = [
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3-Codex",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(1.75, 0.175, undefined, 14),
    notes: "Long-term support (LTS) fallback model.",
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 nano",
    familyId: "openai",
    provider: "OpenAI",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: price(0.2, 0.02, undefined, 1.25),
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    familyId: "openai",
    provider: "OpenAI",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(0.2, 0.02, 0.25, 1.2),
    longContext: { thresholdInputTokens: 200_000, pricing: price(0.4, 0.04, 0.5, 1.8) },
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    familyId: "openai",
    provider: "OpenAI",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(2, 0.2, 2.5, 12),
    longContext: { thresholdInputTokens: 272_000, pricing: price(4, 0.4, 5, 18) },
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(4, 0.4, 5, 20),
    longContext: { thresholdInputTokens: 272_000, pricing: price(8, 0.8, 10, 30) },
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    familyId: "openai",
    provider: "OpenAI",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(0.1, 0.01, 0.125, 0.5),
    longContext: { thresholdInputTokens: 272_000, pricing: price(0.2, 0.02, 0.25, 0.75) },
  },
  {
    id: "gpt-6-sol",
    name: "GPT-6 Sol",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(2, 0.2, 2.5, 10),
    longContext: { thresholdInputTokens: 272_000, pricing: price(4, 0.4, 5, 15) },
  },
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(10, 1, 12.5, 50),
    longContext: { thresholdInputTokens: 272_000, pricing: price(20, 2, 25, 75) },
  },
  {
    id: "gpt-6.1-terra",
    name: "GPT-6.1 Terra",
    familyId: "openai",
    provider: "OpenAI",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(1, 0.05, 1.25, 5),
    longContext: { thresholdInputTokens: 272_000, pricing: price(2, 0.1, 2.5, 7.5) },
  },
  {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 272_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(2, 0.1, 2.5, 10),
    longContext: { thresholdInputTokens: 272_000, pricing: price(4, 0.2, 5, 15) },
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: price(1, 0.1, 1.25, 5),
  },
  {
    id: "claude-haiku-5.5",
    name: "Claude Haiku 5.5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(0.1, 0.01, 0.125, 0.5),
    longContext: { thresholdInputTokens: 100_000, pricing: price(0.5, 0.05, 0.625, 2.5) },
  },
  {
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(3, 0.3, 3.75, 15),
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(2, 0.2, 2.5, 10),
  },
  {
    id: "claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(2, 0.1, 2.5, 10),
  },
  {
    id: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(5, 0.5, 6.25, 25),
  },
  {
    id: "claude-opus-4.8-fast",
    name: "Claude Opus 4.8 fast mode (preview)",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: price(10, 1, 12.5, 50),
    notes: "Fast mode is in preview and does not support the 1M context window.",
  },
  {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(5, 0.5, 6.25, 25),
  },
  {
    id: "claude-opus-5.5",
    name: "Claude Opus 5.5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(4, 0.2, 5, 20),
  },
  {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(10, 1, 12.5, 50),
    notes: "Requires administrator enablement; see GitHub Docs for data retention terms.",
  },
  {
    id: "claude-fable-5.1",
    name: "Claude Fable 5.1",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(10, 0.25, 12.5, 50),
    notes: "Requires administrator enablement; see GitHub Docs for data retention terms.",
  },
  {
    id: "claude-fable-5.2",
    name: "Claude Fable 5.2",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(8, 0.2, 10, 40),
    notes: "Requires administrator enablement; see GitHub Docs for data retention terms.",
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    familyId: "google",
    provider: "Google",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: price(0.75, 0.075, undefined, 3.75),
    promotionEndsOn: "2027-01-01",
    notes: "Promotional pricing through December 31, 2026.",
  },
  {
    id: "gemini-4-argon",
    name: "Gemini 4 Argon",
    familyId: "google",
    provider: "Google",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: price(2, 0.1, undefined, 10),
    promotionEndsOn: "2026-12-01",
    notes: "Promotional pricing until December 1, 2026.",
  },
  {
    id: "gemini-4-carbon",
    name: "Gemini 4 Carbon",
    familyId: "google",
    provider: "Google",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: price(2, 0.1, undefined, 10),
    promotionEndsOn: "2026-12-01",
    scheduledPricing: { effectiveFrom: "2026-12-01", pricing: price(4, 0.2, undefined, 20) },
    notes: "Promotional pricing until December 1, 2026; then $4 input, $0.20 cached input, and $20 output per 1M tokens.",
  },
  {
    id: "mai-code-1.1-flash",
    name: "MAI-Code-1.1-Flash",
    familyId: "microsoft",
    provider: "Microsoft",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: price(0.2, 0.02, undefined, 1.2),
  },
  {
    id: "grok-4.5",
    name: "Grok 4.5",
    familyId: "xai",
    provider: "xAI",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 256_000,
    pricing: price(2, 0.5, undefined, 6),
    longContext: { thresholdInputTokens: 200_000, pricing: price(4, 1, undefined, 12) },
  },
  {
    id: "grok-4.6",
    name: "Grok 4.6",
    familyId: "xai",
    provider: "xAI",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 256_000,
    pricing: price(2, 0.5, undefined, 6),
    longContext: { thresholdInputTokens: 200_000, pricing: price(4, 1, undefined, 12) },
  },
  {
    id: "grok-4.7",
    name: "Grok 4.7",
    familyId: "xai",
    provider: "xAI",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 256_000,
    pricing: price(2, 0.5, undefined, 6),
    longContext: { thresholdInputTokens: 200_000, pricing: price(4, 1, undefined, 12) },
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    familyId: "moonshot",
    provider: "Moonshot AI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 256_000,
    extendedContextWindow: EXTENDED_CONTEXT_WINDOW,
    pricing: price(3, 0.3, undefined, 15),
  },
];

/** Returns the catalog with any published scheduled price changes applied for the given date. */
export function catalogForDate(date: Date): CopilotModel[] {
  const isoDate = date.toISOString().slice(0, 10);
  return CATALOG.map((model) => {
    if (model.scheduledPricing && isoDate >= model.scheduledPricing.effectiveFrom) {
      return {
        ...model,
        pricing: model.scheduledPricing.pricing,
        promotionEndsOn: undefined,
        scheduledPricing: undefined,
        notes: undefined,
      };
    }

    if (model.promotionEndsOn && isoDate >= model.promotionEndsOn) {
      return {
        ...model,
        pricingUnverified: true,
        notes: `Promotional pricing ended ${model.promotionEndsOn}. GitHub had not published the new rate when this app was updated, so estimates still use the promotional rate. Check GitHub Docs.`,
      };
    }

    return model;
  });
}

export const COPILOT_MODELS: readonly CopilotModel[] = catalogForDate(new Date());

// GitHub Docs' Auto model-selection matrix, "GitHub Copilot app" column:
// https://docs.github.com/en/copilot/reference/ai-models/supported-models
export const AUTO_ELIGIBLE_MODEL_IDS: readonly string[] = [
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-6-astra",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "claude-haiku-4.5",
  "claude-opus-4.8",
  "claude-opus-5",
  "claude-opus-5.5",
  "claude-sonnet-5",
  "claude-sonnet-5.5",
  "gemini-3.8-flash",
  "mai-code-1.1-flash",
];

export const DEFAULT_AUTO_ROUTED_MODEL_ID = "claude-sonnet-5.5";

function discountPricing(pricing: TokenPricing): TokenPricing {
  const factor = 1 - AUTO_MODEL_DISCOUNT;
  return price(
    pricing.inputPerMillionTokensUsd * factor,
    pricing.cachedInputPerMillionTokensUsd * factor,
    pricing.cacheWritePerMillionTokensUsd === undefined ? undefined : pricing.cacheWritePerMillionTokensUsd * factor,
    pricing.outputPerMillionTokensUsd * factor,
  );
}

/**
 * Auto bills at the routed model's rates with a 10% discount. Routing is decided per request by Copilot,
 * so the estimate assumes one eligible model the user can change.
 */
export function createAutoModel(routedModelId = DEFAULT_AUTO_ROUTED_MODEL_ID): CopilotModel {
  if (!AUTO_ELIGIBLE_MODEL_IDS.includes(routedModelId)) {
    throw new Error(`Model is not eligible for Auto: ${routedModelId}`);
  }

  const routed = requireModel(routedModelId);
  return {
    ...routed,
    id: "auto",
    name: "Auto",
    provider: "Copilot",
    routedModelId: routed.id,
    pricing: discountPricing(routed.pricing),
    longContext: routed.longContext
      ? { thresholdInputTokens: routed.longContext.thresholdInputTokens, pricing: discountPricing(routed.longContext.pricing) }
      : undefined,
    scheduledPricing: undefined,
    notes: `Paid plans get a 10% discount on the routed model's rates when using Auto in Copilot Chat or Copilot cloud agent. This estimate assumes Auto routes to ${routed.name}; actual routing varies per request.`,
  };
}

export const COPILOT_AUTO_MODEL: CopilotModel = createAutoModel();

export const COPILOT_MODEL_OPTIONS: readonly CopilotModel[] = [COPILOT_AUTO_MODEL, ...COPILOT_MODELS];

export function modelsForFamily(familyId: CopilotModelFamilyId) {
  return COPILOT_MODELS.filter((model) => model.familyId === familyId);
}

export function modelById(modelId: string) {
  return COPILOT_MODEL_OPTIONS.find((model) => model.id === modelId);
}

export function usdToAiCredits(usd: number) {
  return usd / AI_CREDIT_USD_VALUE;
}

export function aiCreditsToUsd(aiCredits: number) {
  return aiCredits * AI_CREDIT_USD_VALUE;
}

export function perMillionUsdToAiCredits(perMillionUsd: number) {
  return usdToAiCredits(perMillionUsd);
}

export function inputAiCreditsPerMillionTokens(model: CopilotModel) {
  return usdToAiCredits(model.pricing.inputPerMillionTokensUsd);
}

/** Cache writes bill at the published cache write price, or at the regular input price when none is published. */
export function cacheWritePerMillionTokensUsd(pricing: TokenPricing) {
  return pricing.cacheWritePerMillionTokensUsd ?? pricing.inputPerMillionTokensUsd;
}

export type PricingTier = "default" | "long-context";

export function pricingForPromptTokens(model: CopilotModel, promptTokens: number): { tier: PricingTier; pricing: TokenPricing } {
  if (model.longContext && promptTokens > model.longContext.thresholdInputTokens) {
    return { tier: "long-context", pricing: model.longContext.pricing };
  }

  return { tier: "default", pricing: model.pricing };
}

export interface RequestTokenUsage {
  /** Prompt tokens billed at the regular input rate. */
  inputTokens: number;
  /** Prompt tokens read from the prompt cache. */
  cachedInputTokens: number;
  /** Prompt tokens written to the prompt cache. */
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface RequestCost {
  tier: PricingTier;
  pricing: TokenPricing;
  promptTokens: number;
  inputUsd: number;
  cachedInputUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  totalUsd: number;
  totalAiCredits: number;
}

export function estimateRequestCost(model: CopilotModel, usage: RequestTokenUsage): RequestCost {
  const promptTokens = usage.inputTokens + usage.cachedInputTokens + usage.cacheWriteTokens;
  const { tier, pricing } = pricingForPromptTokens(model, promptTokens);
  const inputUsd = perMillion(usage.inputTokens, pricing.inputPerMillionTokensUsd);
  const cachedInputUsd = perMillion(usage.cachedInputTokens, pricing.cachedInputPerMillionTokensUsd);
  const cacheWriteUsd = perMillion(usage.cacheWriteTokens, cacheWritePerMillionTokensUsd(pricing));
  const outputUsd = perMillion(usage.outputTokens, pricing.outputPerMillionTokensUsd);
  const totalUsd = inputUsd + cachedInputUsd + cacheWriteUsd + outputUsd;

  return {
    tier,
    pricing,
    promptTokens,
    inputUsd,
    cachedInputUsd,
    cacheWriteUsd,
    outputUsd,
    totalUsd,
    totalAiCredits: usdToAiCredits(totalUsd),
  };
}

export function estimateInputUsd(tokenCount: number, model: CopilotModel) {
  return perMillion(tokenCount, pricingForPromptTokens(model, tokenCount).pricing.inputPerMillionTokensUsd);
}

export function estimateInputAiCredits(tokenCount: number, model: CopilotModel) {
  return usdToAiCredits(estimateInputUsd(tokenCount, model));
}

export function estimateOutputUsd(tokenCount: number, model: CopilotModel, promptTokens = 0) {
  return perMillion(tokenCount, pricingForPromptTokens(model, promptTokens).pricing.outputPerMillionTokensUsd);
}

export function estimateOutputAiCredits(tokenCount: number, model: CopilotModel, promptTokens = 0) {
  return usdToAiCredits(estimateOutputUsd(tokenCount, model, promptTokens));
}

function perMillion(tokenCount: number, perMillionUsd: number) {
  return (tokenCount / 1_000_000) * perMillionUsd;
}

function requireModel(modelId: string) {
  const model = COPILOT_MODELS.find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Unknown Copilot model: ${modelId}`);
  }

  return model;
}
