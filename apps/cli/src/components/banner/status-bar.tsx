import { homedir } from "node:os";
import { sep } from "node:path";
import { useModel } from "@/providers/model";
import { useTheme } from "@/providers/theme";

const home = homedir();
const cwd = process.cwd();
const DIR = cwd === home ? "~" : cwd.startsWith(home + sep) ? `~${cwd.slice(home.length)}` : cwd;

export function StatusBar() {
  const { colors } = useTheme();
  const { model, reasoning } = useModel();

  return (
    <box flexDirection="column">
      <box flexDirection="row" gap={1}>
        <text fg={colors.primary}>{model.id}</text>
        <text fg={colors.dimSeparator}>{`· reasoning ${reasoning}`}</text>
      </box>
      <text fg={colors.dimSeparator}>{DIR}</text>
    </box>
  );
}
