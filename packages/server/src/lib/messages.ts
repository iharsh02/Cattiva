import type { MessageStatus, Mode, Role } from "@cattiva/database/enums";
import type { Effort, Reasoning } from "@cattiva/shared";

export const MESSAGE_FIELDS = [
  "id",
  "sessionId",
  "role",
  "content",
  "mode",
  "reasoning",
  "effort",
  "model",
  "status",
  "parts",
  "duration",
  "createdAt",
] as const;

export const HISTORY_FIELDS = ["role", "content", "parts"] as const;

export type HistoryMessage = {
  role: Role;
  content: string;
  parts: unknown;
};

export type StoredMessage = HistoryMessage & {
  id: string;
  sessionId: string;
  status: MessageStatus;
  model: string;
  mode: Mode;
  reasoning: Reasoning | null;
  effort: Effort | null;
  duration: number | null;
  createdAt: string;
};
