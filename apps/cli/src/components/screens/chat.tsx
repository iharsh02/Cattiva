import { BotMessage, ErrorMessage, UserMessage } from "@/components/chat";
import { Header } from "@/components/banner/header";
import { StatusBar } from "@/components/banner/status-bar";
import { InputBar } from "@/components/prompt/input-bar";
import { Spinner } from "@/components/spinner";
import { useModel } from "@/providers/model";
import { useSession, type ChatMessage } from "@/providers/session";
import { useTheme } from "@/providers/theme";

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "USER") {
    return <UserMessage message={message.content} />;
  }
  if (message.role === "ERROR") {
    return <ErrorMessage message={message.content} />;
  }

  return <BotMessage content={message.content} model={message.model} />;
}

export function Chat() {
  const { colors } = useTheme();
  const { model } = useModel();
  const { messages, reply, busy, error } = useSession();

  return (
    <box flexDirection="column" flexGrow={1} width="100%" height="100%" paddingY={1} paddingX={2}>
      <scrollbox flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box flexDirection="column" gap={1}>
          <box flexDirection="column" gap={1} paddingBottom={1}>
            <Header />
            <StatusBar />
          </box>

          {messages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}
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
