import { toolInputSchemas } from "@cattiva/shared";
import { pathOutsideProject } from "@/lib/command-fence";
import { insideProject, runCommand } from "./project";
import { asString, clamp, type Tool } from "./types";

const MAX_COMMAND_OUTPUT = 20_000;
const DEFAULT_COMMAND_TIMEOUT = 30_000;

function truncate(value: string, limit: number): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n… truncated, ${value.length} characters total`;
}

export const bash: Tool = {
  name: "bash",
  async run(input) {
    const { command, timeout = DEFAULT_COMMAND_TIMEOUT } = toolInputSchemas.bash.parse(input);
    const { root } = await insideProject(".");

    const escape = pathOutsideProject(command, root);
    if (escape !== null) {
      throw new Error(
        `Refused: ${escape} is outside the project (${root}). This command cannot be run in any form. Do not retry it — tell the user what you need and let them run it.`,
      );
    }

    const { stdout, stderr, exitCode } = await runCommand(["bash", "-c", command], root, timeout);

    return {
      stdout: truncate(stdout, MAX_COMMAND_OUTPUT),
      stderr: truncate(stderr, MAX_COMMAND_OUTPUT),
      exitCode,
    };
  },

  gist: (input) => asString(input.description),
  body: (input) => clamp(asString(input.command).split("\n")),
  result: (output) =>
    typeof output.exitCode === "number" && output.exitCode !== 0 ? `exit ${output.exitCode}` : "",
  outputBody: (output) => {
    const text = [asString(output.stdout), asString(output.stderr)]
      .filter((stream) => stream.trim().length > 0)
      .join("\n")
      .trimEnd();

    return text.length === 0 ? ["done"] : clamp(text.split("\n"));
  },
};
