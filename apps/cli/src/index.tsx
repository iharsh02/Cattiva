import "@opentui/react/runtime-plugin-support";
import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { version } from "../package.json";
import { createMemoryRouter, RouterProvider } from "react-router";
import { RootLayout } from "./layout/root-layout";
import { Home } from "@/components/screens/home";
import { NewSession } from "@/components/screens/new-session";
import { Session } from "./components/screens/session";

const router = createMemoryRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "sessions/new", element: <NewSession /> },
      {
        path: "sessions/:id",
        element: <Session />,
      },
    ],
  },
]);
function App() {
  return <RouterProvider router={router} />;
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
