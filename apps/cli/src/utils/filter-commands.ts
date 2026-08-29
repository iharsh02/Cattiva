import type { Command } from "@/types/commandMenu";
import { COMMANDS } from "@/components/prompt/command-registry";

export function filterCommands(input: string): Command[] {
  const query = input.trim().replace(/^\//, "").toLowerCase();
  if (query.length === 0) return COMMANDS;
  return COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(query));
}
