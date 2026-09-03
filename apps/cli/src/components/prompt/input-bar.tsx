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
import { useSession } from "@/providers/session";

export const TEXTAREA_KEY_BINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "enter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "enter", shift: true, action: "newline" },
];

export function InputBar() {
  const textareaRef = useRef<TextareaRenderable>(null);
  const onSubmitRef = useRef<() => void>(() => {});
  const renderer = useRenderer();

  const {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    isCommandInput,
    resolveCommand,
    setSelectedIndex,
  } = useCommandMenu();

  const toast = useToast();
  const { colors } = useTheme();
  const dialog = useDialog();
  const session = useSession();

  const { setResponder, isTopLayer } = useKeyboardLayer();

  /** Tearing down the renderer is the whole quit: index.tsx exits on its DESTROY. */
  const exitApp = useCallback(() => renderer.destroy(), [renderer]);

  const handleCommand = useCallback(
    (command: Command | undefined) => {
      const textarea = textareaRef.current;
      if (!textarea || !command) return;

      textarea.setText("");
      command.action({ exit: exitApp, toast, dialog, session });
    },
    [exitApp, toast, dialog, session],
  );

  const handleCommandExecute = useCallback(
    (index: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      handleCommand(resolveCommand(textarea.plainText.trim(), index));
    },
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

    if (session.busy) {
      toast.show({ variant: "info", message: "Still working on the last turn" });
      return;
    }

    session.send(text);
    textarea.setText("");
  }, [session, toast]);

  // Bound once; the ref below keeps the body current without rebinding every render.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => onSubmitRef.current();
  }, []);

  onSubmitRef.current = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Read straight off the textarea: a command pasted in one burst submits before
    // onContentChange has run, so render state does not yet know a command is being typed.
    // Trimmed, or a trailing space would sink "/model " into the model as a chat message.
    const text = textarea.plainText.trim();

    if (isCommandInput(text)) {
      const command = resolveCommand(text, selectedIndex);

      if (command) {
        handleCommand(command);
      } else {
        toast.show({ variant: "info", message: "No such command" });
      }
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
        <text fg={colors.dimSeparator}>ctrl+c to quit</text>
      </box>
    </box>
  );
}
