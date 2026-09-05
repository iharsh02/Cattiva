import { messagePartSchema } from "@cattiva/shared";

export function thinkingFromParts(parts: unknown): string | undefined {
  if (!Array.isArray(parts)) return undefined;

  const text = parts
    .flatMap((part) => {
      const parsed = messagePartSchema.safeParse(part);
      return parsed.success && parsed.data.type === "reasoning" ? [parsed.data.text] : [];
    })
    .join("");

  return text.length > 0 ? text : undefined;
}
