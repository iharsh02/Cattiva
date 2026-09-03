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
import { streamChatTurn } from "@/lib/chat";
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const { model, reasoning } = useModel();

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
  const runOwned = useCallback((work: (owns: () => boolean) => Promise<void>) => {
    const generation = generationRef.current;
    const owns = () => generationRef.current === generation;

    busyRef.current = true;
    setBusy(true);

    void (async () => {
      try {
        await work(owns);
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

  const send = useCallback(
    (text: string) => {
      if (busyRef.current) return;

      setError(null);
      setMessages((current) => [
        ...current,
        { id: localId("user"), role: "USER", content: text, model: model.id },
      ]);

      runOwned(async (owns) => {
        const controller = new AbortController();
        abortRef.current = controller;

        let assistant = "";

        const commit = (messageId: string) => {
          if (assistant.length === 0 || !owns()) return;

          setMessages((current) => [
            ...current,
            { id: messageId, role: "ASSISTANT", content: assistant, model: model.id },
          ]);
        };

        try {
          let id = sessionIdRef.current;

          if (!id) {
            const created = await createSession();
            if (!owns()) return;

            id = created.id;
            sessionIdRef.current = id;
            setSessionId(id);
          }

          if (owns()) setReply("");

          for await (const event of streamChatTurn({
            sessionId: id,
            content: text,
            model: model.id,
            reasoning,
            signal: controller.signal,
          })) {
            if (!owns()) return;

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
      });
    },
    [localId, model.id, reasoning, runOwned],
  );

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

      runOwned(async (owns) => {
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
    () => ({ sessionId, messages, reply, busy, error, send, reset, load }),
    [sessionId, messages, reply, busy, error, send, reset, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
