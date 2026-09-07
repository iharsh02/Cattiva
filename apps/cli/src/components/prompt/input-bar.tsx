import { useCallback, useEffect, useRef } from "react";
import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { useRenderer, useKeyboard } from "@opentui/react";
import { useTheme } from "@/providers/theme";
import { useCommandMenu } from "@/hooks/useCommandMenu";
import { CommandMenu } from "./command-menu";
import type { Command } from "@/types/commandMenu";
import { useToast } from "@/providers/toast";
import { LAYER, useKeyboardLayer } from "@/providers/keyboard-layer";
import { useDialog } from "@/providers/dialog";
import { Spinner } from "@/components/spinner";
import { effortDots } from "@/components/dialogs/effort-picker";
import { useSession } from "@/providers/session";
import { useModel } from "@/providers/model";

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
  const { mode, reasoning, effort, toggleMode, setMode, setModel } = useModel();
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

  const exitApp = useCallback(() => renderer.destroy(), [renderer]);

  const handleCommand = useCallback(
    (command: Command | undefined) => {
      const textarea = textareaRef.current;
      if (!textarea || !command) return;

      textarea.setText("");
      command.action({
        exit: exitApp,
        toast,
        dialog,
        session,
        mode,
        setMode,
        setModel,
      });
    },
    [exitApp, toast, dialog, session, mode, setMode, setModel],
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
      toast.show({
        variant: "info",
        message: "Still working on the last turn — esc to interrupt",
      });
      return;
    }

    session.send(text);
    textarea.setText("");
  }, [session, toast]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.onSubmit = () => onSubmitRef.current();
  }, []);

  onSubmitRef.current = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

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

  useKeyboard((key) => {
    if (!isTopLayer(LAYER.base)) return;

    if (session.busy) {
      if (key.name === "escape") {
        key.preventDefault();
        session.stop();
      }
      return;
    }

    if (key.name === "tab") {
      key.preventDefault();
      toggleMode();
    }
  });

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
        justifyContent="space-between"
        alignItems="center"
        gap={1}
        paddingX={1}
        width="100%"
      >
        <box flexDirection="row" gap={1}>
          <text fg={mode === "BUILD" ? colors.primary : colors.planMode}>{mode}</text>
          <text fg={colors.dimSeparator}>·</text>
          {reasoning === null ? null : (
            <>
              <text fg={reasoning === "off" ? colors.dimSeparator : colors.thinking}>
                {reasoning === "on" ? "◉ thinking" : "○ no thinking"}
              </text>
              <text fg={colors.dimSeparator}>·</text>
            </>
          )}
          {effort === null ? null : (
            <text fg={colors.primary}>{`${effortDots(effort)} ${effort}`}</text>
          )}
        </box>

        <box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
          {session.busy ? (
            <>
              <text fg={colors.dimSeparator}>esc to interrupt</text>
              <Spinner />
            </>
          ) : (
            <text fg={colors.dimSeparator}>/ for commands</text>
          )}
        </box>
      </box>
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
      <box flexDirection="row" gap={1} paddingLeft={2}>
        <text fg={colors.dimSeparator}>tab to switch mode</text>
        <text fg={colors.dimSeparator}>·</text>
        <text fg={colors.dimSeparator}>ctrl+c to quit</text>
      </box>
    </box>
  );
}
