import "@opentui/react/runtime-plugin-support";
import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { version } from "../package.json";
import { Header } from "@/components/header";
import { InputBar } from "@/components/input-bar";
import { StatusBar } from "@/components/status-bar";
import { ToastProvider } from "@/providers/toast";
import { KeyboardLayerProvider } from "@/providers/keyboard-layer";

function App() {
  return (
    <KeyboardLayerProvider>
      <ToastProvider>
        <box flexDirection="column" padding={1} gap={1}>
          <Header />
          <StatusBar />
        </box>
        <InputBar />
      </ToastProvider>
    </KeyboardLayerProvider>
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

// ctrl+c belongs to KeyboardLayerProvider: opentui's own handler fires without checking
// defaultPrevented, so no layer could decline the quit while this was on.
const renderer = await createCliRenderer({ exitOnCtrlC: false });
renderer.on(CliRenderEvents.DESTROY, () => setImmediate(() => process.exit(0)));

createRoot(renderer).render(<App />);
