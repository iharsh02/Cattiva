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

export type StoredMessage = {
  id: string;
  role: Role;
  status: MessageStatus;
  model: string;
  mode: Mode;
  reasoning: Reasoning | null;
  effort: Effort | null;
  content: string;
};
