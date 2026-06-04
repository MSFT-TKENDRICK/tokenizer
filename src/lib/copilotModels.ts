import type { ModelLimit } from "./tokenizer";

export type CopilotModelFamilyId = "openai" | "anthropic" | "google" | "github-microsoft";

export interface CopilotModel extends ModelLimit {
  id: string;
  familyId: CopilotModelFamilyId;
  provider: string;
  category: "Lightweight" | "Versatile" | "Powerful";
  releaseStatus: "GA" | "Public preview";
  pricing: {
    inputPerMillionTokensUsd: number;
    cachedInputPerMillionTokensUsd: number;
    outputPerMillionTokensUsd: number;
    cacheWritePerMillionTokensUsd?: number;
  };
  legacyPremiumRequestMultiplier?: number;
  notes?: string;
}

export interface CopilotModelFamily {
  id: CopilotModelFamilyId;
  label: string;
}

export const COPILOT_MODEL_FAMILIES: readonly CopilotModelFamily[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Claude" },
  { id: "google", label: "Gemini" },
  { id: "github-microsoft", label: "GitHub + Microsoft" },
];

export const AI_CREDIT_USD_VALUE = 0.01;

// Internal pricing documentation:
// - Current usage-based prices are from GitHub Docs, "Models and pricing for GitHub Copilot":
//   https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
// - GitHub Docs define 1 AI credit = $0.01 USD; prices below are per 1 million tokens.
// - Legacy premium request multipliers are from GitHub Docs, "Model multipliers for annual plans on request-based billing (legacy)".
// - Multipliers apply only to legacy annual Copilot Pro/Pro+ request-based billing; current billing uses per-token AI credits.
// - Context windows here are planning estimates for tokenizer visualization, using published pricing tiers where available.
export const COPILOT_MODELS: readonly CopilotModel[] = [
  {
    id: "gpt-5-mini",
    name: "GPT-5 mini",
    familyId: "openai",
    provider: "OpenAI",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 0.25, cachedInputPerMillionTokensUsd: 0.025, outputPerMillionTokensUsd: 2 },
    legacyPremiumRequestMultiplier: 0.33,
    notes: "Included model in Copilot plans.",
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    familyId: "openai",
    provider: "OpenAI",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 1.75, cachedInputPerMillionTokensUsd: 0.175, outputPerMillionTokensUsd: 14 },
    legacyPremiumRequestMultiplier: 3,
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT-5.2-Codex",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 1.75, cachedInputPerMillionTokensUsd: 0.175, outputPerMillionTokensUsd: 14 },
    legacyPremiumRequestMultiplier: 3,
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3-Codex",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 1.75, cachedInputPerMillionTokensUsd: 0.175, outputPerMillionTokensUsd: 14 },
    legacyPremiumRequestMultiplier: 6,
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    familyId: "openai",
    provider: "OpenAI",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 272_000,
    pricing: { inputPerMillionTokensUsd: 2.5, cachedInputPerMillionTokensUsd: 0.25, outputPerMillionTokensUsd: 15 },
    legacyPremiumRequestMultiplier: 6,
    notes: "Published pricing applies to prompts with <=272K tokens.",
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 mini",
    familyId: "openai",
    provider: "OpenAI",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 0.75, cachedInputPerMillionTokensUsd: 0.075, outputPerMillionTokensUsd: 4.5 },
    legacyPremiumRequestMultiplier: 6,
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 nano",
    familyId: "openai",
    provider: "OpenAI",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 0.2, cachedInputPerMillionTokensUsd: 0.02, outputPerMillionTokensUsd: 1.25 },
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    familyId: "openai",
    provider: "OpenAI",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 5, cachedInputPerMillionTokensUsd: 0.5, outputPerMillionTokensUsd: 30 },
    legacyPremiumRequestMultiplier: 57,
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 1,
      cachedInputPerMillionTokensUsd: 0.1,
      cacheWritePerMillionTokensUsd: 1.25,
      outputPerMillionTokensUsd: 5,
    },
    legacyPremiumRequestMultiplier: 0.33,
  },
  {
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 3,
      cachedInputPerMillionTokensUsd: 0.3,
      cacheWritePerMillionTokensUsd: 3.75,
      outputPerMillionTokensUsd: 15,
    },
    legacyPremiumRequestMultiplier: 9,
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 3,
      cachedInputPerMillionTokensUsd: 0.3,
      cacheWritePerMillionTokensUsd: 3.75,
      outputPerMillionTokensUsd: 15,
    },
    legacyPremiumRequestMultiplier: 6,
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Versatile",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 3,
      cachedInputPerMillionTokensUsd: 0.3,
      cacheWritePerMillionTokensUsd: 3.75,
      outputPerMillionTokensUsd: 15,
    },
  },
  {
    id: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 5,
      cachedInputPerMillionTokensUsd: 0.5,
      cacheWritePerMillionTokensUsd: 6.25,
      outputPerMillionTokensUsd: 25,
    },
    legacyPremiumRequestMultiplier: 27,
  },
  {
    id: "claude-opus-4.7",
    name: "Claude Opus 4.7",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 5,
      cachedInputPerMillionTokensUsd: 0.5,
      cacheWritePerMillionTokensUsd: 6.25,
      outputPerMillionTokensUsd: 25,
    },
    legacyPremiumRequestMultiplier: 27,
  },
  {
    id: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 5,
      cachedInputPerMillionTokensUsd: 0.5,
      cacheWritePerMillionTokensUsd: 6.25,
      outputPerMillionTokensUsd: 25,
    },
    legacyPremiumRequestMultiplier: 27,
  },
  {
    id: "claude-opus-4.5",
    name: "Claude Opus 4.5",
    familyId: "anthropic",
    provider: "Anthropic",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: {
      inputPerMillionTokensUsd: 5,
      cachedInputPerMillionTokensUsd: 0.5,
      cacheWritePerMillionTokensUsd: 6.25,
      outputPerMillionTokensUsd: 25,
    },
    legacyPremiumRequestMultiplier: 15,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    familyId: "google",
    provider: "Google",
    category: "Powerful",
    releaseStatus: "GA",
    contextWindow: 200_000,
    pricing: { inputPerMillionTokensUsd: 1.25, cachedInputPerMillionTokensUsd: 0.125, outputPerMillionTokensUsd: 10 },
    legacyPremiumRequestMultiplier: 1,
    notes: "Published pricing applies to prompts with <=200K tokens.",
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    familyId: "google",
    provider: "Google",
    category: "Lightweight",
    releaseStatus: "Public preview",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 0.5, cachedInputPerMillionTokensUsd: 0.05, outputPerMillionTokensUsd: 3 },
    legacyPremiumRequestMultiplier: 0.33,
    notes: "No long-context surcharge.",
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    familyId: "google",
    provider: "Google",
    category: "Powerful",
    releaseStatus: "Public preview",
    contextWindow: 200_000,
    pricing: { inputPerMillionTokensUsd: 2, cachedInputPerMillionTokensUsd: 0.2, outputPerMillionTokensUsd: 12 },
    legacyPremiumRequestMultiplier: 6,
    notes: "Published pricing applies to prompts with <=200K tokens.",
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    familyId: "google",
    provider: "Google",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 1.5, cachedInputPerMillionTokensUsd: 0.15, outputPerMillionTokensUsd: 9 },
    legacyPremiumRequestMultiplier: 14,
  },
  {
    id: "raptor-mini",
    name: "Raptor mini",
    familyId: "github-microsoft",
    provider: "GitHub",
    category: "Versatile",
    releaseStatus: "Public preview",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 0.25, cachedInputPerMillionTokensUsd: 0.025, outputPerMillionTokensUsd: 2 },
    legacyPremiumRequestMultiplier: 0.33,
    notes: "Uses GPT-5 mini pricing.",
  },
  {
    id: "mai-code-1-flash",
    name: "MAI-Code-1-Flash",
    familyId: "github-microsoft",
    provider: "Microsoft",
    category: "Lightweight",
    releaseStatus: "GA",
    contextWindow: 128_000,
    pricing: { inputPerMillionTokensUsd: 0.75, cachedInputPerMillionTokensUsd: 0.075, outputPerMillionTokensUsd: 4.5 },
    legacyPremiumRequestMultiplier: 0.33,
    notes: "Legacy multiplier is documented as promotional.",
  },
];

export function modelsForFamily(familyId: CopilotModelFamilyId) {
  return COPILOT_MODELS.filter((model) => model.familyId === familyId);
}

export function usdToAiCredits(usd: number) {
  return usd / AI_CREDIT_USD_VALUE;
}

export function aiCreditsToUsd(aiCredits: number) {
  return aiCredits * AI_CREDIT_USD_VALUE;
}

export function inputAiCreditsPerMillionTokens(model: CopilotModel) {
  return usdToAiCredits(model.pricing.inputPerMillionTokensUsd);
}

export function estimateInputUsd(tokenCount: number, model: CopilotModel) {
  return (tokenCount / 1_000_000) * model.pricing.inputPerMillionTokensUsd;
}

export function estimateInputAiCredits(tokenCount: number, model: CopilotModel) {
  return usdToAiCredits(estimateInputUsd(tokenCount, model));
}
