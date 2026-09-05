export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputPerMillionTokens: number;
};

export type SupportedProvider = "anthropic" | "google";

export const REASONING = ["on", "off"] as const;

export type Reasoning = (typeof REASONING)[number];

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Effort = (typeof EFFORT_LEVELS)[number];

export const DEFAULT_EFFORT: Effort = "high";

export const MAX_OUTPUT_TOKENS = 64000;

type SupportedChatModelDefinition = {
  id: string;
  provider: SupportedProvider;
  pricing: ModelPricing;
  reasoning: readonly Reasoning[];
  defaultReasoning: Reasoning;
  effort: readonly Effort[];
  defaultEffort: Effort | null;
  requiresReasoningForHighEffort?: boolean;
};

export const SUPPORTED_CHAT_MODELS = [
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
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
    id: "claude-opus-4-6",
    provider: "anthropic",
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
    id: "claude-opus-5",
    provider: "anthropic",
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
    id: "gemini-2.5-flash",
    provider: "google",
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
] as const satisfies readonly SupportedChatModelDefinition[];

export type SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number];
export type SupportedChatModelId = SupportedChatModel["id"];

export function findSupportedChatModel(modelId: string) {
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "gemini-2.5-flash";

/** The effort levels above `high`, which cost a model its ability to answer without thinking. */
const EFFORT_ABOVE_HIGH: readonly Effort[] = ["xhigh", "max"];

export type TurnSettings = {
  reasoning: Reasoning;
  /** Null on a model whose provider has no effort control — nothing goes on the wire for it. */
  effort: Effort | null;
};

export function resolveTurnSettings(
  model: SupportedChatModel,
  requested: Partial<TurnSettings>,
): TurnSettings {
  const reasoning = clampReasoning(model, requested.reasoning ?? model.defaultReasoning);
  const effort = clampEffort(model, requested.effort);

  if (reasoning === "off" && model.requiresReasoningForHighEffort && isAboveHigh(effort)) {
    return { reasoning, effort: "high" };
  }

  return { reasoning, effort };
}

export function clampReasoning(model: SupportedChatModel, reasoning: Reasoning): Reasoning {
  return model.reasoning.includes(reasoning) ? reasoning : model.defaultReasoning;
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

export function allowsReasoningOff(model: SupportedChatModel, effort: Effort | null): boolean {
  return !(model.requiresReasoningForHighEffort && isAboveHigh(effort));
}

function isAboveHigh(effort: Effort | null): boolean {
  return effort !== null && EFFORT_ABOVE_HIGH.includes(effort);
}
