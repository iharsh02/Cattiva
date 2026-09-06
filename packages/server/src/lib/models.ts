import { openrouter } from "@openrouter/ai-sdk-provider";

import {
  findSupportedChatModel,
  replaysReasoning,
  resolveTurnSettings,
  type Effort,
  type Reasoning,
  type SupportedChatModel,
  type SupportedChatModelId,
  type TurnSettings,
} from "@cattiva/shared";
import type { LanguageModel, ModelMessage } from "ai";

type ProviderOptions = NonNullable<Extract<ModelMessage, { role: "system" }>["providerOptions"]>;

const REASONING_BUDGET_TOKENS = 8192;

export type ResolvedModel = {
  model: LanguageModel;
  modelId: SupportedChatModelId;
  reasoning: Reasoning | null;
  effort: Effort | null;
  providerOptions: ProviderOptions;
  maxOutputTokens: number;
  replaysReasoning: boolean;
};

function openrouterOptions({ reasoning, effort }: TurnSettings): ProviderOptions {
  if (reasoning === null) return {};

  if (reasoning === "off") {
    return { openrouter: { reasoning: { effort: "none", exclude: true } } };
  }

  return {
    openrouter: {
      reasoning: effort === null ? { max_tokens: REASONING_BUDGET_TOKENS } : { effort },
    },
  };
}

function resolveSupportedChatModel(
  model: SupportedChatModel,
  settings: TurnSettings,
): ResolvedModel {
  return {
    modelId: model.id,
    reasoning: settings.reasoning,
    effort: settings.effort,
    maxOutputTokens: model.maxOutputTokens,
    model: openrouter(model.id),
    providerOptions: openrouterOptions(settings),
    replaysReasoning: replaysReasoning(model),
  };
}

export function isSupportedChatModelId(modelId: string): modelId is SupportedChatModelId {
  return findSupportedChatModel(modelId) !== undefined;
}

/** An omitted setting defers to the model's own declared default: one default, one source. */
export function resolveChatModel(
  modelId: string,
  requested: Partial<TurnSettings> = {},
): ResolvedModel {
  const model = findSupportedChatModel(modelId);

  if (!model) {
    throw new Error(`Unsupported modelId: ${modelId}`);
  }

  return resolveSupportedChatModel(model, resolveTurnSettings(model, requested));
}
