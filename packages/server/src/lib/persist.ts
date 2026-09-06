import { db } from "@cattiva/database";
import type { MessageStatus } from "@cattiva/database/enums";
import {
  roleToRow,
  textFromMessage,
  type CattivaUIMessage,
  type ChatMetadata,
} from "@cattiva/shared";

type PartsColumn = Parameters<typeof db.orm.public.Message.create>[0]["parts"];

export type TurnSettings = Required<Pick<ChatMetadata, "mode" | "model">> &
  Pick<ChatMetadata, "reasoning" | "effort">;

export async function saveMessage(
  sessionId: string,
  message: CattivaUIMessage,
  settled: TurnSettings,
  status: MessageStatus,
  durationMs?: number,
): Promise<void> {
  const row = {
    sessionId,
    role: roleToRow(message.role),
    status,
    content: textFromMessage(message),
    parts: message.parts as unknown as PartsColumn,
    model: settled.model,
    mode: settled.mode,
    reasoning: settled.reasoning ?? null,
    effort: settled.effort ?? null,
    ...(durationMs === undefined ? {} : { duration: durationMs }),
  };

  await db.transaction(async (tx) => {
    const existing = await tx.orm.public.Message.select("id").first({ id: message.id });

    if (existing) {
      await tx.orm.public.Message.where({ id: message.id }).update(row);
      return;
    }

    await tx.orm.public.Message.create({ id: message.id, ...row });
  });
}
