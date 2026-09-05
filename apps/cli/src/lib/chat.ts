import {
  chatStreamEventSchema,
  type ChatStreamEvent,
  type Effort,
  type Reasoning,
  type SupportedChatModelId,
} from "@cattiva/shared";
import type { Mode } from "@cattiva/database/enums";
import { apiClient } from "./apiClient";
import { getErrormessage } from "./httpError";

const FRAME_SEPARATOR = "\n\n";
const DATA_PREFIX = "data:";

function parseFrame(frame: string): ChatStreamEvent | null {
  const data = frame
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith(DATA_PREFIX))
    .map((line) => line.slice(DATA_PREFIX.length).replace(/^ /, ""))
    .join("\n");

  if (data.length === 0) return null;

  try {
    const event = chatStreamEventSchema.safeParse(JSON.parse(data));
    return event.success ? event.data : null;
  } catch {
    return null;
  }
}
export async function* readChatStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf(FRAME_SEPARATOR);
      while (boundary !== -1) {
        const event = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + FRAME_SEPARATOR.length);

        if (event) yield event;
        boundary = buffer.indexOf(FRAME_SEPARATOR);
      }
    }
    const trailing = parseFrame(buffer);
    if (trailing) yield trailing;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export type ChatTurnRequest = {
  sessionId: string;
  content: string;
  mode: Mode;
  model: SupportedChatModelId;
  reasoning: Reasoning;
  effort: Effort | null;
  signal?: AbortSignal;
};

export async function* streamChatTurn({
  sessionId,
  content,
  mode,
  model,
  reasoning,
  effort,
  signal,
}: ChatTurnRequest): AsyncGenerator<ChatStreamEvent> {
  const res = await apiClient.chat[":id"].$post(
    {
      param: { id: sessionId },
      json: { content, mode, model, reasoning, ...(effort === null ? {} : { effort }) },
    },
    { init: { signal } },
  );

  if (!res.ok) {
    throw new Error(await getErrormessage(res));
  }

  if (!res.body) {
    throw new Error("The server sent an empty response");
  }

  yield* readChatStream(res.body);
}

export type ResumeTurnRequest = {
  sessionId: string;
  signal?: AbortSignal;
};

export async function* resumeChatTurn({
  sessionId,
  signal,
}: ResumeTurnRequest): AsyncGenerator<ChatStreamEvent> {
  const res = await apiClient.chat[":id"].resume.$post(
    { param: { id: sessionId } },
    { init: { signal } },
  );

  if (res.status === 409) return;

  if (!res.ok) {
    throw new Error(await getErrormessage(res));
  }

  if (!res.body) {
    throw new Error("The server sent an empty response");
  }

  yield* readChatStream(res.body);
}
