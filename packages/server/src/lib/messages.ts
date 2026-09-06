import type { StoredMessageRow } from "@cattiva/shared";

export const MESSAGE_FIELDS = [
  "id",
  "sessionId",
  "role",
  "content",
  "parts",
  "mode",
  "model",
  "reasoning",
  "effort",
  "status",
  "duration",
  "createdAt",
] as const;

export type { StoredMessageRow };
