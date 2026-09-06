import { realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { escapes } from "@/lib/command-fence";

export const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", ".next"]);

async function realLocation(target: string): Promise<string> {
  for (let path = target; ; path = dirname(path)) {
    try {
      return join(await realpath(path), relative(path, target));
    } catch {
      if (dirname(path) === path) return target;
    }
  }
}

export async function insideProject(path: string): Promise<{ root: string; target: string }> {
  const root = await realpath(process.cwd());
  const target = resolve(root, path);

  if (escapes(root, await realLocation(target))) {
    throw new Error(
      `Refused: ${path} is outside the project (${root}). Do not retry it — work within the project or ask the user.`,
    );
  }

  return { root, target };
}

export async function runCommand(
  command: string[],
  cwd: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, TERM: "dumb" },
  });

  const timer = setTimeout(() => proc.kill(), timeout);

  try {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    return { stdout, stderr, exitCode: await proc.exited };
  } finally {
    clearTimeout(timer);
  }
}
