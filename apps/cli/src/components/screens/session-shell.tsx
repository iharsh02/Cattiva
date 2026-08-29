import type { ReactNode } from "react";
import { InputBar } from "@/components/prompt/input-bar";
import { useTheme } from "@/providers/theme";
import { Spinner } from "../spinner";

type Props = {
  children?: ReactNode;
  onSubmit: (text: string) => void;
  inputDisabled?: boolean;
  loading?: boolean;
};

export function SessionShell({
  children,
  onSubmit,
  inputDisabled = false,
  loading = false,
}: Props) {
  const { colors } = useTheme();

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      width={"100%"}
      height={"100%"}
      paddingY={1}
      paddingX={2}
      gap={1}
    >
      <scrollbox flexGrow={1} width={"100%"} stickyScroll stickyStart="bottom">
        <box gap={1}>{children}</box>
      </scrollbox>

      {/* The prompt is several rows tall, so the hints sit above it rather than beside it. */}
      <box flexDirection="column" flexShrink={0} width={"100%"}>
        <box
          flexDirection="row"
          justifyContent="space-between"
          height={1}
          paddingLeft={1}
          width={"100%"}
        >
          <text fg={colors.dimSeparator}>tab {">"} Build</text>
          {loading ? <Spinner /> : null}
        </box>

        <InputBar onSubmit={onSubmit} disabled={inputDisabled} />
      </box>
    </box>
  );
}
