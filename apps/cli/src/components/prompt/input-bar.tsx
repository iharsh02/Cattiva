import { useCallback, useEffect, useRef } from "react";
import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { useNavigate } from "react-router";
import { useTheme } from "@/providers/theme";
import { useCommandMenu } from "@/hooks/useCommandMenu";
import { CommandMenu } from "./command-menu";
import type { Command } from "@/types/commandMenu";
import { useToast } from "@/providers/toast";
import { LAYER, useKeyboardLayer } from "@/providers/keyboard-layer";
import { useDialog } from "@/providers/dialog";

export const TEXTAREA_KEY_BINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "enter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "enter", shift: true, action: "newline" },
];

type InputBarProps = {
  disabled?: boolean;
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
};

export function InputBar({ disabled = false, onSubmit, onCancel }: InputBarProps) {
  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<() => void>(() => {});
  const onCancelRef = useRef<(() => void) | undefined>(undefined);
  onCancelRef.current = onCancel;
  const renderer = useRenderer();

  const {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    resolveCommand,
    setSelectedIndex,
  } = useCommandMenu();

  const toast = useToast();
  const { colors } = useTheme();
  const dialog = useDialog();

  const { setResponder, isTopLayer } = useKeyboardLayer();
  const navigate = useNavigate();

  /** Tearing down the renderer is the whole quit: index.tsx exits on its DESTROY. */
  const exitApp = useCallback(() => renderer.destroy(), [renderer]);

  const handleCommand = useCallback(
    (command: Command | undefined) => {
      const textarea = textareaRef.current;
      if (!textarea || !command) return;

      textarea.setText("");

      if (command.action) {
        command.action({ exit: exitApp, toast, dialog, navigate });
      } else {
        textarea.insertText(`${command.value} `);
      }
    },
    [exitApp, toast, dialog, navigate],
  );

  const handleCommandExecute = useCallback(
    (index: number) => handleCommand(resolveCommand(index)),
    [handleCommand, resolveCommand],
  );

  const handleTextareaContentChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    handleContentChange(textarea.plainText);
  }, [handleContentChange]);

  const handleSubmit = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = textarea.plainText.trim();
    if (text.length === 0) return;

    if (disabled) {
      toast.show({ variant: "info", message: "Sending is not wired up yet" });
      return;
    }

    onSubmit?.(text);
    textarea.setText("");
  }, [disabled, onSubmit, toast]);

  // Bound once; the ref below keeps the body current without rebinding every render.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => onSubmitRef.current();
  }, []);

  onSubmitRef.current = () => {
    if (showCommandMenu) {
      handleCommand(resolveCommand(selectedIndex));
      return;
    }

    handleSubmit();
  };

  useEffect(() => {
    setResponder(LAYER.base, () => {
      const textarea = textareaRef.current;
      if (textarea && textarea.plainText.length > 0) {
        textarea.setText("");
        return true;
      }

      const cancel = onCancelRef.current;
      if (cancel) {
        cancel();
        return true;
      }
      return false;
    });

    return () => setResponder(LAYER.base, null);
  }, [setResponder]);

  return (
    <box flexDirection="column">
      {showCommandMenu && (
        <CommandMenu
          query={commandQuery}
          selectedIndex={selectedIndex}
          scrollRef={scrollRef}
          onSelect={setSelectedIndex}
          onExecute={handleCommandExecute}
        />
      )}

      <box
        flexDirection="row"
        gap={1}
        border
        borderStyle="rounded"
        borderColor={colors.dimSeparator}
      >
        <text fg={colors.dimSeparator}>{">"}</text>
        <textarea
          ref={textareaRef}
          focused={isTopLayer(LAYER.base) || isTopLayer(LAYER.command)}
          keyBindings={TEXTAREA_KEY_BINDINGS}
          placeholder="Ask anything"
          placeholderColor={colors.dimSeparator}
          flexGrow={1}
          onContentChange={handleTextareaContentChange}
        />
      </box>
      <box paddingLeft={2}>
        <text fg={colors.dimSeparator}>{onCancel ? "ctrl+c to go back" : "ctrl+c to quit"}</text>
      </box>
    </box>
  );
}
