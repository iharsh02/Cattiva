import { TextAttributes } from "@opentui/core";
import { useTheme } from "@/providers/theme";

type Props = {
  text: string;
};

export function ThinkingBlock({ text }: Props) {
  const { colors } = useTheme();

  if (text.length === 0) return null;

  return (
    <box paddingX={3} width="100%">
      <text fg={colors.dimSeparator} attributes={TextAttributes.ITALIC}>
        <span fg={colors.thinking} attributes={TextAttributes.ITALIC}>
          Thinking:{" "}
        </span>
        {text}
      </text>
    </box>
  );
}
