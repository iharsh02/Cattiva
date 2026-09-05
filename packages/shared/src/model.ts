export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type SupportedProvider = "anthropic" | "google" | "nvidia" | "qwen";

export const REASONING = ["on", "off"] as const;

export type Reasoning = (typeof REASONING)[number];

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Effort = (typeof EFFORT_LEVELS)[number];

export const DEFAULT_EFFORT: Effort = "high";

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  maxOutputTokens: number;
  pricing: ModelPricing;
  reasoning: readonly Reasoning[];
  defaultReasoning: Reasoning | null;
  effort: readonly Effort[];
  defaultEffort: Effort | null;
  requiresReasoningForHighEffort?: boolean;
};

export const SUPPORTED_CHAT_MODELS = [
  {
    id: "anthropic/claude-sonnet-4.6",
    provider: "anthropic",
    maxOutputTokens: 128000,
    pricing: {
      inputUsdPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: ["low", "medium", "high", "max"],
    defaultEffort: "high",
    requiresReasoningForHighEffort: false,
  },
  {
    id: "anthropic/claude-opus-4.6",
    provider: "anthropic",
    maxOutputTokens: 128000,
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputPerMillionTokens: 25,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: ["low", "medium", "high", "max"],
    defaultEffort: "high",
    requiresReasoningForHighEffort: false,
  },
  {
    id: "anthropic/claude-opus-5",
    provider: "anthropic",
    maxOutputTokens: 128000,
    pricing: {
      inputUsdPerMillionTokens: 5,
      outputPerMillionTokens: 25,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: EFFORT_LEVELS,
    defaultEffort: "high",
    requiresReasoningForHighEffort: true,
  },
  {
    id: "google/gemini-2.5-flash",
    provider: "google",
    maxOutputTokens: 65535,
    pricing: {
      inputUsdPerMillionTokens: 0.3,
      outputPerMillionTokens: 2.5,
    },
    reasoning: REASONING,
    defaultReasoning: "off",
    effort: [],
    defaultEffort: null,
    requiresReasoningForHighEffort: false,
  },
  {
    id: "google/gemini-3.6-flash",
    provider: "google",
    maxOutputTokens: 65536,
    pricing: {
      inputUsdPerMillionTokens: 0.75,
      outputPerMillionTokens: 3.75,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: ["low", "medium", "high"],
    defaultEffort: "medium",
    requiresReasoningForHighEffort: false,
  },
  {
    id: "qwen/qwen3-coder-flash",
    provider: "qwen",
    maxOutputTokens: 65536,
    pricing: {
      inputUsdPerMillionTokens: 0.195,
      outputPerMillionTokens: 0.975,
    },
    reasoning: [],
    defaultReasoning: null,
    effort: [],
    defaultEffort: null,
    requiresReasoningForHighEffort: false,
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    provider: "nvidia",
    maxOutputTokens: 235929,
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: ["low", "medium"],
    defaultEffort: "medium",
    requiresReasoningForHighEffort: false,
  },
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "google/gemini-3.6-flash";

const EFFORT_ABOVE_HIGH: readonly Effort[] = ["xhigh", "max"];

export type TurnSettings = {
  reasoning: Reasoning | null;
  effort: Effort | null;
};

export function resolveTurnSettings(
  model: SupportedChatModel,
  requested: Partial<TurnSettings>,
): TurnSettings {
  const reasoning = clampReasoning(model, requested.reasoning);

  if (reasoning === null) return { reasoning: null, effort: null };

  const effort = clampEffort(model, requested.effort);

  if (reasoning === "off" && model.requiresReasoningForHighEffort && isAboveHigh(effort)) {
    return { reasoning, effort: "high" };
  }

  return { reasoning, effort };
}

export function clampReasoning(
  model: SupportedChatModel,
  reasoning: Reasoning | null | undefined,
): Reasoning | null {
  const offered: readonly Reasoning[] = model.reasoning;
  if (offered.length === 0) return null;

  if (reasoning && offered.includes(reasoning)) return reasoning;
  return model.defaultReasoning;
}

export function clampEffort(
  model: SupportedChatModel,
  effort: Effort | null | undefined,
): Effort | null {
  const offered: readonly Effort[] = model.effort;
  if (offered.length === 0) return null;

  if (effort && offered.includes(effort)) return effort;
  return model.defaultEffort ?? DEFAULT_EFFORT;
}

export function hasEffortControl(model: SupportedChatModel): boolean {
  return model.effort.length > 0;
}

export function hasReasoningControl(model: SupportedChatModel): boolean {
  return model.reasoning.length > 0;
}

export function allowsReasoningOff(model: SupportedChatModel, effort: Effort | null): boolean {
  return !(model.requiresReasoningForHighEffort && isAboveHigh(effort));
}

function isAboveHigh(effort: Effort | null): boolean {
  return effort !== null && EFFORT_ABOVE_HIGH.includes(effort);
}
