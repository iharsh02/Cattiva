import { Chat } from "@/components/screens/chat";
import { ToastProvider } from "@/providers/toast";
import { DialogProvider } from "@/providers/dialog";
import { KeyboardLayerProvider } from "@/providers/keyboard-layer";
import { ThemeProvider } from "@/providers/theme";
import { ModelProvider } from "@/providers/model";
import { SessionProvider } from "@/providers/session";
import { ThemedRoot } from "./theme-root";

export function RootLayout() {
  return (
    <ThemeProvider>
      <ModelProvider>
        <SessionProvider>
          <KeyboardLayerProvider>
            <ToastProvider>
              <DialogProvider>
                <ThemedRoot>
                  <Chat />
                </ThemedRoot>
              </DialogProvider>
            </ToastProvider>
          </KeyboardLayerProvider>
        </SessionProvider>
      </ModelProvider>
    </ThemeProvider>
  );
}
