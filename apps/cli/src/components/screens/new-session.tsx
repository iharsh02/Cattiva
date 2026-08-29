import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { ErrorMessage, UserMessage, BotMessage } from "@/components/chat";
import { SessionShell } from "./session-shell";

export function NewSession() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as { message?: string } | null;

  useEffect(() => {
    if (!state?.message) {
      navigate("/", { replace: true });
    }
  }, [state, navigate]);

  if (!state?.message) return null;

  return (
    <SessionShell onSubmit={() => {}} inputDisabled loading>
      <UserMessage message={state.message} />
      <BotMessage
        content="This is sa smaple bot response to test message layout"
        model="opus-5"
        usage={{ input: 12480, output: 940 }}
      />
      <ErrorMessage message="This is a  sample error message." />
    </SessionShell>
  );
}
