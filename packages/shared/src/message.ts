import type { InferUITools, LanguageModelUsage, UIMessage } from "ai";
import type { Effort, Reasoning } from "./model";
import type { ToolContracts } from "./tools";
import type { MessageStatus, Mode, Role } from "@cattiva/database/enums";

export type ChatMetadata = {
  mode?: Mode;
  model?: string;
  reasoning?: Reasoning | null;
  effort?: Effort | null;
  status?: MessageStatus;
  durationMs?: number;
  usage?: LanguageModelUsage;
};

export type CattivaUIMessage = UIMessage<ChatMetadata, never, InferUITools<ToolContracts>>;

export type CattivaUIPart = CattivaUIMessage["parts"][number];

export type StoredMessageRow = {
  id: string;
  role: Role;
  content: string;
  parts: unknown;
  mode: Mode;
  model: string;
  reasoning: Reasoning | null;
  effort: Effort | null;
  status: MessageStatus;
  duration: number | null;
};

export function roleToRow(role: CattivaUIMessage["role"]): Role {
  return role === "user" ? "USER" : "ASSISTANT";
}

export function conversationRows(rows: readonly StoredMessageRow[]): CattivaUIMessage[] {
  return rows.filter((row) => row.role !== "ERROR").map(toUIMessage);
}

export function toUIMessage(row: StoredMessageRow): CattivaUIMessage {
  return {
    id: row.id,
    role: row.role === "USER" ? "user" : "assistant",
    parts: Array.isArray(row.parts)
      ? (row.parts as CattivaUIMessage["parts"])
      : ([{ type: "text", text: row.content }] as CattivaUIMessage["parts"]),
    metadata: {
      mode: row.mode,
      model: row.model,
      reasoning: row.reasoning,
      effort: row.effort,
      status: row.status,
      ...(row.duration === null ? {} : { durationMs: row.duration }),
    },
  };
}

export function textFromMessage(message: CattivaUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
