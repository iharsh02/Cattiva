import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { z } from "zod";
import type { InferResponseType } from "hono";
import { BotMessage, ErrorMessage, UserMessage } from "@/components/chat";
import { apiClient } from "@/lib/apiClient";
import { fetchSession, sendMessage } from "@/lib/sessions";
import { SessionShell } from "./session-shell";

type SessionData = InferResponseType<(typeof apiClient.sessions)[":id"]["$get"], 200>;

type SessionMessage = {
  id: string;
  role: string;
  content: string;
  model: string;
};

const sessionLocationSchema = z.object({
  session: z.custom<SessionData>((val) => val != null && typeof val === "object" && "id" in val),
});

function MessageView({ msg }: { msg: SessionMessage }) {
  if (msg.role === "USER") {
    return <UserMessage message={msg.content} />;
  }
  if (msg.role === "ERROR") {
    return <ErrorMessage message={msg.content} />;
  }

  return <BotMessage content={msg.content} model={msg.model} />;
}

export function Session() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const prefetched = useMemo(() => {
    const parsed = sessionLocationSchema.safeParse(location.state);
    return parsed.success ? parsed.data.session : null;
  }, [location.state]);

  const [session, setSession] = useState<SessionData | null>(prefetched);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) {
      navigate("/", { replace: true });
      return;
    }

    setError(null);

    if (prefetched) {
      setSession(prefetched);
      return;
    }

    setSession(null);

    let ignore = false;

    const load = async () => {
      try {
        const data = await fetchSession(id);
        if (ignore) return;
        setSession(data);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load session");
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [id, prefetched, navigate]);

  const handleSubmit = useCallback(
    (text: string) => {
      if (!id) return;

      setSending(true);
      setError(null);

      const send = async () => {
        try {
          await sendMessage(id, text);
          setSession(await fetchSession(id));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to send message");
        } finally {
          setSending(false);
        }
      };

      void send();
    },
    [id],
  );

  const loading = (session === null && error === null) || sending;

  const messages: SessionMessage[] = session?.messages ?? [];

  return (
    <SessionShell
      onSubmit={handleSubmit}
      onCancel={() => navigate("/")}
      inputDisabled={session === null || sending}
      loading={loading}
    >
      {messages.map((msg) => (
        <MessageView key={msg.id} msg={msg} />
      ))}
      {error ? <ErrorMessage message={error} /> : null}
    </SessionShell>
  );
}
