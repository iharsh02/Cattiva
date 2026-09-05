import { TextAttributes } from "@opentui/core";
import { useTheme } from "@/providers/theme";

const MARKER = "✻";

const STREAMING_TAIL_LINES = 8;

type Props = {
  text: string;
  streaming?: boolean;
  expanded?: boolean;
};

function tail(text: string, lines: number): string {
  const all = text.split("\n");
  return all.length <= lines ? text : all.slice(-lines).join("\n");
}

export function ThinkingBlock({ text, streaming = false, expanded = false }: Props) {
  const { colors } = useTheme();

  if (text.length === 0) return null;

  if (!streaming && !expanded) {
    return (
      <box flexDirection="row" gap={1} paddingX={3} width="100%">
        <text fg={colors.thinking}>{MARKER}</text>
        <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
          Thought
        </text>
      </box>
    );
  }

  return (
    <box paddingX={3} width="100%">
      <box
        flexDirection="column"
        width="100%"
        gap={1}
        paddingX={1}
        border
        borderStyle="rounded"
        borderColor={colors.thinkingBorder}
      >
        <box flexDirection="row" gap={1}>
          <text fg={colors.thinking}>{MARKER}</text>
          <text fg={colors.thinking}>{streaming ? "Thinking" : "Thought"}</text>
        </box>

        <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
          {streaming ? tail(text, STREAMING_TAIL_LINES) : text}
        </text>
      </box>
    </box>
  );
}
