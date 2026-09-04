import type { DialogContextValue } from "@/providers/dialog";
import type { SessionContextValue } from "@/providers/session";
import type { ToastContextValue } from "@/providers/toast";
import type { Mode } from "@cattiva/database";
import type { SupportedChatModel } from "@cattiva/shared";

export type CommandMenuContext = {
  exit: () => void;
  toast: ToastContextValue;
  dialog: DialogContextValue;
  session: SessionContextValue;
  mode: Mode;
  setMode: (mode: Mode) => void;
  setModel: (model: SupportedChatModel) => void;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  action: (ctx: CommandMenuContext) => void | Promise<void>;
};
