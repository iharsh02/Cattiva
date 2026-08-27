import type { ToastContextValue } from "@/providers/toast";

export type CommandMenuContext = {
  exit: () => void;
  toast: ToastContextValue;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  action?: (ctx: CommandMenuContext) => void | Promise<void>;
};
