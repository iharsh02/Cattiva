import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

import {
  findSupportedChatModel,
  MAX_OUTPUT_TOKENS,
  resolveTurnSettings,
  type Effort,
  type Reasoning,
  type SupportedChatModel,
  type SupportedChatModelId,
  type SupportedProvider,
  type TurnSettings,
} from "@cattiva/shared";
import type { LanguageModel, ModelMessage } from "ai";

type ProviderOptions = NonNullable<Extract<ModelMessage, { role: "system" }>["providerOptions"]>;

type AnthropicModelId = Extract<SupportedChatModel, { provider: "anthropic" }>["id"];
type GoogleModelId = Extract<SupportedChatModel, { provider: "google" }>["id"];

const GOOGLE_THINKING_BUDGET = 8192;

export type ResolvedModel = {
  model: LanguageModel;
  provider: SupportedProvider;
  modelId: SupportedChatModelId;
  reasoning: Reasoning;
  effort: Effort | null;
  providerOptions: ProviderOptions;
  maxOutputTokens: number;
};

function assertUnsupportedProvider(provider: string): never {
  throw new Error(`Unsupported provider: ${provider}`);
}

function anthropicOptions({ reasoning, effort }: TurnSettings): ProviderOptions {
  return {
    anthropic: {
      thinking:
        reasoning === "on" ? { type: "adaptive", display: "summarized" } : { type: "disabled" },
      ...(effort === null ? {} : { effort }),
    },
  };
}

function googleOptions({ reasoning }: TurnSettings): ProviderOptions {
  if (reasoning === "off") {
    return { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } };
  }

  return {
    google: {
      thinkingConfig: { thinkingBudget: GOOGLE_THINKING_BUDGET, includeThoughts: true },
    },
  };
}

function resolveSupportedChatModel(
  model: SupportedChatModel,
  settings: TurnSettings,
): ResolvedModel {
  const provider = model.provider;
  const common = {
    provider,
    modelId: model.id,
    reasoning: settings.reasoning,
    effort: settings.effort,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  } as const;

  switch (provider) {
    case "anthropic":
      return {
        ...common,
        provider,
        model: anthropic(model.id as AnthropicModelId),
        providerOptions: anthropicOptions(settings),
      };
    case "google":
      return {
        ...common,
        provider,
        model: google(model.id as GoogleModelId),
        providerOptions: googleOptions(settings),
      };
    default:
      return assertUnsupportedProvider(provider);
  }
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
