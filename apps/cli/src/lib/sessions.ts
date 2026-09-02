import { apiClient } from "./apiClient";
import { getErrormessage } from "./httpError";

/**
 * Sessions start empty: the first user turn goes through the chat stream, which is what
 * records it and titles the session from it.
 */
export async function createSession() {
  const res = await apiClient.sessions.$post({
    json: { cwd: process.cwd() },
  });

  if (!res.ok) {
    throw new Error(await getErrormessage(res));
  }

  return res.json();
}

export async function fetchSession(id: string) {
  const res = await apiClient.sessions[":id"].$get({ param: { id } });

  if (!res.ok) {
    throw new Error(await getErrormessage(res));
  }

  return res.json();
}
