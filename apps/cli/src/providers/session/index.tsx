import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ChatStreamEvent } from "@cattiva/shared";
import { resumeChatTurn, streamChatTurn } from "@/lib/chat";
import { thinkingFromParts } from "@/lib/parts";
import { createSession, fetchSession } from "@/lib/sessions";
import { useModel } from "@/providers/model";

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  model: string;
  thinking?: string;
};

export type SessionContextValue = {
  sessionId: string | null;
  messages: ChatMessage[];
  reply: string | null;
  thinking: string | null;
  busy: boolean;
  error: string | null;
  send: (text: string) => void;
  resume: () => Promise<boolean>;
  reset: () => void;
  load: (id: string) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider");
  }

  return value;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const LOCAL_ID_PREFIX = "local-";

function withoutAbandonedReply(messages: ChatMessage[]): ChatMessage[] {
  let end = messages.length;

  while (end > 0) {
    const message = messages[end - 1]!;
    if (message.role !== "ASSISTANT" || !message.id.startsWith(LOCAL_ID_PREFIX)) break;
    end -= 1;
  }

  return end === messages.length ? messages : messages.slice(0, end);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { mode, model, reasoning, effort } = useModel();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [thinking, setThinking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const localIdRef = useRef(0);

  const generationRef = useRef(0);

  const discardInFlight = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    setBusy(false);
    setReply(null);
    setThinking(null);
  }, []);

  const runOwned = useCallback(<T,>(work: (owns: () => boolean) => Promise<T>): Promise<T> => {
    const generation = generationRef.current;
    const owns = () => generationRef.current === generation;

    busyRef.current = true;
    setBusy(true);

    return (async () => {
      try {
        return await work(owns);
      } finally {
        if (owns()) {
          busyRef.current = false;
          setBusy(false);
          setReply(null);
          setThinking(null);
        }
      }
    })();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const localId = useCallback((suffix: string) => {
    localIdRef.current += 1;
    return `local-${localIdRef.current}-${suffix}`;
  }, []);

  const runTurn = useCallback(
    async (
      open: (signal: AbortSignal) => AsyncGenerator<ChatStreamEvent>,
      owns: () => boolean,
    ): Promise<boolean> => {
      const controller = new AbortController();
      abortRef.current = controller;

      let assistant = "";
      let thought = "";
      let streamed = false;

      const commit = (messageId: string) => {
        if ((assistant.length === 0 && thought.length === 0) || !owns()) return;

        setMessages((current) => [
          ...current,
          {
            id: messageId,
            role: "ASSISTANT",
            content: assistant,
            model: model.id,
            thinking: thought.length > 0 ? thought : undefined,
          },
        ]);
      };

      try {
        if (owns()) {
          setReply("");
          setThinking(null);
        }

        for await (const event of open(controller.signal)) {
          if (!owns()) return streamed;
          streamed = true;

          switch (event.type) {
            case "text-delta":
              assistant += event.text;
              setReply(assistant);
              break;

            case "reasoning-delta":
              thought += event.text;
              setThinking(thought);
              break;

            case "done":
              commit(event.messageId);
              setReply(null);
              setThinking(null);
              break;

            case "error":
              // Whatever arrived before the failure is kept, as the server keeps it.
              commit(localId("partial"));
              setReply(null);
              setThinking(null);
              setError(event.message);
              break;

            // Tool calls stream, but nothing renders them yet.
            default:
              break;
          }
        }
      } catch (err) {
        if (owns() && !controller.signal.aborted) {
          setError(errorText(err, "Failed to send message"));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }

      return streamed;
    },
    [localId, model.id],
  );

  const send = useCallback(
    (text: string) => {
      if (busyRef.current) return;

      setError(null);
      setMessages((current) => [
        ...current,
        { id: localId("user"), role: "USER", content: text, model: model.id },
      ]);

      void runOwned(async (owns) => {
        let id = sessionIdRef.current;

        if (!id) {
          const created = await createSession();
          if (!owns()) return false;

          id = created.id;
          sessionIdRef.current = id;
          setSessionId(id);
        }

        const target = id;

        return await runTurn(
          (signal) =>
            streamChatTurn({
              sessionId: target,
              content: text,
              mode,
              model: model.id,
              reasoning,
              effort,
              signal,
            }),
          owns,
        );
      });
    },
    [localId, mode, model.id, reasoning, effort, runOwned, runTurn],
  );

  const resume = useCallback(async (): Promise<boolean> => {
    if (busyRef.current) return false;

    const id = sessionIdRef.current;
    if (!id) return false;

    setMessages(withoutAbandonedReply);
    setError(null);

    return await runOwned((owns) =>
      runTurn((signal) => resumeChatTurn({ sessionId: id, signal }), owns),
    );
  }, [runOwned, runTurn]);

  const reset = useCallback(() => {
    discardInFlight();
    sessionIdRef.current = null;
    setSessionId(null);
    setMessages([]);
    setError(null);
  }, [discardInFlight]);

  const load = useCallback(
    (id: string) => {
      discardInFlight();

      sessionIdRef.current = id;
      setSessionId(id);
      setMessages([]);
      setError(null);

      void runOwned(async (owns) => {
        try {
          const data = await fetchSession(id);
          if (!owns()) return;

          setMessages(
            data.messages.map((message): ChatMessage => ({
              id: message.id,
              role: message.role,
              content: message.content,
              model: message.model,
              thinking: thinkingFromParts(message.parts),
            })),
          );
        } catch (err) {
          if (owns()) setError(errorText(err, "Failed to load session"));
        }
      });
    },
    [discardInFlight, runOwned],
  );

  const value = useMemo(
    () => ({ sessionId, messages, reply, thinking, busy, error, send, resume, reset, load }),
    [sessionId, messages, reply, thinking, busy, error, send, resume, reset, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
