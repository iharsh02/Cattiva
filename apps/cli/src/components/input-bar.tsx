import { useCallback, useEffect, useRef } from "react";
import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { DIM } from "../theme";
import { useCommandMenu } from "../hooks/useCommandMenu";
import { CommandMenu } from "./command-menu";
import type { Command } from "../types/commandMenu";

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

  /**
   * destroy() restores the terminal but only emits DESTROY when it is called outside a
   * render pass; from a React commit it takes opentui's deferred branch, which suspends
   * the renderer and never finalises. So the exit cannot be left to that event here.
   */
  const exitApp = useCallback(() => {
    renderer.destroy();
    setImmediate(() => process.exit(0));
  }, [renderer]);

  const handleCommand = useCallback(
    (command: Command | undefined) => {
      const textarea = textareaRef.current;
      if (!textarea || !command) return;

      textarea.setText("");

      if (command.action) {
        command.action({ exit: exitApp });
      } else {
        textarea.insertText(`${command.value} `);
      }
    },
    [exitApp],
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

      <box flexDirection="row" gap={1} border borderStyle="rounded" borderColor={DIM}>
        <text fg={DIM}>{">"}</text>
        <textarea
          ref={textareaRef}
          focused={!disabled}
          keyBindings={TEXTAREA_KEY_BINDINGS}
          placeholder="Ask anything"
          flexGrow={1}
          onContentChange={handleTextareaContentChange}
        />
      </box>
      <box paddingLeft={2}>
        <text fg={DIM}>ctrl+c to quit</text>
      </box>
    </box>
  );
}
