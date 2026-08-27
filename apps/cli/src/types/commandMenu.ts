export type CommandMenuContext = {
  exit: () => void;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  action?: (ctx: CommandMenuContext) => void | Promise<void>;
};
