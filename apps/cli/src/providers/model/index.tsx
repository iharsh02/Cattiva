import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  clampReasoningLevel,
  DEFAULT_CHAT_MODEL_ID,
  SUPPORTED_CHAT_MODELS,
  type ReasoningLevel,
  type SupportedChatModel,
} from "@cattiva/shared";
import { Mode } from "@cattiva/database/enums";

const [FIRST_MODEL] = SUPPORTED_CHAT_MODELS;

const DEFAULT_MODEL: SupportedChatModel =
  SUPPORTED_CHAT_MODELS.find((model) => model.id === DEFAULT_CHAT_MODEL_ID) ?? FIRST_MODEL;

type ModelContextValue = {
  mode: Mode;
  model: SupportedChatModel;
  reasoning: ReasoningLevel;
  setMode: (mode: Mode) => void;
  setModel: (model: SupportedChatModel) => void;
  toggleMode: () => void;
  setReasoning: (reasoning: ReasoningLevel) => void;
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
  const [model, setModelState] = useState<SupportedChatModel>(DEFAULT_MODEL);
  const [reasoning, setReasoningState] = useState<ReasoningLevel>(DEFAULT_MODEL.defaultReasoning);
  const [mode, setMode] = useState<Mode>(Mode.BUILD);

  const setModel = useCallback((next: SupportedChatModel) => {
    setModelState(next);
    setReasoningState((current) => clampReasoningLevel(next, current));
  }, []);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
  }, []);

  const setReasoning = setReasoningState;

  const value = useMemo(
    () => ({ model, reasoning, mode, setMode, toggleMode, setModel, setReasoning }),
    [mode, model, reasoning, setModel, setReasoning, toggleMode],
  );

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}
