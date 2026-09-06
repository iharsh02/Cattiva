import type { CattivaUIMessage } from "@cattiva/shared";
import { textFromMessage } from "@cattiva/shared";
import {
  ApprovalPrompt,
  BotMessage,
  ErrorMessage,
  pendingApproval,
  UserMessage,
} from "@/components/chat";
import { Header } from "@/components/banner/header";
import { StatusBar } from "@/components/banner/status-bar";
import { InputBar } from "@/components/prompt/input-bar";
import { Spinner } from "@/components/spinner";
import { useSession } from "@/providers/session";
import { useTheme } from "@/providers/theme";

function MessageView({ message }: { message: CattivaUIMessage }) {
  if (message.role === "user") {
    return <UserMessage message={textFromMessage(message)} />;
  }

  return <BotMessage message={message} />;
}

export function Chat() {
  const { colors } = useTheme();
  const { messages, busy, error, approve } = useSession();

  const pending = pendingApproval(messages);

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

          {pending ? <ApprovalPrompt pending={pending} onAnswer={approve} /> : null}
          {error ? <ErrorMessage message={error.message} /> : null}
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
