import { useCallback } from "react";
import { Mode } from "@cattiva/database/enums";
import { useDialog } from "@/providers/dialog";
import { useModel } from "@/providers/model";
import { useTheme } from "@/providers/theme";
import { useToast } from "@/providers/toast";
import { SearchList } from "./search-list";

const MODES: Mode[] = [Mode.BUILD, Mode.PLAN];

const DESCRIPTIONS: Record<Mode, string> = {
  [Mode.BUILD]: "make changes and carry work through to completion",
  [Mode.PLAN]: "analyze the work and propose an implementation plan",
};

export function AgentModePicker() {
  const { colors } = useTheme();
  const { close } = useDialog();
  const { mode, setMode } = useModel();
  const toast = useToast();

  const select = useCallback(
    (next: Mode) => {
      setMode(next);
      close();
      toast.show({ variant: "success", message: `Mode set to ${next.toLowerCase()}` });
    },
    [setMode, close, toast],
  );

  const initialIndex = Math.max(0, MODES.indexOf(mode));

  return (
    <SearchList
      items={MODES}
      getKey={(candidate) => candidate}
      initialIndex={initialIndex}
      filterFn={(candidate, query) =>
        `${candidate} ${DESCRIPTIONS[candidate]}`.toLowerCase().includes(query.toLowerCase())
      }
      onSelect={select}
      placeholder="Search modes"
      emptyText="No modes match"
      renderItem={(candidate, isSelected) => (
        <>
          <text
            selectable={false}
            fg={
              isSelected
                ? colors.selection
                : candidate === Mode.BUILD
                  ? colors.primary
                  : colors.planMode
            }
          >
            {candidate}
          </text>
          <text selectable={false} fg={colors.dimSeparator}>
            {` · ${DESCRIPTIONS[candidate]}`}
          </text>
        </>
      )}
    />
  );
}
