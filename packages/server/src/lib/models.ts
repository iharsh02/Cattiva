import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

import {
  clampReasoningLevel,
  findSupportedChatModel,
  REASONING_ANSWER_HEADROOM_TOKENS,
  REASONING_TOKEN_BUDGETS,
  type ReasoningLevel,
  type SupportedChatModel,
  type SupportedChatModelId,
  type SupportedProvider,
  type ThinkingLevel,
} from "@cattiva/shared";
import type { LanguageModel, ModelMessage } from "ai";

type ProviderOptions = NonNullable<Extract<ModelMessage, { role: "system" }>["providerOptions"]>;

type AnthropicModelId = Extract<SupportedChatModel, { provider: "anthropic" }>["id"];
type GoogleModelId = Extract<SupportedChatModel, { provider: "google" }>["id"];

export type ResolvedModel = {
  model: LanguageModel;
  provider: SupportedProvider;
  modelId: SupportedChatModelId;
  providerOptions: ProviderOptions;
  maxOutputTokens: number | undefined;
};

function assertUnsupportedProvider(provider: string): never {
  throw new Error(`Unsupported provider: ${provider}`);
}

function thinkingBudget(level: ThinkingLevel): number {
  return REASONING_TOKEN_BUDGETS[level];
}

function anthropicThinking(reasoning: ReasoningLevel): ProviderOptions {
  if (reasoning === "off") {
    return { anthropic: { thinking: { type: "disabled" } } };
  }

  return {
    anthropic: { thinking: { type: "enabled", budgetTokens: thinkingBudget(reasoning) } },
  };
}

function googleThinking(reasoning: ReasoningLevel): ProviderOptions {
  const budget = reasoning === "off" ? 0 : thinkingBudget(reasoning);

  return { google: { thinkingConfig: { thinkingBudget: budget } } };
}

function resolveSupportedChatModel(
  model: SupportedChatModel,
  reasoning: ReasoningLevel,
): ResolvedModel {
  const provider = model.provider;

  const maxOutputTokens =
    reasoning === "off" ? undefined : thinkingBudget(reasoning) + REASONING_ANSWER_HEADROOM_TOKENS;

  switch (provider) {
    case "anthropic":
      return {
        model: anthropic(model.id as AnthropicModelId),
        provider,
        modelId: model.id,
        providerOptions: anthropicThinking(reasoning),
        maxOutputTokens,
      };
    case "google":
      return {
        model: google(model.id as GoogleModelId),
        provider,
        modelId: model.id,
        providerOptions: googleThinking(reasoning),
        maxOutputTokens,
      };
    default:
      return assertUnsupportedProvider(provider);
  }
}

export function isSupportedChatModelId(modelId: string): modelId is SupportedChatModelId {
  return findSupportedChatModel(modelId) !== undefined;
}

/** An omitted level defers to the model's own declared default: one default, one source. */
export function resolveChatModel(modelId: string, reasoning?: ReasoningLevel): ResolvedModel {
  const model = findSupportedChatModel(modelId);

  if (!model) {
    throw new Error(`Unsupported modelId: ${modelId}`);
  }

  return resolveSupportedChatModel(
    model,
    clampReasoningLevel(model, reasoning ?? model.defaultReasoning),
  );
}
