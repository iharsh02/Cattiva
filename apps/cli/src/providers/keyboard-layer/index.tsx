import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";

export const LAYER = {
  base: "base",
  command: "command",
} as const;

export type LayerId = (typeof LAYER)[keyof typeof LAYER];

type Responder = () => boolean;

type KeyboardLayerContextValue = {
  push: (id: LayerId, responder?: Responder) => void;
  pop: (id: LayerId) => void;
  isTopLayer: (id: LayerId) => boolean;
  setResponder: (id: LayerId, responder: Responder | null) => void;
};

const KeyboardLayerContext = createContext<KeyboardLayerContextValue | null>(null);

export function useKeyboardLayer(): KeyboardLayerContextValue {
  const value = useContext(KeyboardLayerContext);
  if (!value) {
    throw new Error("useKeyboardLayer must be used within a KeyboardLayerProvider");
  }
  return value;
}

export function KeyboardLayerProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<LayerId[]>([LAYER.base]);

  const stackRef = useRef(stack);
  stackRef.current = stack;

  const responders = useRef<Map<LayerId, Responder>>(new Map());
  const renderer = useRenderer();

  const push = useCallback((id: LayerId, responder?: Responder) => {
    if (responder) {
      responders.current.set(id, responder);
    }
    setStack((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const pop = useCallback((id: LayerId) => {
    responders.current.delete(id);
    setStack((prev) => prev.filter((layer) => layer !== id));
  }, []);

  const isTopLayer = useCallback(
    (id: LayerId) => stack.length === 0 || stack[stack.length - 1] === id,
    [stack],
  );

  const setResponder = useCallback((id: LayerId, responder: Responder | null) => {
    if (responder) {
      responders.current.set(id, responder);
    } else {
      responders.current.delete(id);
    }
  }, []);

  useKeyboard((key) => {
    if (!key.ctrl || key.name !== "c") return;

    const currentStack = stackRef.current;
    for (let i = currentStack.length - 1; i >= 0; i--) {
      const layerId = currentStack[i]!;
      const responder = responders.current.get(layerId);

      if (responder?.()) {
        key.preventDefault();
        return;
      }
    }

    renderer.destroy();
  });

  return (
    <KeyboardLayerContext.Provider value={{ push, pop, isTopLayer, setResponder }}>
      {children}
    </KeyboardLayerContext.Provider>
  );
}
