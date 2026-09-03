import { useCallback } from "react";
import { REASONING_TOKEN_BUDGETS, type ReasoningLevel } from "@cattiva/shared";
import { useDialog } from "@/providers/dialog";
import { useModel } from "@/providers/model";
import { useTheme } from "@/providers/theme";
import { useToast } from "@/providers/toast";
import { SearchList } from "./search-list";

const DESCRIPTIONS: Record<ReasoningLevel, string> = {
  off: "answer straight away, no thinking tokens",
  low: `think briefly · up to ${REASONING_TOKEN_BUDGETS.low} tokens`,
  medium: `think it through · up to ${REASONING_TOKEN_BUDGETS.medium} tokens`,
  high: `think hard · up to ${REASONING_TOKEN_BUDGETS.high} tokens`,
};

export function ReasoningPicker() {
  const { colors } = useTheme();
  const { close } = useDialog();
  const { model, reasoning, setReasoning } = useModel();
  const toast = useToast();

  const levels: ReasoningLevel[] = [...model.reasoning];

  const select = useCallback(
    (next: ReasoningLevel) => {
      setReasoning(next);
      close();
      toast.show({ variant: "success", message: `Reasoning set to ${next}` });
    },
    [setReasoning, close, toast],
  );

  if (levels.length === 0) {
    return <text fg={colors.dimSeparator}>{`${model.id} has no reasoning control.`}</text>;
  }

  const initialIndex = Math.max(0, levels.indexOf(reasoning));

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
          <text selectable={false} fg={isSelected ? colors.selection : colors.dimSeparator}>
            {level}
          </text>
          <text selectable={false} fg={colors.dimSeparator}>
            {` · ${DESCRIPTIONS[level]}`}
          </text>
        </>
      )}
    />
  );
}
