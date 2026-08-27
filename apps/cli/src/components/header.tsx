import { version } from "../../package.json";
import { DIM } from "@/theme";

export function Header() {
  return (
    <box flexDirection="row" gap={1}>
      <ascii-font text="Cattiva" font="tiny" />
      <text fg={DIM}>v{version}</text>
    </box>
  );
}
