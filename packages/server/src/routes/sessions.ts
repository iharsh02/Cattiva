import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  DEFAULT_SESSION_TITLE,
  findSupportedChatModel,
  titleFromMessage,
  type MessagePart,
} from "@cattiva/shared";

type MockMessage = {
  id: string;
  role: string;
  content: string;
  mode: string;
  model: string;
  status: string;
  parts: MessagePart[] | null;
  duration: number | null;
  createdAt: string;
  sessionId: string;
};

type MockSession = {
  id: string;
  title: string;
  cwd: string | null;
  userId: string;
  createdAt: string;
  messages: MockMessage[];
};

const sessions: MockSession[] = [];

let nextId = 1;

const messageInputSchema = z.object({
  role: z.string(),
  content: z.string(),
  mode: z.string(),
  model: z.string().refine((id) => !!findSupportedChatModel(id), "Unsupported model"),
});

type MessageInput = z.infer<typeof messageInputSchema>;

const createSessionSchema = z.object({
  title: z.string().optional(),
  cwd: z.string().optional(),
  initialMessage: messageInputSchema.optional(),
});

function appendMessage(session: MockSession, input: MessageInput): MockMessage {
  const message: MockMessage = {
    id: `${session.id}-${session.messages.length + 1}`,
    ...input,
    status: "COMPLETE",
    parts: null,
    duration: null,
    createdAt: new Date().toISOString(),
    sessionId: session.id,
  };

  session.messages.push(message);

  if (session.title === DEFAULT_SESSION_TITLE && input.role === "USER") {
    session.title = titleFromMessage(input.content);
  }

  return message;
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
  .get("/", (c) => {
    const result = sessions.map(({ id, title, createdAt }) => ({ id, title, createdAt }));
    return c.json(result);
  })
  .get("/:id", (c) => {
    const session = sessions.find((s) => s.id === c.req.param("id"));
    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }
    return c.json(session);
  })
  .post("/", createSessionValidator, (c) => {
    const { title, cwd, initialMessage } = c.req.valid("json");

    const session: MockSession = {
      id: String(nextId++),
      title: title ?? DEFAULT_SESSION_TITLE,
      cwd: cwd ?? null,
      userId: "local",
      createdAt: new Date().toISOString(),
      messages: [],
    };

    if (initialMessage) {
      appendMessage(session, initialMessage);
    }

    sessions.push(session);
    return c.json(session, 201);
  })
  .post("/:id/messages", addMessageValidator, (c) => {
    const session = sessions.find((s) => s.id === c.req.param("id"));
    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    const message = appendMessage(session, c.req.valid("json"));
    return c.json({ message, title: session.title }, 201);
  });

export default app;
