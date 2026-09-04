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
import { createSession, fetchSession } from "@/lib/sessions";
import { useModel } from "@/providers/model";

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  model: string;
};

export type SessionContextValue = {
  sessionId: string | null;
  messages: ChatMessage[];
  reply: string | null;
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

/** Ids the server has never seen; only a locally committed partial carries one. */
const LOCAL_ID_PREFIX = "local-";

/**
 * Drops the trailing half-reply a failed turn left behind. The rule stands on its own —
 * a locally-invented assistant message is one the server never acknowledged, and a resume
 * always answers afresh rather than continuing it, so it can never become part of the
 * transcript. It is not a copy of the server's own discard rule, which works off row status
 * that the client cannot see.
 *
 * Without this the abandoned text sits on screen above its own replacement and reads as the
 * model having answered twice.
 */
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
  const { mode, model, reasoning } = useModel();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<string | null>(null);
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
  }, []);

  /**
   * Runs one exclusive piece of session work. The `owns` it hands the caller goes false the
   * moment the conversation is cleared or switched underneath it, so a late reply cannot
   * write into whatever is on screen now; busy is claimed for the run and released only by a
   * run that still owns the view.
   */
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
        }
      }
    })();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const localId = useCallback((suffix: string) => {
    localIdRef.current += 1;
    return `local-${localIdRef.current}-${suffix}`;
  }, []);

  /**
   * Draws one turn, whatever opened it. Sending and resuming differ only in how the stream
   * starts, so everything after that — the growing reply, the commit, aborting — lives here
   * once. Answers whether the stream produced anything at all.
   */
  const runTurn = useCallback(
    async (
      open: (signal: AbortSignal) => AsyncGenerator<ChatStreamEvent>,
      owns: () => boolean,
    ): Promise<boolean> => {
      const controller = new AbortController();
      abortRef.current = controller;

      let assistant = "";
      let streamed = false;

      const commit = (messageId: string) => {
        if (assistant.length === 0 || !owns()) return;

        setMessages((current) => [
          ...current,
          { id: messageId, role: "ASSISTANT", content: assistant, model: model.id },
        ]);
      };

      try {
        if (owns()) setReply("");

        for await (const event of open(controller.signal)) {
          if (!owns()) return streamed;
          streamed = true;

          switch (event.type) {
            case "text-delta":
              assistant += event.text;
              setReply(assistant);
              break;

            case "done":
              commit(event.messageId);
              setReply(null);
              break;

            case "error":
              // Whatever arrived before the failure is kept, as the server keeps it.
              commit(localId("partial"));
              setReply(null);
              setError(event.message);
              break;

            // Reasoning and tool calls stream, but nothing renders them yet.
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
              signal,
            }),
          owns,
        );
      });
    },
    [localId, mode, model.id, reasoning, runOwned, runTurn],
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

          setMessages(data.messages);
        } catch (err) {
          if (owns()) setError(errorText(err, "Failed to load session"));
        }
      });
    },
    [discardInFlight, runOwned],
  );

  const value = useMemo(
    () => ({ sessionId, messages, reply, busy, error, send, resume, reset, load }),
    [sessionId, messages, reply, busy, error, send, resume, reset, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
