import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { conversationRows, type CattivaUIMessage } from "@cattiva/shared";
import { useChat, type UseChat } from "@/hooks/use-chat";
import { fetchSession } from "@/lib/sessions";

type SessionControls = {
  sessionId: string | null;

  reset: () => void;
  load: (id: string) => void;
};

export interface SessionContextValue extends UseChat, SessionControls {}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider");
  }

  return value;
}

type OpenSession = { id: string; messages: CattivaUIMessage[] };

function opening(error: Error | undefined): UseChat {
  return {
    messages: [],
    busy: error === undefined,
    interrupted: false,
    error,
    send: () => {},
    stop: () => {},
    resume: async () => false,
    approve: () => {},
  };
}

function ChatScope({
  session,
  controls,
  children,
}: {
  session: OpenSession;
  controls: SessionControls;
  children: ReactNode;
}) {
  const chat = useChat(session.id, session.messages);
  const value = useMemo<SessionContextValue>(() => ({ ...chat, ...controls }), [chat, controls]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function asError(cause: unknown, fallback: string): Error {
  return cause instanceof Error ? cause : new Error(fallback);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<OpenSession | null>(null);
  const [failure, setFailure] = useState<Error | undefined>(undefined);

  const reset = useCallback(() => {
    setFailure(undefined);
    setSession({ id: crypto.randomUUID(), messages: [] });
  }, []);

  const load = useCallback((id: string) => {
    setSession(null);
    setFailure(undefined);

    void fetchSession(id)
      .then((data) => setSession({ id, messages: conversationRows(data.messages) }))
      .catch((cause: unknown) => setFailure(asError(cause, "Could not open that session")));
  }, []);

  useEffect(() => reset(), [reset]);

  const controls = useMemo(
    () => ({ sessionId: session?.id ?? null, reset, load }),
    [session?.id, reset, load],
  );

  if (!session) {
    return (
      <SessionContext.Provider value={{ ...opening(failure), ...controls }}>
        {children}
      </SessionContext.Provider>
    );
  }

  return (
    <ChatScope key={session.id} session={session} controls={controls}>
      {children}
    </ChatScope>
  );
}
