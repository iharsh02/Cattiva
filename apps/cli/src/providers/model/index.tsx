import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_CHAT_MODEL_ID,
  EFFORT_LEVELS,
  REASONING,
  resolveTurnSettings,
  SUPPORTED_CHAT_MODELS,
  type Effort,
  type Reasoning,
  type SupportedChatModel,
  type TurnSettings,
} from "@cattiva/shared";
import { Mode } from "@cattiva/database/enums";
import { readPreferences, savePreferences } from "@/lib/preferences";

const [FIRST_MODEL] = SUPPORTED_CHAT_MODELS;

const DEFAULT_MODEL: SupportedChatModel =
  SUPPORTED_CHAT_MODELS.find((model) => model.id === DEFAULT_CHAT_MODEL_ID) ?? FIRST_MODEL;

function initialModel(): SupportedChatModel {
  const { modelId } = readPreferences();
  return SUPPORTED_CHAT_MODELS.find((model) => model.id === modelId) ?? DEFAULT_MODEL;
}

function initialMode(): Mode {
  const { mode } = readPreferences();
  return mode === Mode.PLAN || mode === Mode.BUILD ? mode : Mode.BUILD;
}

/**
 * What is restored is what the user picked, not what it resolved to. Storing the
 * resolution would turn a clamped value into a deliberate choice on the next launch;
 * resolveTurnSettings re-clamps a stale pick against whatever model is loaded.
 */
function initialChoices(): Partial<TurnSettings> {
  const { reasoning, effort } = readPreferences();

  return {
    ...(reasoning != null && REASONING.includes(reasoning) ? { reasoning } : {}),
    ...(effort != null && EFFORT_LEVELS.includes(effort) ? { effort } : {}),
  };
}

type ModelContextValue = {
  mode: Mode;
  model: SupportedChatModel;
  reasoning: Reasoning | null;
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
  const [model, setModelState] = useState<SupportedChatModel>(initialModel);
  const [mode, setModeState] = useState<Mode>(initialMode);

  const [chosen, setChosen] = useState<Partial<TurnSettings>>(initialChoices);

  const settings = useMemo(() => resolveTurnSettings(model, chosen), [model, chosen]);

  const setModel = useCallback((next: SupportedChatModel) => {
    setModelState(next);
    savePreferences({ modelId: next.id });
  }, []);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    savePreferences({ mode: next });
  }, []);

  const setReasoning = useCallback((reasoning: Reasoning) => {
    setChosen((current) => ({ ...current, reasoning }));
    savePreferences({ reasoning });
  }, []);

  const setEffort = useCallback((effort: Effort) => {
    setChosen((current) => ({ ...current, effort }));
    savePreferences({ effort });
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === Mode.BUILD ? Mode.PLAN : Mode.BUILD);
  }, [mode, setMode]);

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
    [mode, model, settings, setMode, setModel, setReasoning, setEffort, toggleMode],
  );

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}
