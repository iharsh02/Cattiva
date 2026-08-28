import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RGBA, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { DialogConfig } from "./types";
import { LAYER, useKeyboardLayer } from "@/providers/keyboard-layer";
import { useTheme } from "@/theme";

/** Dims whatever is behind the panel, so the dialog reads as modal rather than floating. */
const SCRIM = RGBA.fromInts(0, 0, 0, 150);

const MAX_WIDTH = 60;

export type DialogContextValue = {
  open: (config: DialogConfig) => void;
  close: () => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const value = useContext(DialogContext);
  if (!value) {
    throw new Error("useDialog must be used within a DialogProvider");
  }

  return value;
}

type DialogProviderProps = {
  children: ReactNode;
};

export function DialogProvider({ children }: DialogProviderProps) {
  const [currentDialog, setCurrentDialog] = useState<DialogConfig | null>(null);

  const { push, pop } = useKeyboardLayer();

  const close = useCallback(() => {
    setCurrentDialog(null);
    pop(LAYER.dialog);
  }, [pop]);

  const open = useCallback(
    (config: DialogConfig) => {
      setCurrentDialog(config);
      // Returning true consumes ctrl+c here, so it dismisses the dialog rather than
      // falling through to the prompt or quitting the app.
      push(LAYER.dialog, () => {
        close();
        return true;
      });
    },
    [push, close],
  );

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Dialog currentDialog={currentDialog} close={close} />
    </DialogContext.Provider>
  );
}

type DialogProps = {
  currentDialog: DialogConfig | null;
  close: () => void;
};

function Dialog({ currentDialog, close }: DialogProps) {
  const { isTopLayer } = useKeyboardLayer();
  const { width, height } = useTerminalDimensions();
  const { colors } = useTheme();

  useKeyboard((key) => {
    if (!currentDialog || !isTopLayer(LAYER.dialog)) return;

    if (key.name === "escape") {
      key.preventDefault();
      close();
    }
  });

  if (!currentDialog) {
    return null;
  }

  const { title, children } = currentDialog;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={width}
      height={height}
      justifyContent="center"
      alignItems="center"
      backgroundColor={SCRIM}
      zIndex={100}
      onMouseDown={close}
    >
      <box
        flexDirection="column"
        gap={1}
        width={Math.max(1, Math.min(MAX_WIDTH, width - 4))}
        paddingX={4}
        paddingY={1}
        backgroundColor={colors.surface}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <box flexDirection="row" justifyContent="space-between">
          <text fg={colors.fg} attributes={TextAttributes.BOLD}>
            {title}
          </text>
          <text fg={colors.dim} onMouseDown={close}>
            esc
          </text>
        </box>
        {children}
      </box>
    </box>
  );
}
