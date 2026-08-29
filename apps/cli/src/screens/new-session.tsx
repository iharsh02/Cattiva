import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTheme } from "@/providers/theme";

export function NewSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors } = useTheme();

  const state = location.state as { message?: string } | null;

  useEffect(() => {
    if (!state?.message) {
      navigate("/", { replace: true });
    }
  }, [state, navigate]);

  if (!state?.message) return null;

  return (
    <box flexGrow={1} padding={2} flexDirection="column" gap={1}>
      <text fg={colors.primary}>Creating Session..</text>
      <text fg={colors.dimSeparator}>{state.message}</text>
    </box>
  );
}
