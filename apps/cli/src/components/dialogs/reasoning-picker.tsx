import { useCallback } from "react";
import { allowsReasoningOff, type Reasoning } from "@cattiva/shared";
import { useDialog } from "@/providers/dialog";
import { useModel } from "@/providers/model";
import { useTheme } from "@/providers/theme";
import { useToast } from "@/providers/toast";
import { SearchList } from "./search-list";

const DESCRIPTIONS: Record<Reasoning, string> = {
  on: "think it through before answering",
  off: "answer straight away, without thinking first",
};

export function ReasoningPicker() {
  const { colors } = useTheme();
  const { close } = useDialog();
  const { model, reasoning, effort, setReasoning } = useModel();
  const toast = useToast();

  const levels: Reasoning[] = [...model.reasoning];

  const select = useCallback(
    (next: Reasoning) => {
      setReasoning(next);
      close();

      // The resolver may lower effort to keep the pair legal, so say so rather than letting the
      // status bar quietly disagree with what was just chosen.
      const lowered = next === "off" && !allowsReasoningOff(model, effort);
      toast.show({
        variant: "success",
        message: lowered
          ? `Reasoning off · effort lowered to high, which ${model.id} requires to answer unthinking`
          : `Reasoning ${next}`,
      });
    },
    [setReasoning, close, toast, model, effort],
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
      placeholder="Search"
      emptyText="No match"
      renderItem={(level, isSelected) => (
        <>
          <text
            selectable={false}
            fg={
              isSelected
                ? colors.selection
                : level === "off"
                  ? colors.dimSeparator
                  : colors.thinking
            }
          >
            {`${level === "on" ? "◉" : "○"} ${level}`}
          </text>
          <text selectable={false} fg={colors.dimSeparator}>
            {` · ${DESCRIPTIONS[level]}`}
          </text>
        </>
      )}
    />
  );
}
