import { useCallback, useEffect, useRef } from "react";
import type { Theme } from "@/theme";
import { THEMES } from "@/theme";
import { useTheme } from "@/providers/theme";
import { useDialog } from "@/providers/dialog";
import { DialogSearchList } from "./dialog-search-list";

export function ThemePicker() {
  const { colors, currentTheme, setTheme, previewTheme } = useTheme();
  const { close } = useDialog();

  const originalTheme = useRef(currentTheme);
  const committed = useRef(false);

  useEffect(() => {
    return () => {
      if (!committed.current) previewTheme(originalTheme.current);
    };
  }, [previewTheme]);

  const select = useCallback(
    (theme: Theme) => {
      committed.current = true;
      setTheme(theme);
      close();
    },
    [setTheme, close],
  );

  const initialIndex = Math.max(
    0,
    THEMES.findIndex((theme) => theme.name === originalTheme.current.name),
  );

  return (
    <DialogSearchList
      items={THEMES}
      getKey={(theme) => theme.name}
      initialIndex={initialIndex}
      filterFn={(theme, query) => theme.name.toLowerCase().includes(query.toLowerCase())}
      onHighlight={previewTheme}
      onSelect={select}
      placeholder="Search themes"
      emptyText="No themes match"
      renderItem={(theme, isSelected) => (
        <text selectable={false} fg={isSelected ? colors.selection : colors.dimSeparator}>
          {theme.name}
        </text>
      )}
    />
  );
}
