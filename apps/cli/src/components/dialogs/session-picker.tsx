import { useCallback, useEffect, useState } from "react";
import { useDialog } from "@/providers/dialog";
import { useSession } from "@/providers/session";
import { useTheme } from "@/providers/theme";
import { apiClient } from "@/lib/apiClient";
import { getErrormessage } from "@/lib/httpError";
import { SearchList } from "./search-list";

type SessionSummary = {
  id: string;
  title: string;
  createdAt: string;
};

function newestFirst(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function SessionPicker() {
  const { close } = useDialog();
  const { load: loadSession } = useSession();
  const { colors } = useTheme();

  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const res = await apiClient.sessions.$get();
        if (ignore) return;

        if (!res.ok) {
          throw new Error(await getErrormessage(res));
        }

        const data: SessionSummary[] = await res.json();
        if (ignore) return;
        setSessions(newestFirst(data));
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  const select = useCallback(
    (session: SessionSummary) => {
      close();
      loadSession(session.id);
    },
    [close, loadSession],
  );

  if (error) {
    return <text fg={colors.error}>{error}</text>;
  }

  if (sessions === null) {
    return <text fg={colors.dimSeparator}>Loading sessions...</text>;
  }

  return (
    <SearchList
      items={sessions}
      getKey={(session) => session.id}
      filterFn={(session, query) => session.title.toLowerCase().includes(query.toLowerCase())}
      onSelect={select}
      placeholder="Search sessions"
      emptyText="No saved sessions"
      renderItem={(session, isSelected) => (
        <text selectable={false} fg={isSelected ? colors.selection : colors.dimSeparator}>
          {session.title}
        </text>
      )}
    />
  );
}
