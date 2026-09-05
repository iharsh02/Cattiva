import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_CHAT_MODEL_ID,
  resolveTurnSettings,
  SUPPORTED_CHAT_MODELS,
  type Effort,
  type Reasoning,
  type SupportedChatModel,
} from "@cattiva/shared";
import { Mode } from "@cattiva/database/enums";

const [FIRST_MODEL] = SUPPORTED_CHAT_MODELS;

const DEFAULT_MODEL: SupportedChatModel =
  SUPPORTED_CHAT_MODELS.find((model) => model.id === DEFAULT_CHAT_MODEL_ID) ?? FIRST_MODEL;

type ModelContextValue = {
  mode: Mode;
  model: SupportedChatModel;
  reasoning: Reasoning;
  effort: Effort | null;
  setMode: (mode: Mode) => void;
  setModel: (model: SupportedChatModel) => void;
  toggleMode: () => void;
  setReasoning: (reasoning: Reasoning) => void;
  setEffort: (effort: Effort) => void;
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
  const [settings, setSettings] = useState(() => resolveTurnSettings(DEFAULT_MODEL, {}));
  const [mode, setMode] = useState<Mode>(Mode.BUILD);

  const setModel = useCallback((next: SupportedChatModel) => {
    setModelState(next);
    setSettings((current) => resolveTurnSettings(next, current));
  }, []);

  const setReasoning = useCallback(
    (reasoning: Reasoning) => {
      setSettings((current) => resolveTurnSettings(model, { ...current, reasoning }));
    },
    [model],
  );

  const setEffort = useCallback(
    (effort: Effort) => {
      setSettings((current) => resolveTurnSettings(model, { ...current, effort }));
    },
    [model],
  );

  const toggleMode = useCallback(() => {
    setMode((current) => (current === Mode.BUILD ? Mode.PLAN : Mode.BUILD));
  }, []);

  const value = useMemo(
    () => ({
      model,
      reasoning: settings.reasoning,
      effort: settings.effort,
      mode,
      setMode,
      toggleMode,
      setModel,
      setReasoning,
      setEffort,
    }),
    [mode, model, settings, setModel, setReasoning, setEffort, toggleMode],
  );

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}
