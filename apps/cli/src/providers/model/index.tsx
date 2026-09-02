import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_CHAT_MODEL_ID,
  SUPPORTED_CHAT_MODELS,
  type SupportedChatModel,
} from "@cattiva/shared";

const [FIRST_MODEL] = SUPPORTED_CHAT_MODELS;

const DEFAULT_MODEL: SupportedChatModel =
  SUPPORTED_CHAT_MODELS.find((model) => model.id === DEFAULT_CHAT_MODEL_ID) ?? FIRST_MODEL;

type ModelContextValue = {
  model: SupportedChatModel;
  setModel: (model: SupportedChatModel) => void;
};

const ModelContext = createContext<ModelContextValue | null>(null);

export function useModel(): ModelContextValue {
  const value = useContext(ModelContext);
  if (!value) {
    throw new Error("useModel must be used within a ModelProvider");
  }

  return value;
}

type ModelProviderProps = {
  children: ReactNode;
};

export function ModelProvider({ children }: ModelProviderProps) {
  const [model, setModel] = useState<SupportedChatModel>(DEFAULT_MODEL);

  const value = useMemo(() => ({ model, setModel }), [model]);

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}
