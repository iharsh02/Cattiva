import type { DialogContextValue } from "@/providers/dialog";
import type { ToastContextValue } from "@/providers/toast";

export type CommandMenuContext = {
  exit: () => void;
  toast: ToastContextValue;
  dialog: DialogContextValue;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  action?: (ctx: CommandMenuContext) => void | Promise<void>;
};
