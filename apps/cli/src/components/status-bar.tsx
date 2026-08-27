import { homedir } from "node:os";
import { sep } from "node:path";
import { DIM } from "@/theme";

const MODEL = "claude-opus-5";

const home = homedir();
const cwd = process.cwd();
const DIR = cwd === home ? "~" : cwd.startsWith(home + sep) ? `~${cwd.slice(home.length)}` : cwd;

const lines = [MODEL, DIR];

export function StatusBar() {
  return (
    <box flexDirection="column">
      {lines.map((line) => (
        <text key={line} fg={DIM}>
          {line}
        </text>
      ))}
    </box>
  );
}
