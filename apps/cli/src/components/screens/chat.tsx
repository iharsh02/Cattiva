import type { CattivaUIMessage } from "@cattiva/shared";
import { textFromMessage } from "@cattiva/shared";
import {
  ApprovalPrompt,
  BotMessage,
  ErrorMessage,
  InterruptedNotice,
  pendingApproval,
  UserMessage,
} from "@/components/chat";
import { Header } from "@/components/banner/header";
import { StatusBar } from "@/components/banner/status-bar";
import { InputBar } from "@/components/prompt/input-bar";
import { useSession } from "@/providers/session";

function MessageView({ message }: { message: CattivaUIMessage }) {
  if (message.role === "user") {
    return <UserMessage message={textFromMessage(message)} />;
  }

  return <BotMessage message={message} />;
}

export function Chat() {
  const { messages, interrupted, error, approve } = useSession();

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
          {interrupted ? <InterruptedNotice /> : null}
          {error ? <ErrorMessage message={error.message} /> : null}
        </box>
      </scrollbox>

      <box flexDirection="column" flexShrink={0} width="100%" paddingTop={1}>
        <InputBar />
      </box>
    </box>
  );
}
