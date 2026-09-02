import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

import {
  findSupportedChatModel,
  type SupportedChatModel,
  type SupportedChatModelId,
  type SupportedProvider,
} from "@cattiva/shared";
import type { LanguageModel } from "ai";

type AnthropicModelId = Extract<SupportedChatModel, { provider: "anthropic" }>["id"];
type GoogleModelId = Extract<SupportedChatModel, { provider: "google" }>["id"];

export type ResolvedModel = {
  model: LanguageModel;
  provider: SupportedProvider;
  modelId: SupportedChatModelId;
};

function assertUnsupportedProvider(provider: string): never {
  throw new Error(`Unsupported provider: ${provider}`);
}

function resolveAnthropicModel(modelId: AnthropicModelId): ResolvedModel {
  return {
    model: anthropic(modelId),
    provider: "anthropic",
    modelId,
  };
}

function resolveGoogleModel(modelId: GoogleModelId): ResolvedModel {
  return {
    model: google(modelId),
    provider: "google",
    modelId,
  };
}

function resolveSupportedChatModel(model: SupportedChatModel): ResolvedModel {
  const provider = model.provider;
  switch (provider) {
    case "anthropic":
      return resolveAnthropicModel(model.id as AnthropicModelId);
    case "google":
      return resolveGoogleModel(model.id as GoogleModelId);
    default:
      return assertUnsupportedProvider(provider);
  }
}

export function isSupportedChatModelId(modelId: string): modelId is SupportedChatModelId {
  return findSupportedChatModel(modelId) !== undefined;
}

export function resolveChatModel(modelId: string): ResolvedModel {
  const model = findSupportedChatModel(modelId);

  if (!model) {
    throw new Error(`Unsupported modelId: ${modelId}`);
  }

  return resolveSupportedChatModel(model);
}
