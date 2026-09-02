import { useCallback } from "react";
import { SUPPORTED_CHAT_MODELS, type SupportedChatModel } from "@cattiva/shared";
import { useDialog } from "@/providers/dialog";
import { useModel } from "@/providers/model";
import { useTheme } from "@/providers/theme";
import { useToast } from "@/providers/toast";
import { SearchList } from "./search-list";

const MODELS: SupportedChatModel[] = [...SUPPORTED_CHAT_MODELS];

export function ModelPicker() {
  const { colors } = useTheme();
  const { close } = useDialog();
  const { model, setModel } = useModel();
  const toast = useToast();

  const select = useCallback(
    (next: SupportedChatModel) => {
      setModel(next);
      close();
      toast.show({ variant: "success", message: `Model set to ${next.id}` });
    },
    [setModel, close, toast],
  );

  const initialIndex = Math.max(
    0,
    MODELS.findIndex((candidate) => candidate.id === model.id),
  );

  return (
    <SearchList
      items={MODELS}
      getKey={(candidate) => candidate.id}
      initialIndex={initialIndex}
      filterFn={(candidate, query) =>
        `${candidate.id} ${candidate.provider}`.toLowerCase().includes(query.toLowerCase())
      }
      onSelect={select}
      placeholder="Search models"
      emptyText="No models match"
      renderItem={(candidate, isSelected) => (
        <>
          <text selectable={false} fg={isSelected ? colors.selection : colors.dimSeparator}>
            {candidate.id}
          </text>
          <text selectable={false} fg={colors.dimSeparator}>
            {` · ${candidate.provider}`}
          </text>
        </>
      )}
    />
  );
}
