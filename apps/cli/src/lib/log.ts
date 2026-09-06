import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".cattiva");
const LOG_PATH = join(LOG_DIR, "debug.log");

const ENABLED = process.env.CATTIVA_DEBUG === "1";

export function debugLog(event: string, detail: Record<string, unknown> = {}): void {
  if (!ENABLED) return;

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`,
      "utf8",
    );
  } catch {}
}
