import { useCallback } from "react";
import { useNavigate } from "react-router";
import { Header } from "@/components/chrome/header";
import { InputBar } from "@/components/prompt/input-bar";
import { StatusBar } from "@/components/chrome/status-bar";

export function Home() {
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    (text: string) => {
      navigate("/sessions/new", { state: { message: text } });
    },
    [navigate],
  );

  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      <box flexDirection="column" padding={1} gap={1}>
        <Header />
        <StatusBar />
      </box>
      <InputBar onSubmit={handleSubmit} />
    </box>
  );
}
