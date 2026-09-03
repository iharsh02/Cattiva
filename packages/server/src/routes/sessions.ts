import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { DEFAULT_SESSION_TITLE, findSupportedChatModel, titleFromMessage } from "@cattiva/shared";
import { Mode, Role } from "@cattiva/database/enums";
import { db, orm } from "@cattiva/database";
import { MESSAGE_FIELDS } from "../lib/messages";

/** Until there is auth, every session on this machine belongs to the one local user. */
const LOCAL_USER_ID = "local";

const messageInputSchema = z.object({
  role: z.enum(Role),
  content: z.string(),
  mode: z.enum(Mode),
  model: z.string().refine((id) => !!findSupportedChatModel(id), "Unsupported model"),
});

type MessageInput = z.infer<typeof messageInputSchema>;

const createSessionSchema = z.object({
  title: z.string().optional(),
  cwd: z.string().optional(),
  initialMessage: messageInputSchema.optional(),
});

function nextTitle(current: string, message: MessageInput | undefined): string {
  if (current !== DEFAULT_SESSION_TITLE || message?.role !== "USER") return current;
  return titleFromMessage(message.content);
}

const createSessionValidator = zValidator("json", createSessionSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "invalid request body" }, 400);
  }
});

const addMessageValidator = zValidator("json", messageInputSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "invalid request body" }, 400);
  }
});

const app = new Hono()
  .get("/", async (c) => {
    const sessions = await orm.Session.where({ userId: LOCAL_USER_ID })
      .select("id", "title", "createdAt")
      .orderBy((s) => s.createdAt.desc())
      .all();

    return c.json(sessions);
  })
  .get("/:id", async (c) => {
    const session = await orm.Session.where({ id: c.req.param("id") })
      .select("id", "title", "cwd", "createdAt", "updatedAt")
      .include("messages", (message) =>
        message.select(...MESSAGE_FIELDS).orderBy((m) => m.createdAt.asc()),
      )
      .first();

    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    return c.json(session);
  })
  .post("/", createSessionValidator, async (c) => {
    const { title, cwd, initialMessage } = c.req.valid("json");

    // The session and its opening message land together or not at all.
    const session = await db.transaction(async (tx) => {
      const created = await tx.orm.public.Session.select(
        "id",
        "title",
        "cwd",
        "createdAt",
        "updatedAt",
      ).create({
        userId: LOCAL_USER_ID,
        title: title ?? nextTitle(DEFAULT_SESSION_TITLE, initialMessage),
        cwd: cwd ?? null,
      });

      const messages = initialMessage
        ? [
            await tx.orm.public.Message.create({
              ...initialMessage,
              sessionId: created.id,
              status: "COMPLETE",
            }),
          ]
        : [];

      return { ...created, messages };
    });

    return c.json(session, 201);
  })
  .post("/:id/messages", addMessageValidator, async (c) => {
    const sessionId = c.req.param("id");
    const input = c.req.valid("json");

    const result = await db.transaction(async (tx) => {
      const session = await tx.orm.public.Session.select("id", "title").first({ id: sessionId });
      if (!session) return null;

      const message = await tx.orm.public.Message.create({
        ...input,
        sessionId,
        status: "COMPLETE",
      });

      const title = nextTitle(session.title, input);
      if (title !== session.title) {
        await tx.orm.public.Session.where({ id: sessionId }).update({ title });
      }

      return { message, title };
    });

    if (!result) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    return c.json(result, 201);
  });

export default app;
