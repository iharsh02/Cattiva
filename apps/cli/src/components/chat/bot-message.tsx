import { useTheme } from "@/providers/theme";
import { formatTokens } from "@/utils/format-tokens";
import type { TokenUsage } from "./types";

type Props = {
  content: string;
  model: string;
  /** Absent until the reply is complete: a streaming message has nothing to report yet. */
  usage?: TokenUsage;
};

export function BotMessage({ content, model, usage }: Props) {
  const { colors } = useTheme();

  return (
    <box width="100%" alignItems="center">
      <box paddingY={1} width={"100%"}>
        <box paddingX={3} width={"100%"}>
          <text>{content}</text>
        </box>
      </box>

      <box paddingX={3} paddingBottom={1} gap={1} width={"100%"}>
        <box flexDirection="row" justifyContent="space-between" width={"100%"}>
          <box flexDirection="row" gap={2}>
            <text fg={colors.primary}>{">"}</text>
            <text>{model}</text>
          </box>

          {usage ? (
            <text fg={colors.dimSeparator}>
              {`${formatTokens(usage.input)} in · ${formatTokens(usage.output)} out`}
            </text>
          ) : null}
        </box>
      </box>
    </box>
  );
}
