import { DEFAULT_CHAT_MODEL_ID } from "@cattiva/shared";
import { apiClient } from "./apiClient";
import { getErrormessage } from "./httpError";

/** Every message the CLI sends is the user's, typed in the prompt. */
const userMessage = (content: string) => ({
  role: "USER",
  content,
  mode: "BUILD",
  model: DEFAULT_CHAT_MODEL_ID,
});

export async function createSession(message?: string) {
  const res = await apiClient.sessions.$post({
    json: {
      cwd: process.cwd(),
      ...(message ? { initialMessage: userMessage(message) } : {}),
    },
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

export async function sendMessage(sessionId: string, content: string) {
  const res = await apiClient.sessions[":id"].messages.$post({
    param: { id: sessionId },
    json: userMessage(content),
  });

  if (!res.ok) {
    throw new Error(await getErrormessage(res));
  }

  return res.json();
}
