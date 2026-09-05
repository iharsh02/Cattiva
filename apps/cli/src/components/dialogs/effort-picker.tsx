import { useCallback } from "react";
import { EFFORT_LEVELS, type Effort } from "@cattiva/shared";
import { useDialog } from "@/providers/dialog";
import { useModel } from "@/providers/model";
import { useTheme } from "@/providers/theme";
import { useToast } from "@/providers/toast";
import { SearchList } from "./search-list";

const DESCRIPTIONS: Record<Effort, string> = {
  low: "cheap and terse · the fewest tool calls",
  medium: "balanced",
  high: "thorough · what the providers default to",
  xhigh: "best for coding and long agentic work",
  max: "correctness over cost",
};

export function effortDots(effort: Effort): string {
  const filled = EFFORT_LEVELS.indexOf(effort) + 1;
  return "●".repeat(filled) + "○".repeat(EFFORT_LEVELS.length - filled);
}

export function EffortPicker() {
  const { colors } = useTheme();
  const { close } = useDialog();
  const { model, effort, setEffort } = useModel();
  const toast = useToast();

  const levels: Effort[] = [...model.effort];

  const select = useCallback(
    (next: Effort) => {
      setEffort(next);
      close();
      toast.show({ variant: "success", message: `Effort set to ${next}` });
    },
    [setEffort, close, toast],
  );

  if (levels.length === 0) {
    return <text fg={colors.dimSeparator}>{`${model.id} has no effort control.`}</text>;
  }

  const initialIndex = effort === null ? 0 : Math.max(0, levels.indexOf(effort));

  return (
    <SearchList
      items={levels}
      getKey={(level) => level}
      initialIndex={initialIndex}
      filterFn={(level, query) => level.includes(query.toLowerCase())}
      onSelect={select}
      placeholder="Search levels"
      emptyText="No levels match"
      renderItem={(level, isSelected) => (
        <>
          <text selectable={false} fg={isSelected ? colors.selection : colors.primary}>
            {`${effortDots(level)} ${level}`}
          </text>
          <text selectable={false} fg={colors.dimSeparator}>
            {` · ${DESCRIPTIONS[level]}`}
          </text>
        </>
      )}
    />
  );
}
