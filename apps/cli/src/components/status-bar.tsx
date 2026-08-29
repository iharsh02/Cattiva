import { homedir } from "node:os";
import { sep } from "node:path";
import { useTheme } from "@/providers/theme";

const MODEL = "claude-opus-5";

const home = homedir();
const cwd = process.cwd();
const DIR = cwd === home ? "~" : cwd.startsWith(home + sep) ? `~${cwd.slice(home.length)}` : cwd;

export function StatusBar() {
  const { colors } = useTheme();

  return (
    <box flexDirection="column">
      <text fg={colors.primary}>{MODEL}</text>
      <text fg={colors.dimSeparator}>{DIR}</text>
    </box>
  );
}
