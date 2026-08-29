import type { RefObject } from "react";
import { useEffect } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { filterCommands } from "@/utils/filter-commands";
import { COMMANDS } from "./command-registry";
import { useTheme } from "@/providers/theme";

const MAX_COMMANDS_DISPLAYED = 8;

const COMMAND_COL_WIDTH = Math.max(...COMMANDS.map((cmd) => cmd.name.length)) + 4;

type CommandMenuProps = {
  query: string;
  selectedIndex: number;
  scrollRef?: RefObject<ScrollBoxRenderable | null>;
  onSelect: (index: number) => void;
  onExecute: (index: number) => void;
};

export function CommandMenu({
  query,
  selectedIndex,
  scrollRef,
  onSelect,
  onExecute,
}: CommandMenuProps) {
  const { colors } = useTheme();

  const filtered = filterCommands(query);
  const visibleHeight = Math.min(filtered.length, MAX_COMMANDS_DISPLAYED);

  // Rows are one line tall, so scrollTop counts rows: keep the selection inside it.
  useEffect(() => {
    const box = scrollRef?.current;
    if (!box || visibleHeight === 0) return;
    if (selectedIndex < box.scrollTop) {
      box.scrollTop = selectedIndex;
    } else if (selectedIndex >= box.scrollTop + visibleHeight) {
      box.scrollTop = selectedIndex - visibleHeight + 1;
    }
  }, [selectedIndex, visibleHeight, scrollRef]);

  if (filtered.length === 0) {
    return (
      <box paddingX={2} paddingY={1}>
        <text fg={colors.dimSeparator}>No matching command found</text>
      </box>
    );
  }

  return (
    <scrollbox ref={scrollRef} height={visibleHeight}>
      {filtered.map((cmd, index) => {
        const isSelected = index === selectedIndex;

        return (
          <box
            key={cmd.value}
            flexDirection="row"
            paddingX={1}
            height={1}
            overflow="hidden"
            backgroundColor={isSelected ? colors.surface : undefined}
            onMouseMove={() => onSelect(index)}
            onMouseDown={() => onExecute(index)}
          >
            <box width={COMMAND_COL_WIDTH} flexShrink={0}>
              <text selectable={false} fg={isSelected ? colors.selection : colors.dimSeparator}>
                /{cmd.name}
              </text>
            </box>
            <box flexGrow={1} overflow="hidden">
              <text selectable={false} fg={colors.dimSeparator}>
                {cmd.description}
              </text>
            </box>
          </box>
        );
      })}
    </scrollbox>
  );
}
