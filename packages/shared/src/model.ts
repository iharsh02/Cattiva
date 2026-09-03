export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type SupportedProvider = "anthropic" | "google";

export const REASONING_LEVELS = ["off", "low", "medium", "high"] as const;

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export type ThinkingLevel = Exclude<ReasoningLevel, "off">;

export const REASONING_TOKEN_BUDGETS: Record<ThinkingLevel, number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
};

export const REASONING_ANSWER_HEADROOM_TOKENS = 8192;

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  pricing: ModelPricing;
  reasoning: readonly ReasoningLevel[];
  defaultReasoning: ReasoningLevel;
};

export const SUPPORTED_CHAT_MODELS = [
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    },
    reasoning: REASONING_LEVELS,
    defaultReasoning: "low",
  },
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputPerMillionTokens: 25,
    },
    reasoning: REASONING_LEVELS,
    defaultReasoning: "low",
  },
  {
    id: "claude-opus-5",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputPerMillionTokens: 25,
    },
    reasoning: REASONING_LEVELS,
    defaultReasoning: "low",
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    pricing: {
      inputUsdPerMillionTokens: 0.3,
      outputPerMillionTokens: 2.5,
    },
    reasoning: REASONING_LEVELS,
    defaultReasoning: "off",
  },
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "gemini-2.5-flash";

/**
 * Levels are declared per model, so one carried over from another model — or named by an API
 * caller — falls back to what this model itself declares rather than reaching the provider.
 * A model offering no levels falls back to "off", which every provider understands.
 */
export function clampReasoningLevel(
  model: SupportedChatModel,
  level: ReasoningLevel,
): ReasoningLevel {
  if (model.reasoning.includes(level)) return level;
  return model.reasoning.includes(model.defaultReasoning) ? model.defaultReasoning : "off";
}
