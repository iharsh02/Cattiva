import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { BotMessage, ErrorMessage, ThinkingBlock, UserMessage } from "@/components/chat";
import { Header } from "@/components/banner/header";
import { StatusBar } from "@/components/banner/status-bar";
import { InputBar } from "@/components/prompt/input-bar";
import { Spinner } from "@/components/spinner";
import { LAYER, useKeyboardLayer } from "@/providers/keyboard-layer";
import { useModel } from "@/providers/model";
import { useSession, type ChatMessage } from "@/providers/session";
import { useTheme } from "@/providers/theme";

function MessageView({ message, expanded }: { message: ChatMessage; expanded: boolean }) {
  if (message.role === "USER") {
    return <UserMessage message={message.content} />;
  }
  if (message.role === "ERROR") {
    return <ErrorMessage message={message.content} />;
  }

  return (
    <box flexDirection="column" width="100%">
      {message.thinking ? <ThinkingBlock text={message.thinking} expanded={expanded} /> : null}
      <BotMessage content={message.content} model={message.model} />
    </box>
  );
}

export function Chat() {
  const { colors } = useTheme();
  const { model } = useModel();
  const { messages, reply, thinking, busy, error } = useSession();
  const { isTopLayer } = useKeyboardLayer();

  const [showThinking, setShowThinking] = useState(false);

  useKeyboard((key) => {
    if (!isTopLayer(LAYER.base)) return;
    if (!key.ctrl || key.name !== "r") return;

    key.preventDefault();
    setShowThinking((current) => !current);
  });

  return (
    <box flexDirection="column" flexGrow={1} width="100%" height="100%" paddingY={1} paddingX={2}>
      <scrollbox flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box flexDirection="column" gap={1}>
          <box flexDirection="column" gap={1} paddingBottom={1}>
            <Header />
            <StatusBar />
          </box>

          {messages.map((message) => (
            <MessageView key={message.id} message={message} expanded={showThinking} />
          ))}
          {thinking ? (
            <ThinkingBlock text={thinking} streaming={!reply} expanded={showThinking} />
          ) : null}
          {reply ? <BotMessage content={reply} model={model.id} /> : null}
          {error ? <ErrorMessage message={error} /> : null}
        </box>
      </scrollbox>

      <box flexDirection="column" flexShrink={0} width="100%" paddingTop={1}>
        <box
          flexDirection="row"
          justifyContent="space-between"
          height={1}
          paddingLeft={1}
          width="100%"
        >
          <text fg={colors.dimSeparator}>/ for commands</text>
          {busy ? <Spinner /> : null}
        </box>

        <InputBar />
      </box>
    </box>
  );
}
