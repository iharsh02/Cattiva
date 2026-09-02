import { Outlet } from "react-router";
import { ToastProvider } from "@/providers/toast";
import { DialogProvider } from "@/providers/dialog";
import { KeyboardLayerProvider } from "@/providers/keyboard-layer";
import { ThemeProvider } from "@/providers/theme";
import { ModelProvider } from "@/providers/model";
import { ThemedRoot } from "./theme-root";

export function RootLayout() {
  return (
    <ThemeProvider>
      <ModelProvider>
        <KeyboardLayerProvider>
          <ToastProvider>
            <DialogProvider>
              <ThemedRoot>
                <Outlet />
              </ThemedRoot>
            </DialogProvider>
          </ToastProvider>
        </KeyboardLayerProvider>
      </ModelProvider>
    </ThemeProvider>
  );
}
