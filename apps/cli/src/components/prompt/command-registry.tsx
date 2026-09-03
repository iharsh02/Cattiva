import { SessionPicker } from "@/components/dialogs/session-picker";
import { ThemePicker } from "@/components/dialogs/theme-picker";
import { ModelPicker } from "@/components/dialogs/model-picker";
import { ReasoningPicker } from "@/components/dialogs/reasoning-picker";
import type { Command } from "@/types/commandMenu";

export const COMMANDS: Command[] = [
  {
    name: "new",
    description: "Start a new conversation",
    value: "/new",
    action: (ctx) => {
      ctx.session.reset();
      ctx.toast.show({ variant: "success", message: "Started a new conversation" });
    },
  },
  {
    name: "resume",
    description: "Answer a reply that was cut short",
    value: "/resume",
    action: async (ctx) => {
      if (ctx.session.busy) return;

      if (!(await ctx.session.resume())) {
        ctx.toast.show({ variant: "info", message: "Nothing to resume" });
      }
    },
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
    name: "reasoning",
    description: "Set how many thinking tokens the model may spend",
    value: "/reasoning",
    action: (ctx) => {
      ctx.dialog.open({
        title: "Reasoning Effort",
        children: <ReasoningPicker />,
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
