import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { toolInputSchemas } from "@cattiva/shared";
import { IGNORED_DIRECTORIES, insideProject } from "./project";
import { asString, type Tool } from "./types";

export const listDirectory: Tool = {
  name: "listDirectory",
  async run(input) {
    const { path } = toolInputSchemas.listDirectory.parse(input);
    const { root, target } = await insideProject(path);
    const entries: { name: string; type: "file" | "directory" }[] = [];

    for (const name of await readdir(target)) {
      if (name.startsWith(".") || IGNORED_DIRECTORIES.has(name)) continue;
      const info = await stat(join(target, name));
      entries.push({ name, type: info.isDirectory() ? "directory" : "file" });
    }

    entries.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1,
    );

    return { path: relative(root, target) || ".", entries };
  },
  gist: (input) => asString(input.path),
  result: (output) => (Array.isArray(output.entries) ? `${output.entries.length} entries` : ""),
};
