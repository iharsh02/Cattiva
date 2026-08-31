export const DEFAULT_SESSION_TITLE = "New session";

const TITLE_MAX_LENGTH = 100;

export function titleFromMessage(message: string): string {
  const collapsed = message.trim().replace(/\s+/g, " ");

  if (collapsed.length === 0) return DEFAULT_SESSION_TITLE;
  if (collapsed.length <= TITLE_MAX_LENGTH) return collapsed;

  return `${collapsed.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
