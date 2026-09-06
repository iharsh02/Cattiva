import { tool } from "ai";
import { z } from "zod";

export const toolInputSchemas = {
  readFile: z.object({
    path: z.string().describe("Path to the file, relative to the project root"),
    offset: z.number().int().min(1).optional().describe("First line to read, 1-based"),
    limit: z.number().int().min(1).optional().describe("How many lines to read"),
  }),
  listDirectory: z.object({
    path: z.string().default(".").describe("Directory to list, relative to the project root"),
  }),
  glob: z.object({
    pattern: z.string().describe("Glob pattern, e.g. src/**/*.ts"),
    path: z.string().default(".").describe("Directory to search from"),
  }),
  grep: z.object({
    pattern: z.string().describe("Extended regular expression to search for"),
    path: z.string().default(".").describe("Directory to search from"),
    include: z.string().optional().describe("Only search files matching this glob"),
  }),
  writeFile: z.object({
    path: z.string().describe("Path to write, relative to the project root"),
    content: z.string().describe("Full contents of the file"),
  }),
  editFile: z.object({
    path: z.string().describe("Path to edit, relative to the project root"),
    oldString: z.string().describe("Exact text to replace; must appear exactly once"),
    newString: z.string().describe("Replacement text"),
  }),
  bash: z.object({
    command: z.string().describe("Shell command to run in the project root"),
    description: z.string().optional().describe("What the command does, in a few words"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
  }),
} as const;

export const readOnlyToolContracts = {
  readFile: tool({
    description:
      "Read a file from the project. Long files come back truncated; page through the rest with offset and limit rather than re-reading the whole file.",
    inputSchema: toolInputSchemas.readFile,
    outputSchema: z.unknown(),
  }),
  listDirectory: tool({
    description: "List the entries of a directory in the project.",
    inputSchema: toolInputSchemas.listDirectory,
    outputSchema: z.unknown(),
  }),
  glob: tool({
    description: "Find files in the project matching a glob pattern.",
    inputSchema: toolInputSchemas.glob,
    outputSchema: z.unknown(),
  }),
  grep: tool({
    description: "Search file contents in the project with a regular expression.",
    inputSchema: toolInputSchemas.grep,
    outputSchema: z.unknown(),
  }),
} as const;

export const buildToolContracts = {
  ...readOnlyToolContracts,
  writeFile: tool({
    description: "Create a file, or replace one wholesale.",
    inputSchema: toolInputSchemas.writeFile,
    outputSchema: z.unknown(),
  }),
  editFile: tool({
    description: "Replace an exact, unique piece of text in a file.",
    inputSchema: toolInputSchemas.editFile,
    outputSchema: z.unknown(),
  }),
  bash: tool({
    description: "Run a shell command in the project root.",
    inputSchema: toolInputSchemas.bash,
    outputSchema: z.unknown(),
  }),
} as const;

export type ToolContracts = typeof buildToolContracts;
export type ToolName = keyof ToolContracts;

export const ALL_TOOL_NAMES = Object.keys(buildToolContracts) as ToolName[];

export const READ_ONLY_TOOL_NAMES = Object.keys(readOnlyToolContracts) as ToolName[];
