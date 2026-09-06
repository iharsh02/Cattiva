import { useCallback, useMemo } from "react";
import { useChat as useSdkChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ToolUIPart,
} from "ai";
import type { CattivaUIMessage, CattivaUIPart, ToolName } from "@cattiva/shared";
import { apiClient } from "@/lib/apiClient";
import { debugLog } from "@/lib/log";
import { executeLocalTool } from "@/lib/local-tools";
import { useModel } from "@/providers/model";

export type UseChat = {
  messages: CattivaUIMessage[];
  busy: boolean;
  error: Error | undefined;
  send: (text: string) => void;
  resume: () => Promise<boolean>;
  approve: (toolCallId: string, approved: boolean) => void;
};

const MAX_TOOL_STEPS = 30;

const MAX_IDENTICAL_CALLS = 3;

type ToolPart = Extract<CattivaUIPart, ToolUIPart>;

function toolSignature(part: ToolPart): string {
  return `${getToolName(part)}:${JSON.stringify(part.input)}`;
}

function shouldContinue(messages: CattivaUIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return true;

  const calls = last.parts.filter((part): part is ToolPart => isToolUIPart(part));

  if (calls.length >= MAX_TOOL_STEPS) {
    debugLog("loop.capped", { messageId: last.id, calls: calls.length });
    return false;
  }

  const latest = calls.at(-1);
  if (!latest) return true;

  const signature = toolSignature(latest);
  const earlier = calls.slice(0, -1).filter((part) => toolSignature(part) === signature);

  if (earlier.some((part) => part.state === "output-error")) {
    debugLog("loop.retry", { messageId: last.id, tool: getToolName(latest) });
    return false;
  }

  if (earlier.length >= MAX_IDENTICAL_CALLS - 1) {
    debugLog("loop.repeat", {
      messageId: last.id,
      tool: getToolName(latest),
      seen: earlier.length,
    });
    return false;
  }

  return true;
}

function needsAnswer(messages: CattivaUIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last) return false;
  if (last.role === "user") return true;

  return last.parts.length === 0 || last.metadata?.status === "INTERRUPTED";
}

export function useChat(sessionId: string, initialMessages: CattivaUIMessage[]): UseChat {
  const { mode, model, reasoning, effort } = useModel();

  const transport = useMemo(
    () =>
      new DefaultChatTransport<CattivaUIMessage>({
        api: apiClient.chat.$url().toString(),
        prepareSendMessagesRequest({ messages }) {
          return {
            body: {
              id: sessionId,
              cwd: process.cwd(),
              messages,
              mode,
              model: model.id,
              ...(reasoning === null ? {} : { reasoning }),
              ...(effort === null ? {} : { effort }),
            },
          };
        },
      }),
    [sessionId, mode, model.id, reasoning, effort],
  );

  const chat = useSdkChat<CattivaUIMessage>({
    onError: (error) => debugLog("chat.error", { message: error.message }),
    id: sessionId,
    messages: initialMessages,
    transport,
    onToolCall({ toolCall }) {
      const tool = toolCall.toolName as ToolName;
      const toolCallId = toolCall.toolCallId;

      debugLog("tool.start", { tool, toolCallId, mode });

      void executeLocalTool(tool, toolCall.input, mode)
        .then((output) => {
          debugLog("tool.output", { tool, toolCallId });
          chat.addToolOutput({ tool, toolCallId, output });
        })
        .catch((error: unknown) => {
          const errorText = error instanceof Error ? error.message : String(error);
          debugLog("tool.error", { tool, toolCallId, errorText });
          chat.addToolOutput({ tool, toolCallId, state: "output-error", errorText });
        });
    },
    onFinish({ message }) {
      for (const part of message.parts) {
        if (isToolUIPart(part)) {
          debugLog("tool.state", {
            tool: getToolName(part),
            toolCallId: part.toolCallId,
            state: part.state,
          });
        }
      }
    },
    sendAutomaticallyWhen: (options) =>
      shouldContinue(options.messages) &&
      (lastAssistantMessageIsCompleteWithToolCalls(options) ||
        lastAssistantMessageIsCompleteWithApprovalResponses(options)),
  });

  const send = useCallback(
    (text: string) => {
      void chat.sendMessage({ text });
    },
    [chat],
  );

  const resume = useCallback(async () => {
    if (!needsAnswer(chat.messages)) return false;

    await chat.regenerate();
    return true;
  }, [chat]);

  const approve = useCallback(
    (approvalId: string, approved: boolean) => {
      debugLog("tool.approval", { approvalId, approved });
      chat.addToolApprovalResponse({ id: approvalId, approved });
    },
    [chat],
  );

  return useMemo(
    () => ({
      messages: chat.messages,
      busy: chat.status === "submitted" || chat.status === "streaming",
      error: chat.error,
      send,
      resume,
      approve,
    }),
    [chat.messages, chat.status, chat.error, send, resume, approve],
  );
}
