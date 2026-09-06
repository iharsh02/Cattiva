import type { StoredMessageRow } from "@cattiva/shared";
import { apiClient } from "./apiClient";
import { getErrormessage } from "./httpError";

export async function fetchSession(id: string) {
  const res = await apiClient.sessions[":id"].$get({ param: { id } });

  if (!res.ok) {
    throw new Error(await getErrormessage(res));
  }

  const session = await res.json();
  const messages: readonly StoredMessageRow[] = session.messages;

  return { ...session, messages };
}
