import type { ToolName } from "@cattiva/shared";

export type ToolRecord = Record<string, unknown>;

export type Tool = {
  name: ToolName;
  run: (input: unknown) => Promise<unknown>;

  gist: (input: ToolRecord) => string;

  body?: (input: ToolRecord) => string[];

  result?: (output: ToolRecord) => string;

  outputBody?: (output: ToolRecord) => string[];
};

export const MAX_BODY_LINES = 6;

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asRecord(value: unknown): ToolRecord {
  return value !== null && typeof value === "object" ? (value as ToolRecord) : {};
}

export function clamp(lines: string[]): string[] {
  const kept = lines.slice(0, MAX_BODY_LINES);
  const hidden = lines.length - kept.length;

  return hidden > 0 ? [...kept, `… +${hidden} more lines`] : kept;
}
