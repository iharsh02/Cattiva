import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

const HOME = homedir();

const URL_LIKE = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;

const WORD_BREAK = /[\s;|&()<>]+/;

export function escapes(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel.startsWith("..") || isAbsolute(rel);
}

function asPath(word: string): string {
  return word
    .replace(/^[^=]*=/, "")
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^~(?=\/|$)/, HOME)
    .replace(/\$\{?HOME\}?/g, HOME);
}

export function pathOutsideProject(command: string, root: string): string | null {
  for (const word of command.replace(URL_LIKE, " ").split(WORD_BREAK)) {
    const candidate = asPath(word);
    if (candidate.length === 0) continue;
    if (!candidate.includes("/") && candidate !== ".." && candidate !== "~") continue;

    if (escapes(root, resolve(root, candidate))) return word;
  }

  return null;
}
