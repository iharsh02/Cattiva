import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  streamText,
  type ModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolResultPart,
} from "ai";
import { db, orm } from "@cattiva/database";
import { Mode, type MessageStatus, type Role } from "@cattiva/database/enums";
import {
  DEFAULT_SESSION_TITLE,
  effortSchema,
  findSupportedChatModel,
  reasoningSchema,
  messagePartsSchema,
  resolveTurnSettings,
  titleFromMessage,
  toolCallArgsSchema,
  type ChatStreamEvent,
  type Effort,
  type MessagePart,
  type Reasoning,
} from "@cattiva/shared";
import { isSupportedChatModelId, resolveChatModel, type ResolvedModel } from "../lib/models";
import {
  HISTORY_FIELDS,
  MESSAGE_FIELDS,
  type HistoryMessage,
  type StoredMessage,
} from "../lib/messages";
import { SMOOTHING } from "../lib/smoothing";

const submitSchema = z.object({
  content: z.string().min(1),
  mode: z.enum(Mode),
  model: z.string().refine(isSupportedChatModelId, "Unsupported model"),
  reasoning: reasoningSchema.optional(),
  effort: effortSchema.optional(),
});

const submitValidator = zValidator("json", submitSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});

function nextTitle(current: string, content: string): string {
  return current === DEFAULT_SESSION_TITLE ? titleFromMessage(content) : current;
}

function buildConversationHistory(messages: HistoryMessage[]): ModelMessage[] {
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role === "ERROR") return [];

    if (message.role === "USER") {
      return message.content.length > 0 ? [{ role: "user", content: message.content }] : [];
    }

    const parsed = messagePartsSchema.safeParse(message.parts);
    const content: (TextPart | ToolCallPart)[] = [];
    const results: ToolResultPart[] = [];

    for (const part of parsed.success ? parsed.data : []) {
      if (part.type === "text") {
        if (part.text.length > 0) content.push({ type: "text", text: part.text });
        continue;
      }

      if (part.type !== "tool-call" || part.result === undefined) continue;

      content.push({
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.args,
      });
      results.push({
        type: "tool-result",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: { type: "text", value: part.result },
      });
    }

    if (content.length === 0) {
      return message.content.length > 0 ? [{ role: "assistant", content: message.content }] : [];
    }

    return results.length > 0
      ? [
          { role: "assistant", content },
          { role: "tool", content: results },
        ]
      : [{ role: "assistant", content }];
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
      providerOptions: resolved.providerOptions,
      maxOutputTokens: resolved.maxOutputTokens,
      experimental_transform: SMOOTHING,
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

          parts.push({
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args,
          });
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

type ResumePoint = {
  pending: StoredMessage;
  discard: string[];
  history: StoredMessage[];
};

function findResumePoint(messages: StoredMessage[]): ResumePoint | null {
  let end = messages.length;

  while (end > 0) {
    const row = messages[end - 1]!;
    const wreckage =
      row.role === "ERROR" || (row.role === "ASSISTANT" && row.status === "INTERRUPTED");

    if (!wreckage) break;
    end -= 1;
  }

  const pending = messages[end - 1];
  if (!pending || pending.role !== "USER") return null;

  return {
    pending,
    discard: messages.slice(end).map((message) => message.id),
    history: messages.slice(0, end),
  };
}

type Turn = {
  sessionId: string;
  mode: Mode;
  model: string;
  reasoning: Reasoning | null;
  effort: Effort | null;
  history: ModelMessage[];
};

function createMessage(input: {
  sessionId: string;
  role: Role;
  status: MessageStatus;
  model: string;
  mode: Mode;
  reasoning: Reasoning | null;
  effort: Effort | null;
  content: string;
  parts?: MessagePart[] | null;
  duration?: number;
}) {
  return orm.Message.select("id").create(input);
}

async function runAssistantTurn(turn: Turn, stream: SSEStreamingApi): Promise<void> {
  const resolved = resolveChatModel(turn.model, {
    reasoning: turn.reasoning ?? undefined,
    effort: turn.effort,
  });
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
    reasoning: resolved.reasoning,
    effort: resolved.effort,
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
      ? {
          type: "error",
          message: reported ?? "The reply could not be recorded.",
        }
      : { type: "done", messageId, durationMs: duration };

  await sendEvent(stream, terminal);
}

async function streamAssistantReply(turn: Turn, stream: SSEStreamingApi): Promise<void> {
  try {
    await runAssistantTurn(turn, stream);
  } catch (error) {
    console.error("Assistant turn failed outside its own reporting", error);
    if (stream.aborted) return;

    await sendEvent(stream, {
      type: "error",
      message: "The reply could not be completed.",
    }).catch(() => {});
  }
}

const generating = new Set<string>();

function beginTurn(sessionId: string): void {
  if (generating.has(sessionId)) {
    throw new HTTPException(409, { message: "A reply is already streaming for this session" });
  }

  generating.add(sessionId);
}

const app = new Hono()
  .post("/:id/resume", async (c) => {
    const sessionId = c.req.param("id");

    beginTurn(sessionId);

    try {
      const outcome = await db.transaction(async (tx) => {
        const session = await tx.orm.public.Session.select("id")
          .include("messages", (message) =>
            message.select(...MESSAGE_FIELDS).orderBy((m) => m.createdAt.asc()),
          )
          .first({ id: sessionId });

        if (!session) return { kind: "missing" } as const;

        const point = findResumePoint(session.messages);
        if (!point) return { kind: "settled" } as const;
        if (!isSupportedChatModelId(point.pending.model)) {
          return { kind: "unsupported", model: point.pending.model } as const;
        }

        for (const id of point.discard) {
          await tx.orm.public.Message.where({ id }).delete();
        }

        return { kind: "ready", point } as const;
      });

      if (outcome.kind === "missing") {
        throw new HTTPException(404, { message: "Session not found" });
      }

      if (outcome.kind === "settled") {
        throw new HTTPException(409, { message: "Session has no unanswered message to resume" });
      }

      if (outcome.kind === "unsupported") {
        throw new HTTPException(400, {
          message: `Session was recorded with unsupported model ${outcome.model}`,
        });
      }

      const { pending, history } = outcome.point;

      return streamSSE(c, async (stream) => {
        try {
          await streamAssistantReply(
            {
              sessionId,
              mode: pending.mode,
              model: pending.model,
              reasoning: pending.reasoning,
              effort: pending.effort,
              history: buildConversationHistory(history),
            },
            stream,
          );
        } finally {
          generating.delete(sessionId);
        }
      });
    } catch (error) {
      // The stream never opened, so nothing downstream will release the turn.
      generating.delete(sessionId);
      throw error;
    }
  })
  .post("/:id", submitValidator, async (c) => {
    const sessionId = c.req.param("id");
    const { content, mode, model, reasoning, effort } = c.req.valid("json");

    const chatModel = findSupportedChatModel(model);
    if (!chatModel) {
      throw new HTTPException(400, { message: `Unsupported model ${model}` });
    }

    const settings = resolveTurnSettings(chatModel, { reasoning, effort });

    beginTurn(sessionId);

    try {
      const history = await db.transaction(async (tx) => {
        const session = await tx.orm.public.Session.select("id", "title").first({
          id: sessionId,
        });
        if (!session) return null;

        await tx.orm.public.Message.create({
          sessionId,
          role: "USER",
          status: "COMPLETE",
          content,
          model,
          mode,
          reasoning: settings.reasoning,
          effort: settings.effort,
        });

        const title = nextTitle(session.title, content);
        if (title !== session.title) {
          await tx.orm.public.Session.where({ id: sessionId }).update({ title });
        }

        return await tx.orm.public.Message.where({ sessionId })
          .select(...HISTORY_FIELDS)
          .orderBy((m) => m.createdAt.asc())
          .all();
      });

      if (!history) {
        throw new HTTPException(404, { message: "Session not found" });
      }

      return streamSSE(c, async (stream) => {
        try {
          await streamAssistantReply(
            {
              sessionId,
              mode,
              model,
              reasoning: settings.reasoning,
              effort: settings.effort,
              history: buildConversationHistory(history),
            },
            stream,
          );
        } finally {
          generating.delete(sessionId);
        }
      });
    } catch (error) {
      generating.delete(sessionId);
      throw error;
    }
  });

export default app;
