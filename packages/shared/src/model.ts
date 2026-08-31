export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type supportedProvider = "anthropic";

type SupportedChatModelDefinition = {
  id: string;
  provider: supportedProvider;
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
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "claude-opus-5";
