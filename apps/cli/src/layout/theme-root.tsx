import { useTheme } from "@/providers/theme";
import type { ReactNode } from "react";

export function ThemedRoot({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={colors.background}>
      {children}
    </box>
  );
}
