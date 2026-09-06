import type { CattivaUIMessage, CattivaUIPart } from "@cattiva/shared";
import { useTheme } from "@/providers/theme";
import { formatTokens } from "@/utils/format-tokens";
import { ThinkingBlock } from "./thinking-block";
import { isToolPart, ToolPart } from "./tool-part";

type Props = {
  message: CattivaUIMessage;
};

function PartView({ part }: { part: CattivaUIPart }) {
  if (part.type === "reasoning") {
    return <ThinkingBlock text={part.text} />;
  }

  if (part.type === "text") {
    return (
      <box paddingX={3} width="100%">
        <text>{part.text}</text>
      </box>
    );
  }

  if (isToolPart(part)) {
    return <ToolPart part={part} />;
  }

  return null;
}

export function BotMessage({ message }: Props) {
  const { colors } = useTheme();

  const model = message.metadata?.model;
  const usage = message.metadata?.usage;

  return (
    <box width="100%" alignItems="center">
      <box flexDirection="column" gap={1} paddingY={1} width={"100%"}>
        {message.parts.map((part, index) => (
          <PartView key={index} part={part} />
        ))}
      </box>

      {model ? (
        <box paddingX={3} paddingBottom={1} gap={1} width={"100%"}>
          <box flexDirection="row" justifyContent="space-between" width={"100%"}>
            <box flexDirection="row" gap={2}>
              <text fg={colors.primary}>{">"}</text>
              <text>{model}</text>
            </box>

            {usage ? (
              <text fg={colors.dimSeparator}>
                {`${formatTokens(usage.inputTokens ?? 0)} in · ${formatTokens(usage.outputTokens ?? 0)} out`}
              </text>
            ) : null}
          </box>
        </box>
      ) : null}
    </box>
  );
}
