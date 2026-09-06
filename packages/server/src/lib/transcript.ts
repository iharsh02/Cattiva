import { getToolName, isToolUIPart, safeValidateUIMessages } from "ai";
import {
  ALL_TOOL_NAMES,
  buildToolContracts,
  conversationRows,
  type CattivaUIMessage,
  type StoredMessageRow,
  type ToolName,
} from "@cattiva/shared";

const STALE_APPROVAL_STATES = new Set(["input-streaming", "input-available"]);

const ANSWERED_TOOL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
  "approval-responded",
]);

export type Transcript = { ok: true; messages: CattivaUIMessage[] } | { ok: false; reason: string };

function brief(error: Error): string {
  return error.message.replace(/\s+/g, " ").slice(0, 300);
}

function sanitizeToolParts(message: CattivaUIMessage): CattivaUIMessage {
  return {
    ...message,
    parts: message.parts.flatMap((part): CattivaUIMessage["parts"] => {
      if (!isToolUIPart(part)) return [part];

      if (!ALL_TOOL_NAMES.includes(getToolName(part) as ToolName)) {
        console.warn("Dropping a call to an unknown tool", {
          messageId: message.id,
          tool: getToolName(part),
        });
        return [];
      }

      if (!STALE_APPROVAL_STATES.has(part.state) || !("approval" in part)) return [part];

      const { approval: _approval, ...rest } = part as typeof part & { approval: unknown };
      return [rest as CattivaUIMessage["parts"][number]];
    }),
  };
}

function settleToolParts(message: CattivaUIMessage): CattivaUIMessage {
  const parts: CattivaUIMessage["parts"] = [];

  for (const part of message.parts) {
    if (!isToolUIPart(part) || ANSWERED_TOOL_STATES.has(part.state)) {
      parts.push(part);
      continue;
    }

    console.warn("Closing an unanswered tool call", {
      messageId: message.id,
      toolCallId: part.toolCallId,
      tool: getToolName(part),
      state: part.state,
    });

    if (part.state === "input-streaming") continue;

    const approval = "approval" in part ? part.approval : undefined;

    parts.push(
      (approval
        ? {
            type: part.type,
            toolCallId: part.toolCallId,
            input: part.input,
            state: "output-denied",
            approval: { id: approval.id, approved: false },
          }
        : {
            type: part.type,
            toolCallId: part.toolCallId,
            input: part.input,
            state: "output-error",
            errorText: "The tool never reported a result; the turn ended first.",
          }) as CattivaUIMessage["parts"][number],
    );
  }

  return { ...message, parts };
}

async function keepValidParts(message: CattivaUIMessage): Promise<CattivaUIMessage | null> {
  const parts: CattivaUIMessage["parts"] = [];

  for (const part of message.parts) {
    const probe = await safeValidateUIMessages<CattivaUIMessage>({
      messages: [{ id: message.id, role: message.role, parts: [part] }],
      tools: buildToolContracts,
    });

    if (probe.success) {
      parts.push(part);
      continue;
    }

    console.error("Dropping an invalid message part", {
      messageId: message.id,
      part: JSON.stringify(part).slice(0, 800),
      error: brief(probe.error),
    });
  }

  return parts.length === 0 ? null : { ...message, parts };
}

async function dropInvalidParts(messages: CattivaUIMessage[]): Promise<CattivaUIMessage[]> {
  const kept = await Promise.all(messages.map(keepValidParts));
  return kept.filter((message): message is CattivaUIMessage => message !== null);
}

function mergeIncoming(
  history: CattivaUIMessage[],
  incoming: readonly CattivaUIMessage[],
): CattivaUIMessage[] {
  const merged = [...history];

  for (const message of incoming) {
    const index = merged.findIndex((candidate) => candidate.id === message.id);
    if (index === -1) merged.push(message);
    else merged[index] = message;
  }

  return merged;
}

function withoutEmpty(messages: CattivaUIMessage[]): CattivaUIMessage[] {
  return messages.filter((message) => {
    if (message.parts.length > 0) return true;

    console.warn("Dropping a message left with no parts", { messageId: message.id });
    return false;
  });
}

async function validate(messages: CattivaUIMessage[]) {
  return await safeValidateUIMessages<CattivaUIMessage>({
    messages,
    tools: buildToolContracts,
  });
}

/**
 * Reasoning is kept in storage and in what the client renders, but for providers that
 * do not verify thinking blocks it is dead weight re-sent on every step of a turn.
 * A message left with nothing but reasoning drops out entirely.
 */
export function withoutReasoning(messages: readonly CattivaUIMessage[]): CattivaUIMessage[] {
  return messages.flatMap((message) => {
    const parts = message.parts.filter((part) => part.type !== "reasoning");
    return parts.length === message.parts.length
      ? [message]
      : parts.length === 0
        ? []
        : [{ ...message, parts }];
  });
}

export async function replayableTranscript(
  rows: readonly StoredMessageRow[],
  incoming: readonly CattivaUIMessage[],
): Promise<Transcript> {
  const incomingIds = new Set(incoming.map((message) => message.id));
  const merged = mergeIncoming(conversationRows(rows), incoming).map(sanitizeToolParts);

  const inFlight = merged.at(-1);
  const settledMessages = withoutEmpty(
    merged.map((message) =>
      message === inFlight && incomingIds.has(message.id) ? message : settleToolParts(message),
    ),
  );

  if (settledMessages.length === 0) return { ok: false, reason: "nothing left to send" };

  const validated = await validate(settledMessages);
  if (validated.success) return { ok: true, messages: validated.data };

  console.error("Transcript failed validation; repairing", { error: brief(validated.error) });

  const salvaged = await validate(withoutEmpty(await dropInvalidParts(settledMessages)));
  if (!salvaged.success) return { ok: false, reason: brief(salvaged.error) };
  if (salvaged.data.length === 0) return { ok: false, reason: "repair left nothing to send" };

  return { ok: true, messages: salvaged.data };
}
