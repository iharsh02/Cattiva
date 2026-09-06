import { relative, resolve } from "node:path";
import { toolInputSchemas } from "@cattiva/shared";
import { IGNORED_DIRECTORIES, insideProject } from "./project";
import { asString, type Tool } from "./types";

const MAX_GLOB_RESULTS = 200;

export const glob: Tool = {
  name: "glob",
  async run(input) {
    const { pattern, path } = toolInputSchemas.glob.parse(input);
    const { root, target } = await insideProject(path);
    const files: string[] = [];
    let truncated = false;

    for await (const match of new Bun.Glob(pattern).scan({ cwd: target, onlyFiles: true })) {
      if (match.split("/").some((segment) => IGNORED_DIRECTORIES.has(segment))) continue;

      if (files.length >= MAX_GLOB_RESULTS) {
        truncated = true;
        break;
      }

      files.push(relative(root, resolve(target, match)));
    }

    files.sort();
    return { files, ...(truncated ? { truncated: true } : {}) };
  },
  gist: (input) => asString(input.pattern),
  result: (output) => (Array.isArray(output.files) ? `${output.files.length} files` : ""),
};
