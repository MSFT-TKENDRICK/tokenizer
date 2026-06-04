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
export const AUTO_MODEL_DISCOUNT = 0.1;

// Internal pricing documentation:
// - Current usage-based prices are from GitHub Docs, "Models and pricing for GitHub Copilot":
//   https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
// - GitHub Docs define 1 AI credit = $0.01 USD; prices below are per 1 million tokens.
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
  },
];

const AUTO_MODEL_BASE = requireModel("gpt-5.5");

export const COPILOT_AUTO_MODEL: CopilotModel = {
  ...AUTO_MODEL_BASE,
  id: "auto",
  name: "Auto",
  provider: "Copilot",
  pricing: {
    inputPerMillionTokensUsd: AUTO_MODEL_BASE.pricing.inputPerMillionTokensUsd * (1 - AUTO_MODEL_DISCOUNT),
    cachedInputPerMillionTokensUsd: AUTO_MODEL_BASE.pricing.cachedInputPerMillionTokensUsd * (1 - AUTO_MODEL_DISCOUNT),
    outputPerMillionTokensUsd: AUTO_MODEL_BASE.pricing.outputPerMillionTokensUsd * (1 - AUTO_MODEL_DISCOUNT),
  },
  notes: "Auto model selection applies the documented 10% discount; estimates use discounted GPT-5.5 rates as an upper-bound planning proxy because actual routing can vary.",
};

export const COPILOT_MODEL_OPTIONS: readonly CopilotModel[] = [
  COPILOT_AUTO_MODEL,
  ...COPILOT_MODELS,
];

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

export function inputAiCreditsPerMillionTokens(model: CopilotModel) {
  return usdToAiCredits(model.pricing.inputPerMillionTokensUsd);
}

export function estimateInputUsd(tokenCount: number, model: CopilotModel) {
  return (tokenCount / 1_000_000) * model.pricing.inputPerMillionTokensUsd;
}

export function estimateInputAiCredits(tokenCount: number, model: CopilotModel) {
  return usdToAiCredits(estimateInputUsd(tokenCount, model));
}

function requireModel(modelId: string) {
  const model = COPILOT_MODELS.find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Unknown Copilot model: ${modelId}`);
  }

  return model;
}
