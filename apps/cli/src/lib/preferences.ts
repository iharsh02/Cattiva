import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Effort, Reasoning } from "@cattiva/shared";
import type { Mode } from "@cattiva/database/enums";

const CONFIG_DIR = join(homedir(), ".cattiva");
const PREFERENCES_PATH = join(CONFIG_DIR, "preferences.json");

export type Preferences = {
  themeName: string;
  modelId: string;
  mode: Mode;
  reasoning: Reasoning | null;
  effort: Effort | null;
};

export function readPreferences(): Partial<Preferences> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(PREFERENCES_PATH, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Partial<Preferences>) : {};
  } catch {
    return {};
  }
}

/** Merges into what is already on disk: theme and model settings share one file. */
export function savePreferences(patch: Partial<Preferences>): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(
      PREFERENCES_PATH,
      JSON.stringify({ ...readPreferences(), ...patch }, null, 2),
      "utf8",
    );
  } catch {}
}
