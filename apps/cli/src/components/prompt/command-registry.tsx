import { createSession } from "@/lib/sessions";
import { SessionPicker } from "@/components/dialogs/session-picker";
import { ThemePicker } from "@/components/dialogs/theme-picker";
import { ModelPicker } from "@/components/dialogs/model-picker";
import type { Command } from "@/types/commandMenu";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation",
    value: "/new",
    action: async (ctx) => {
      try {
        const session = await createSession();
        ctx.toast.show({ variant: "success", message: "Session created" });
        ctx.navigate(`/sessions/${session.id}`, { state: { session } });
      } catch (error) {
        ctx.toast.show({
          variant: "error",
          message: error instanceof Error ? error.message : "Failed to create session",
        });
      }
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
    action: (ctx) => {
      ctx.dialog.open({
        title: "Switch Session",
        children: <SessionPicker />,
      });
    },
  },
  {
    name: "model",
    description: "Choose the model this session runs against",
    value: "/model",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Model",
        children: <ModelPicker />,
      });
    },
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
    name: "theme",
    description: "Switch the colour theme",
    value: "/theme",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Select Theme",
        children: <ThemePicker />,
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
