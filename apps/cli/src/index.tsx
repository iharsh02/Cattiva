import "@opentui/react/runtime-plugin-support";
import { homedir } from "node:os";
import { sep } from "node:path";
import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { version } from "../package.json";

const DIM = "#808080";

const MODEL = "claude-opus-5";

const home = homedir();
const cwd = process.cwd();
const DIR = cwd === home ? "~" : cwd.startsWith(home + sep) ? `~${cwd.slice(home.length)}` : cwd;

const lines = [MODEL, DIR];

function App() {
  return (
    <>
      <box flexDirection="column" padding={1} gap={1}>
        <box flexDirection="row" gap={1}>
          <ascii-font text="Cattiva" font="tiny" />
          <text fg={DIM}>v{version}</text>
        </box>
        <box flexDirection="column">
          {lines.map((line) => (
            <text key={line} fg={DIM}>
              {line}
            </text>
          ))}
        </box>
      </box>
      <box flexDirection="column">
        <box flexDirection="row" gap={1} border borderStyle="rounded" borderColor={DIM}>
          <text fg={DIM}>{">"}</text>
          <input focused placeholder="Ask anything" flexGrow={1} />
        </box>
        <box paddingLeft={2}>
          <text fg={DIM}>ctrl+c to quit</text>
        </box>
      </box>
    </>
  );
}

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`cattiva ${version}\n`);
  process.exit(0);
}

if (!process.stdout.isTTY) {
  process.stderr.write(
    "cattiva: this is a terminal UI and stdout is not a terminal.\n" +
      "Run it directly in a terminal rather than through a pipe or a redirect.\n",
  );
  process.exit(1);
}

const renderer = await createCliRenderer();
renderer.on(CliRenderEvents.DESTROY, () => setImmediate(() => process.exit(0)));

createRoot(renderer).render(<App />);
