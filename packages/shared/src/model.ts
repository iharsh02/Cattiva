export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type SupportedProvider = "anthropic" | "google";

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  pricing: ModelPricing;
};

export const SUPPORTED_CHAT_MODELS = [
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    },
  },
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputPerMillionTokens: 25,
    },
  },
  {
    id: "claude-opus-5",
    provider: "anthropic",
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputPerMillionTokens: 25,
    },
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    pricing: {
      inputUsdPerMillionTokens: 0.3,
      outputPerMillionTokens: 2.5,
    },
  },
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "gemini-2.5-flash";
