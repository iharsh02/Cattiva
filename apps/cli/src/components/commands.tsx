import type { Command } from "../types/commandMenu";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Create a new memory engine session",
    value: "/new",
  },
  {
    name: "exit",
    description: "Quit the application",
    value: "/exit",
    action: (ctx) => {
      ctx.exit();
    },
  },
];
