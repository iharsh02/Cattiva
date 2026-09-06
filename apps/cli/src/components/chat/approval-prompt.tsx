import { useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { getToolName } from "ai";
import type { CattivaUIMessage } from "@cattiva/shared";
import { LAYER, useKeyboardLayer } from "@/providers/keyboard-layer";
import { useTheme } from "@/providers/theme";
import { isToolPart, summarise } from "./tool-part";

type Pending = { approvalId: string; toolName: string; detail: string };

export function pendingApproval(messages: CattivaUIMessage[]): Pending | null {
  for (const message of messages.toReversed()) {
    for (const part of message.parts) {
      if (!isToolPart(part) || part.state !== "approval-requested") continue;

      const toolName = getToolName(part);

      return { approvalId: part.approval.id, toolName, detail: summarise(toolName, part.input) };
    }
  }

  return null;
}

export function ApprovalPrompt({
  pending,
  onAnswer,
}: {
  pending: Pending;
  onAnswer: (approvalId: string, approved: boolean) => void;
}) {
  const { colors } = useTheme();
  const { push, pop } = useKeyboardLayer();

  useEffect(() => {
    push(LAYER.dialog);
    return () => pop(LAYER.dialog);
  }, [push, pop]);

  useKeyboard((key) => {
    if (key.name !== "y" && key.name !== "n") return;

    key.preventDefault();
    onAnswer(pending.approvalId, key.name === "y");
  });

  return (
    <box
      flexDirection="column"
      gap={1}
      marginX={3}
      paddingX={2}
      paddingY={1}
      width="100%"
      border
      borderStyle="rounded"
      borderColor={colors.planMode}
    >
      <box flexDirection="row" gap={1}>
        <text fg={colors.planMode}>{"⚠"}</text>
        <text>{`Run ${pending.toolName}?`}</text>
      </box>

      {pending.detail.length > 0 ? <text fg={colors.info}>{pending.detail}</text> : null}

      <text fg={colors.dimSeparator}>y to allow · n to decline</text>
    </box>
  );
}
