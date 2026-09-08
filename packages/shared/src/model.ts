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
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    provider: "nvidia",
    maxOutputTokens: 65536,
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: ["low", "medium", "high"],
    defaultEffort: "medium",
    requiresReasoningForHighEffort: false,
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    provider: "nvidia",
    maxOutputTokens: 65536,
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: [],
    defaultEffort: null,
    requiresReasoningForHighEffort: false,
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    provider: "nvidia",
    maxOutputTokens: 65536,
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    },
    reasoning: REASONING,
    defaultReasoning: "on",
    effort: [],
    defaultEffort: null,
    requiresReasoningForHighEffort: false,
  },
  {
    id: "google/gemma-4-31b-it:free",
    provider: "google",
    maxOutputTokens: 32768,
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    },
    reasoning: REASONING,
    defaultReasoning: "off",
    effort: [],
    defaultEffort: null,
    requiresReasoningForHighEffort: false,
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    provider: "google",
    maxOutputTokens: 32768,
    pricing: {
      inputUsdPerMillionTokens: 0,
      outputPerMillionTokens: 0,
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

/**
 * Anthropic verifies thinking blocks against the tool calls they produced, so their
 * models need prior reasoning replayed verbatim. Everyone else discards it, and
 * sending it back is pure prompt cost.
 */
const REPLAYS_REASONING = new Set<SupportedProvider>(["anthropic"]);

export function replaysReasoning(model: SupportedChatModel): boolean {
  return REPLAYS_REASONING.has(model.provider);
}

export const DEFAULT_CHAT_MODEL_ID: SupportedChatModelId = "nvidia/nemotron-3-super-120b-a12b:free";

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
