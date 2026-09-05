import { messagePartsSchema } from "@cattiva/shared";

export function thinkingFromParts(parts: unknown): string | undefined {
  const parsed = messagePartsSchema.safeParse(parts);
  if (!parsed.success) return undefined;

  const text = parsed.data
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text)
    .join("");

  return text.length > 0 ? text : undefined;
}
