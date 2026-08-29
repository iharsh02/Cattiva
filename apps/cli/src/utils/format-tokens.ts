/**
 * Compact counts for inline metadata: 940, 1.3k, 13k. Kept out of the component so the
 * /usage command reports the same numbers the same way.
 */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);

  const thousands = count / 1000;
  const rounded = thousands < 10 ? thousands.toFixed(1) : String(Math.round(thousands));

  return `${rounded.replace(/\.0$/, "")}k`;
}
