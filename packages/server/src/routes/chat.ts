import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  convertToModelMessages,
  isToolUIPart,
  streamText,
  getToolName,
  type LanguageModelUsage,
} from "ai";
import { db, orm } from "@cattiva/database";
import { Mode } from "@cattiva/database/enums";
import {
  buildToolContracts,
  DEFAULT_SESSION_TITLE,
  effortSchema,
  modePolicy,
  reasoningSchema,
  textFromMessage,
  titleFromMessage,
  type CattivaUIMessage,
} from "@cattiva/shared";
import { isSupportedChatModelId, resolveChatModel } from "../lib/models";
import { MESSAGE_FIELDS } from "../lib/messages";
import { saveMessage, type TurnSettings } from "../lib/persist";
import { replayableTranscript, withoutReasoning } from "../lib/transcript";
import { buildSystemPrompt } from "../system-prompt";
import { SMOOTHING } from "../lib/smoothing";

const LOCAL_USER_ID = "local";

const submitSchema = z.object({
  id: z.string(),
  messages: z
    .array(
      z.custom<CattivaUIMessage>(
        (value) => value != null && typeof value === "object" && "id" in value && "parts" in value,
      ),
    )
    .min(1),
  cwd: z.string().optional(),
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

const app = new Hono().post("/", submitValidator, async (c) => {
  const { id, cwd, messages, mode, model, reasoning, effort } = c.req.valid("json");

  const policy = modePolicy(mode);
  const resolved = resolveChatModel(model, { reasoning, effort });

  const settled: TurnSettings = {
    mode,
    model: resolved.modelId,
    reasoning: resolved.reasoning,
    effort: resolved.effort,
  };

  const session = await db.transaction(async (tx) => {
    const found = await tx.orm.public.Session.select("id", "title", "cwd").first({ id });

    if (!found) {
      const created = await tx.orm.public.Session.select("id", "title", "cwd").create({
        id,
        userId: LOCAL_USER_ID,
        title: DEFAULT_SESSION_TITLE,
        cwd: cwd ?? null,
      });

      return { ...created, rows: [] };
    }

    if (cwd !== undefined && cwd !== found.cwd) {
      await tx.orm.public.Session.where({ id }).update({ cwd });
    }

    const rows = await tx.orm.public.Message.where({ sessionId: id })
      .select(...MESSAGE_FIELDS)
      .orderBy((m) => m.createdAt.asc())
      .all();

    return { ...found, cwd: cwd ?? found.cwd, rows };
  });

  const transcript = await replayableTranscript(session.rows, messages);

  if (!transcript.ok) {
    console.error("Transcript unreplayable", { sessionId: id, reason: transcript.reason });
    throw new HTTPException(422, {
      message: "This conversation can no longer be replayed. Start a new one with /new.",
    });
  }

  const nextMessages = transcript.messages;
  const incomingIds = new Set(messages.map((message) => message.id));

  for (const message of nextMessages.filter((candidate) => incomingIds.has(candidate.id))) {
    await saveMessage(id, message, settled, "COMPLETE");
  }

  const title = titleFromMessage(textFromMessage(messages[0]!));
  if (session.title === DEFAULT_SESSION_TITLE && title.length > 0) {
    await orm.Session.where({ id }).update({ title });
  }

  const startedAt = Date.now();
  let usage: LanguageModelUsage | null = null;

  const result = streamText({
    model: resolved.model,
    system: buildSystemPrompt({ mode, cwd: session.cwd }),
    messages: await convertToModelMessages(
      resolved.replaysReasoning ? nextMessages : withoutReasoning(nextMessages),
      { tools: buildToolContracts },
    ),
    tools: buildToolContracts,
    activeTools: policy.activeTools,
    toolApproval: policy.approvals,

    abortSignal: c.req.raw.signal,

    providerOptions: resolved.providerOptions,
    maxOutputTokens: resolved.maxOutputTokens,
    experimental_transform: SMOOTHING,
    onFinish(event) {
      usage = event.totalUsage;
    },
  });

  return result.toUIMessageStreamResponse<CattivaUIMessage>({
    originalMessages: nextMessages,
    consumeSseStream({ stream }) {
      void stream.pipeTo(new WritableStream()).catch(() => {});
    },
    messageMetadata({ part }) {
      if (part.type === "start") return settled;
      if (part.type !== "finish") return undefined;

      return {
        ...settled,
        durationMs: Date.now() - startedAt,
        ...(usage ? { usage } : {}),
      };
    },
    async onFinish(event) {
      const toolParts = event.responseMessage.parts.filter(isToolUIPart);
      if (toolParts.length > 0) {
        console.info("Recording a turn with tool calls", {
          messageId: event.responseMessage.id,
          aborted: event.isAborted,
          tools: toolParts.map((part) => ({
            toolCallId: part.toolCallId,
            tool: getToolName(part),
            state: part.state,
          })),
        });
      }

      await saveMessage(
        id,
        event.responseMessage,
        settled,
        event.isAborted ? "INTERRUPTED" : "COMPLETE",
        Date.now() - startedAt,
      );
    },
    onError(error) {
      return error instanceof Error ? error.message : String(error);
    },
  });
});

export default app;
