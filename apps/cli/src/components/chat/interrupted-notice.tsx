import { TextAttributes } from "@opentui/core";
import { useTheme } from "@/providers/theme";

export function InterruptedNotice() {
  const { colors } = useTheme();

  return (
    <box flexDirection="row" gap={1} paddingX={3} width="100%">
      <text fg={colors.error}>{"■"}</text>
      <text attributes={TextAttributes.DIM} fg={colors.error}>
        Interrupted · send a message to carry on
      </text>
    </box>
  );
}
