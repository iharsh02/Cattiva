import { useCallback, useEffect, useRef } from "react";
import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
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
};

export function InputBar({ disabled = false, onSubmit }: InputBarProps) {
  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<() => void>(() => {});
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

  /** Tearing down the renderer is the whole quit: index.tsx exits on its DESTROY. */
  const exitApp = useCallback(() => renderer.destroy(), [renderer]);

  const handleCommand = useCallback(
    (command: Command | undefined) => {
      const textarea = textareaRef.current;
      if (!textarea || !command) return;

      textarea.setText("");

      if (command.action) {
        command.action({ exit: exitApp, toast, dialog });
      } else {
        textarea.insertText(`${command.value} `);
      }
    },
    [exitApp, toast],
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
    if (disabled) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const text = textarea.plainText.trim();
    if (text.length === 0) return;

    onSubmit?.(text);
    textarea.setText("");
  }, [disabled, onSubmit]);

  // Bound once; the ref below keeps the body current without rebinding every render.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => onSubmitRef.current();
  }, []);

  onSubmitRef.current = () => {
    if (disabled) return;

    // Enter belongs to the menu while it is open, and to the prompt otherwise.
    if (showCommandMenu) {
      handleCommand(resolveCommand(selectedIndex));
      return;
    }

    handleSubmit();
  };

  /**
   * ctrl+c clears a half-typed prompt before it quits the app. Returning true consumes
   * the key so the layer stops searching; returning false lets it fall through to the
   * provider, which destroys the renderer.
   */
  useEffect(() => {
    setResponder(LAYER.base, () => {
      if (disabled) return false;

      const textarea = textareaRef.current;
      if (textarea && textarea.plainText.length > 0) {
        textarea.setText("");
        return true;
      }
      return false;
    });

    return () => setResponder(LAYER.base, null);
  }, [disabled, setResponder]);

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
          focused={!disabled && (isTopLayer(LAYER.base) || isTopLayer(LAYER.command))}
          keyBindings={TEXTAREA_KEY_BINDINGS}
          placeholder="Ask anything"
          placeholderColor={colors.dimSeparator}
          flexGrow={1}
          onContentChange={handleTextareaContentChange}
        />
      </box>
      <box paddingLeft={2}>
        <text fg={colors.dimSeparator}>ctrl+c to quit</text>
      </box>
    </box>
  );
}
