import { TextAttributes } from "@opentui/core";
import { useTheme } from "@/providers/theme";

type Props = {
  message: string;
};

export function ErrorMessage({ message }: Props) {
  const { colors } = useTheme();

  return (
    <box width="100%" alignItems="center">
      <box
        justifyContent="center"
        paddingX={2}
        paddingY={1}
        backgroundColor={colors.surface}
        width={"100%"}
      >
        <text attributes={TextAttributes.DIM} fg={colors.error}>
          {message}
        </text>
      </box>
    </box>
  );
}
