import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { streamText, type ModelMessage } from "ai";
import { db, orm } from "@cattiva/database";
import { Mode, type MessageStatus, type Role } from "@cattiva/database/enums";
import {
  DEFAULT_SESSION_TITLE,
  titleFromMessage,
  toolCallArgsSchema,
  type ChatStreamEvent,
  type MessagePart,
} from "@cattiva/shared";
import { isSupportedChatModelId, resolveChatModel, type ResolvedModel } from "../lib/models";

const submitSchema = z.object({
  content: z.string().min(1),
  mode: z.enum(Mode),
  model: z.string().refine(isSupportedChatModelId, "Unsupported model"),
});

const submitValidator = zValidator("json", submitSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});

function nextTitle(current: string, content: string): string {
  return current === DEFAULT_SESSION_TITLE ? titleFromMessage(content) : current;
}

function buildConversationHistory(messages: { role: Role; content: string }[]): ModelMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "ERROR" || message.content.length === 0) return [];

    return [
      {
        role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: message.content,
      },
    ];
  });
}

function appendDelta(parts: MessagePart[], type: "text" | "reasoning", text: string): void {
  const last = parts.at(-1);

  if (last && (last.type === "text" || last.type === "reasoning") && last.type === type) {
    last.text += text;
    return;
  }

  parts.push({ type, text });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The model stopped unexpectedly";
}

function sendEvent(stream: SSEStreamingApi, event: ChatStreamEvent): Promise<void> {
  return stream.writeSSE({ data: JSON.stringify(event) });
}

type Outcome = {
  content: string;
  parts: MessagePart[];
  aborted: boolean;
  failure: string | null;
};

async function consumeModelStream(
  resolved: ResolvedModel,
  history: ModelMessage[],
  stream: SSEStreamingApi,
): Promise<Outcome> {
  const abortController = new AbortController();
  const parts: MessagePart[] = [];
  let content = "";
  let aborted = false;

  stream.onAbort(() => abortController.abort());

  try {
    const result = streamText({
      model: resolved.model,
      messages: history,
      abortSignal: abortController.signal,
    });

    for await (const part of result.fullStream) {
      if (stream.aborted) {
        aborted = true;
        break;
      }

      switch (part.type) {
        case "text-delta":
          content += part.text;
          appendDelta(parts, "text", part.text);
          await sendEvent(stream, { type: "text-delta", text: part.text });
          break;

        case "reasoning-delta":
          appendDelta(parts, "reasoning", part.text);
          await sendEvent(stream, { type: "reasoning-delta", text: part.text });
          break;

        case "tool-call": {
          const parsed = toolCallArgsSchema.safeParse(part.input);
          const args = parsed.success ? parsed.data : {};

          parts.push({ type: "tool-call", id: part.toolCallId, name: part.toolName, args });
          await sendEvent(stream, {
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args,
          });
          break;
        }

        case "abort":
          aborted = true;
          break;

        case "error":
          throw part.error;

        default:
          break;
      }
    }
  } catch (error) {
    if (stream.aborted || abortController.signal.aborted) {
      aborted = true;
    } else {
      return { content, parts, aborted, failure: errorMessage(error) };
    }
  }

  return { content, parts, aborted, failure: null };
}

type Turn = {
  sessionId: string;
  mode: Mode;
  model: string;
  history: ModelMessage[];
};

function createMessage(input: {
  sessionId: string;
  role: Role;
  status: MessageStatus;
  model: string;
  mode: Mode;
  content: string;
  parts?: MessagePart[] | null;
  duration?: number;
}) {
  return orm.Message.select("id").create(input);
}

async function streamAssistantReply(turn: Turn, stream: SSEStreamingApi): Promise<void> {
  const resolved = resolveChatModel(turn.model);
  const startedAt = Date.now();

  const { content, parts, aborted, failure } = await consumeModelStream(
    resolved,
    turn.history,
    stream,
  );
  const duration = Date.now() - startedAt;

  const common = {
    sessionId: turn.sessionId,
    model: resolved.modelId,
    mode: turn.mode,
    duration,
  };

  // Recording and reporting are kept apart: a failed write must still leave the client
  // with a terminal event, or a reply it already watched stream in vanishes in silence.
  let messageId: string | null = null;
  let reported = failure;

  try {
    // A turn that produced nothing before failing leaves the ERROR row to speak for it.
    const assistant =
      failure === null || content.length > 0 || parts.length > 0
        ? await createMessage({
            ...common,
            role: "ASSISTANT",
            status: aborted || failure !== null ? "INTERRUPTED" : "COMPLETE",
            content,
            parts: parts.length > 0 ? parts : null,
          })
        : null;

    messageId = assistant?.id ?? null;

    if (failure !== null) {
      await createMessage({
        ...common,
        role: "ERROR",
        status: "COMPLETE",
        content: failure,
      });
    }
  } catch (error) {
    console.error("Failed to record assistant turn", error);
    reported ??= "The reply streamed but could not be saved.";
  }

  if (stream.aborted) return;

  // Exactly one terminal event, whatever happened above.
  const terminal: ChatStreamEvent =
    reported !== null || messageId === null
      ? { type: "error", message: reported ?? "The reply could not be recorded." }
      : { type: "done", messageId, durationMs: duration };

  await sendEvent(stream, terminal);
}

const app = new Hono().post("/:id", submitValidator, async (c) => {
  const sessionId = c.req.param("id");
  const { content, mode, model } = c.req.valid("json");

  const history = await db.transaction(async (tx) => {
    const session = await tx.orm.public.Session.select("id", "title").first({ id: sessionId });
    if (!session) return null;

    await tx.orm.public.Message.create({
      sessionId,
      role: "USER",
      status: "COMPLETE",
      content,
      model,
      mode,
    });

    const title = nextTitle(session.title, content);
    if (title !== session.title) {
      await tx.orm.public.Session.where({ id: sessionId }).update({ title });
    }

    return await tx.orm.public.Message.where({ sessionId })
      .select("role", "content")
      .orderBy((m) => m.createdAt.asc())
      .all();
  });

  if (!history) {
    throw new HTTPException(404, { message: "Session not found" });
  }

  return streamSSE(c, async (stream) => {
    await streamAssistantReply(
      { sessionId, mode, model, history: buildConversationHistory(history) },
      stream,
    );
  });
});

export default app;
