import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ErrorMessage, UserMessage } from "@/components/chat";
import { SessionShell } from "./session-shell";
import { useToast } from "@/providers/toast";
import { createSession } from "@/lib/sessions";
import { z } from "zod";
const newSessionStateSchema = z.object({
  message: z.string(),
});

export function NewSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasStartedRef = useRef(false);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const state = useMemo(() => {
    const parsed = newSessionStateSchema.safeParse(location.state);

    return parsed.success ? parsed.data : null;
  }, [location.state]);

  useEffect(() => {
    if (!state?.message) {
      navigate("/", { replace: true });
    }
  }, [state, navigate]);

  useEffect(() => {
    if (!state || hasStartedRef.current) return;

    hasStartedRef.current = true;
    let ignore = false;

    const start = async () => {
      try {
        const session = await createSession();

        if (ignore) return;

        toast.show({ variant: "success", message: "Session created" });
        navigate(`/sessions/${session.id}`, {
          replace: true,
          state: { session, pending: state.message },
        });
      } catch (err) {
        if (ignore) return;

        const message = err instanceof Error ? err.message : "Failed to create session";
        setError(message);
        toast.show({ variant: "error", message });
      }
    };

    void start();

    // A late reply must not navigate or toast after the screen is gone.
    return () => {
      ignore = true;
    };
  }, [state, navigate, toast]);

  if (!state?.message) return null;

  return (
    <SessionShell
      onSubmit={() => {}}
      onCancel={() => navigate("/")}
      inputDisabled
      loading={error === null}
    >
      <UserMessage message={state.message} />
      {error ? <ErrorMessage message={error} /> : null}
    </SessionShell>
  );
}
