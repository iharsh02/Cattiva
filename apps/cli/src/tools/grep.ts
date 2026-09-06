import { relative } from "node:path";
import { toolInputSchemas } from "@cattiva/shared";
import { IGNORED_DIRECTORIES, insideProject, runCommand } from "./project";
import { asString, type Tool } from "./types";

const MAX_GREP_MATCHES = 100;
const GREP_TIMEOUT = 30_000;

export const grep: Tool = {
  name: "grep",
  async run(input) {
    const { pattern, path, include } = toolInputSchemas.grep.parse(input);
    const { root, target } = await insideProject(path);

    const args = ["grep", "-rnE", "--color=never"];
    for (const ignored of IGNORED_DIRECTORIES) args.push(`--exclude-dir=${ignored}`);
    if (include) args.push(`--include=${include}`);
    args.push(pattern, target);

    const { stdout, stderr, exitCode } = await runCommand(args, root, GREP_TIMEOUT);

    if (exitCode > 1) throw new Error(`grep failed: ${stderr.trim() || `exit ${exitCode}`}`);

    const lines = stdout.split("\n").filter((line) => line.length > 0);
    const matches: { file: string; line: number; text: string }[] = [];

    for (const line of lines.slice(0, MAX_GREP_MATCHES)) {
      const parsed = /^(.+?):(\d+):(.*)$/.exec(line);
      if (!parsed) continue;

      matches.push({ file: relative(root, parsed[1]!), line: Number(parsed[2]), text: parsed[3]! });
    }

    return {
      matches,
      ...(lines.length > MAX_GREP_MATCHES ? { truncated: true, totalMatches: lines.length } : {}),
    };
  },
  gist: (input) => asString(input.pattern),
  result: (output) => (Array.isArray(output.matches) ? `${output.matches.length} matches` : ""),
};
