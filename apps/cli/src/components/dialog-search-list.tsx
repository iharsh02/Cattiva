import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { LAYER, useKeyboardLayer } from "@/providers/keyboard-layer";
import { useTheme } from "@/providers/theme";

const MAX_VISIBLE_ITEMS = 6;

type DialogSearchListProps<T> = {
  items: T[];
  onSelect: (item: T) => void;
  onHighlight?: (item: T) => void;
  filterFn: (item: T, query: string) => boolean;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  getKey: (item: T) => string;
  /** Row to open on, so a picker can start on whatever is already in effect. */
  initialIndex?: number;
  placeholder?: string;
  emptyText?: string;
};

export function DialogSearchList<T>({
  items,
  onSelect,
  onHighlight,
  filterFn,
  renderItem,
  getKey,
  initialIndex = 0,
  placeholder = "Search",
  emptyText = "No matches",
}: DialogSearchListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [query, setQuery] = useState("");

  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { isTopLayer } = useKeyboardLayer();
  const { colors } = useTheme();

  const filtered = query ? items.filter((item) => filterFn(item, query)) : items;
  const visibleHeight = Math.min(filtered.length, MAX_VISIBLE_ITEMS);

  const activeIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  const handleInput = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);

  const highlight = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      const item = filtered[index];
      if (item) onHighlight?.(item);
    },
    [filtered, onHighlight],
  );

  useEffect(() => {
    const box = scrollRef.current;
    if (!box || visibleHeight === 0) return;

    if (activeIndex < box.scrollTop) {
      box.scrollTop = activeIndex;
    } else if (activeIndex >= box.scrollTop + visibleHeight) {
      box.scrollTop = activeIndex - visibleHeight + 1;
    }
  }, [activeIndex, visibleHeight]);

  useKeyboard((key) => {
    if (!isTopLayer(LAYER.dialog) || filtered.length === 0) return;

    if (key.name === "up") {
      key.preventDefault();
      highlight(Math.max(0, activeIndex - 1));
    } else if (key.name === "down") {
      key.preventDefault();
      highlight(Math.min(filtered.length - 1, activeIndex + 1));
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault();
      const item = filtered[activeIndex];
      if (item) onSelect(item);
    }
  });

  return (
    <box flexDirection="column" gap={1}>
      <input placeholder={placeholder} focused={isTopLayer(LAYER.dialog)} onInput={handleInput} />

      {filtered.length === 0 ? (
        <text fg={colors.dimSeparator}>{emptyText}</text>
      ) : (
        <scrollbox ref={scrollRef} height={visibleHeight}>
          {filtered.map((item, index) => {
            const isSelected = index === activeIndex;

            return (
              <box
                key={getKey(item)}
                flexDirection="row"
                height={1}
                overflow="hidden"
                backgroundColor={isSelected ? colors.surface : undefined}
                onMouseMove={() => highlight(index)}
                onMouseDown={() => onSelect(item)}
              >
                {renderItem(item, isSelected)}
              </box>
            );
          })}
        </scrollbox>
      )}
    </box>
  );
}
