import type { Command } from "@/types/commandMenu";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Create a new memory engine session",
    value: "/new",
    action: (ctx) => {
      ctx.toast.show({ message: "Starting new conversation" });
    },
  },
  {
    name: "usage",
    description: "Show token usage and cost for this session",
    value: "/usage",
  },
  {
    name: "logout",
    description: "Sign out and forget the stored credentials",
    value: "/logout",
  },
  {
    name: "login",
    description: "Sign in and store the credentials",
    value: "/login",
  },
  {
    name: "session",
    description: "Switch between saved sessions",
    value: "/session",
  },
  {
    name: "models",
    description: "Choose the model this session runs against",
    value: "/models",
  },
  {
    name: "agents",
    description: "List and configure the available agents",
    value: "/agents",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Mode",
        children: <text>Agent Selection window</text>,
      });
    },
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
