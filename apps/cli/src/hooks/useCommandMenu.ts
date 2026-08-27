import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Command } from "@/types/commandMenu";
import { filterCommands } from "@/utils/filter-commands";

type UseCommandMenuReturn = {
  showCommandMenu: boolean;
  commandQuery: string;
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  handleContentChange: (text: string) => void;
  resolveCommand: (index: number) => Command | undefined;
  setSelectedIndex: (index: number) => void;
};

export function useCommandMenu(): UseCommandMenuReturn {
  const [textValue, setTextValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const scrollRef = useRef<ScrollBoxRenderable>(null);

  const commandQuery = showCommandMenu && textValue.startsWith("/") ? textValue.slice(1) : "";

  const filteredCommands = useMemo(() => filterCommands(commandQuery), [commandQuery]);

  const handleContentChange = useCallback((text: string) => {
    setTextValue(text);
    setSelectedIndex(0);
    scrollRef.current?.scrollTo(0);

    // A command is only being typed while the text is one unbroken "/word".
    const prefix = text.startsWith("/") ? text.slice(1) : null;
    setShowCommandMenu(prefix !== null && !prefix.includes(" "));
  }, []);

  const resolveCommand = useCallback(
    (index: number): Command | undefined => {
      const command = filteredCommands[index];
      if (command) setShowCommandMenu(false);
      return command;
    },
    [filteredCommands],
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
    if (!showCommandMenu) return;
    if (key.name === "escape") {
      key.preventDefault();
      setShowCommandMenu(false);
    } else if (key.name === "up") {
      key.preventDefault();
      const next = Math.max(0, selectedIndex - 1);
      setSelectedIndex(next);
      scrollIntoView(next);
    } else if (key.name === "down") {
      key.preventDefault();
      const next = Math.min(filteredCommands.length - 1, selectedIndex + 1);
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
    resolveCommand,
    setSelectedIndex,
  };
}
