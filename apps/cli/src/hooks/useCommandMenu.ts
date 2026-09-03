import { useCallback, useRef, useState, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Command } from "@/types/commandMenu";
import { commandPrefix } from "@/utils/command-input";
import { filterCommands } from "@/utils/filter-commands";
import { LAYER, useKeyboardLayer } from "@/providers/keyboard-layer";

type UseCommandMenuReturn = {
  showCommandMenu: boolean;
  commandQuery: string;
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  handleContentChange: (text: string) => void;
  isCommandInput: (text: string) => boolean;
  resolveCommand: (text: string, index: number) => Command | undefined;
  setSelectedIndex: (index: number) => void;
};

export function useCommandMenu(): UseCommandMenuReturn {
  const [textValue, setTextValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { push, pop, isTopLayer } = useKeyboardLayer();

  const commandQuery = showCommandMenu ? (commandPrefix(textValue) ?? "") : "";

  const closeCommandMenu = useCallback(() => {
    setShowCommandMenu(false);
    pop(LAYER.command);
  }, [pop]);

  const openCommandMenu = useCallback(() => {
    setShowCommandMenu(true);
    push(LAYER.command, () => {
      closeCommandMenu();
      return true;
    });
  }, [push, closeCommandMenu]);

  const handleContentChange = useCallback(
    (text: string) => {
      setTextValue(text);
      setSelectedIndex(0);
      scrollRef.current?.scrollTo(0);

      if (commandPrefix(text) !== null) {
        openCommandMenu();
      } else {
        closeCommandMenu();
      }
    },
    [openCommandMenu, closeCommandMenu],
  );

  const isCommandInput = useCallback((text: string) => commandPrefix(text) !== null, []);

  const resolveCommand = useCallback(
    (text: string, index: number): Command | undefined => {
      const prefix = commandPrefix(text);
      if (prefix === null) return undefined;

      // The visible menu was rendered from `textValue`. If the live text has moved past it,
      // the highlighted row belongs to a different list, so the only row that means anything
      // is the first match for what was actually typed.
      const row = text === textValue ? index : 0;

      const command = filterCommands(prefix)[row];
      if (command) closeCommandMenu();
      return command;
    },
    [closeCommandMenu, textValue],
  );

  /** Rows are one line tall, so scrollTop counts rows. */
  const scrollIntoView = useCallback((index: number) => {
    const scrollbox = scrollRef.current;
    if (!scrollbox) return;
    const viewportHeight = scrollbox.viewport.height;
    if (index < scrollbox.scrollTop) {
      scrollbox.scrollTo(index);
    } else if (index > scrollbox.scrollTop + viewportHeight - 1) {
      scrollbox.scrollTo(index - viewportHeight + 1);
    }
  }, []);

  useKeyboard((key) => {
    if (!showCommandMenu || !isTopLayer(LAYER.command)) return;

    const count = filterCommands(commandQuery).length;

    if (key.name === "escape") {
      key.preventDefault();
      closeCommandMenu();
    } else if (key.name === "up") {
      key.preventDefault();
      const next = Math.max(0, selectedIndex - 1);
      setSelectedIndex(next);
      scrollIntoView(next);
    } else if (key.name === "down") {
      key.preventDefault();
      const next = Math.min(count - 1, selectedIndex + 1);
      setSelectedIndex(next);
      scrollIntoView(next);
    }
  });

  return {
    showCommandMenu,
    commandQuery,
    selectedIndex,
    scrollRef,
    handleContentChange,
    isCommandInput,
    resolveCommand,
    setSelectedIndex,
  };
}
