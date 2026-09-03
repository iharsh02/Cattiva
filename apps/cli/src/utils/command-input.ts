export function commandPrefix(text: string): string | null {
  if (!text.startsWith("/")) return null;

  const prefix = text.slice(1);
  return prefix.includes(" ") ? null : prefix;
}
