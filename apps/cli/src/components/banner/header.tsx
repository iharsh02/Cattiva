import { version } from "../../../package.json";
import { useTheme } from "@/providers/theme";

export function Header() {
  const { colors } = useTheme();

  return (
    <box flexDirection="row" gap={1}>
      {/* Deliberately unthemed: the wordmark stays white whatever the theme is. */}
      <ascii-font text="Cattiva" font="tiny" color="#ffffff" />
      <text fg={colors.dimSeparator}>v{version}</text>
    </box>
  );
}
