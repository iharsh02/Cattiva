import type { NavigateFunction } from "react-router";
import type { DialogContextValue } from "@/providers/dialog";
import type { ToastContextValue } from "@/providers/toast";

export type CommandMenuContext = {
  exit: () => void;
  toast: ToastContextValue;
  dialog: DialogContextValue;
  navigate: NavigateFunction;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  action?: (ctx: CommandMenuContext) => void | Promise<void>;
};
