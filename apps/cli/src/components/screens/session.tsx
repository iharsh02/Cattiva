import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { z } from "zod";
import type { InferResponseType } from "hono";
import { BotMessage, ErrorMessage, UserMessage } from "@/components/chat";
import { apiClient } from "@/lib/apiClient";
import { streamChatTurn } from "@/lib/chat";
import { fetchSession } from "@/lib/sessions";
import { useModel } from "@/providers/model";
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
  pending: z.string().optional(),
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
  const { model } = useModel();

  const handoff = useMemo(() => {
    const parsed = sessionLocationSchema.safeParse(location.state);
    return parsed.success ? parsed.data : null;
  }, [location.state]);

  const prefetched = handoff?.session ?? null;

  const [messages, setMessages] = useState<SessionMessage[]>(prefetched?.messages ?? []);
  /** The assistant turn in flight, as far as it has streamed. Null when nothing is running. */
  const [reply, setReply] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(prefetched !== null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const localIdRef = useRef(0);

  useEffect(() => {
    if (!id) {
      navigate("/", { replace: true });
      return;
    }

    setError(null);

    if (prefetched) {
      setMessages(prefetched.messages ?? []);
      setLoaded(true);
      return;
    }

    setLoaded(false);

    let ignore = false;

    const load = async () => {
      try {
        const data = await fetchSession(id);
        if (ignore) return;

        setMessages(data.messages);
        setLoaded(true);
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

  /** Leaving mid-turn hangs up the stream; the server keeps the partial reply. */
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      if (!id || abortRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;

      localIdRef.current += 1;

      setError(null);
      setReply("");
      setMessages((current) => [
        ...current,
        {
          id: `local-${localIdRef.current}`,
          role: "USER",
          content: text,
          model: model.id,
        },
      ]);

      let assistant = "";

      const commit = (messageId: string) => {
        if (assistant.length === 0) return;

        setMessages((current) => [
          ...current,
          { id: messageId, role: "ASSISTANT", content: assistant, model: model.id },
        ]);
      };

      try {
        for await (const event of streamChatTurn(id, text, model.id, controller.signal)) {
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
              commit(`local-${localIdRef.current}-partial`);
              setReply(null);
              setError(event.message);
              break;

            // Reasoning and tool calls stream, but nothing renders them yet.
            default:
              break;
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to send message");
        }
      } finally {
        abortRef.current = null;
        setReply(null);
      }
    },
    [id, model.id],
  );

  const pending = handoff?.pending;
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!id || !pending || pendingRef.current) return;

    pendingRef.current = true;
    void send(pending);
  }, [id, pending, send]);

  const streaming = reply !== null;

  return (
    <SessionShell
      onSubmit={(text) => void send(text)}
      onCancel={() => navigate("/")}
      inputDisabled={!loaded || streaming}
      loading={(!loaded && error === null) || streaming}
    >
      {messages.map((msg) => (
        <MessageView key={msg.id} msg={msg} />
      ))}
      {reply ? <BotMessage content={reply} model={model.id} /> : null}
      {error ? <ErrorMessage message={error} /> : null}
    </SessionShell>
  );
}
