import type { ToolName } from "@cattiva/shared";
import { bash } from "./bash";
import { editFile } from "./edit-file";
import { glob } from "./glob";
import { grep } from "./grep";
import { listDirectory } from "./list-directory";
import { readFile } from "./read-file";
import { writeFile } from "./write-file";
import type { Tool } from "./types";

const ALL: Tool[] = [readFile, listDirectory, glob, grep, writeFile, editFile, bash];

export const TOOLS = Object.fromEntries(ALL.map((tool) => [tool.name, tool])) as Record<
  ToolName,
  Tool
>;

export function toolFor(name: string): Tool | undefined {
  return TOOLS[name as ToolName];
}

export { asRecord, type Tool, type ToolRecord } from "./types";
