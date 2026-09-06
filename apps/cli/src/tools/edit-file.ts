import { relative } from "node:path";
import { toolInputSchemas } from "@cattiva/shared";
import { insideProject } from "./project";
import { asString, clamp, type Tool } from "./types";

export const editFile: Tool = {
  name: "editFile",
  async run(input) {
    const { path, oldString, newString } = toolInputSchemas.editFile.parse(input);
    const { root, target } = await insideProject(path);
    const file = Bun.file(target);

    if (!(await file.exists())) throw new Error(`No such file: ${path}`);

    const content = await file.text();
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) throw new Error("oldString does not appear in the file");
    if (occurrences > 1) {
      throw new Error(`oldString appears ${occurrences} times; it must be unique`);
    }

    await Bun.write(target, content.replace(oldString, newString));
    return { path: relative(root, target) };
  },
  gist: (input) => asString(input.path),
  body: (input) =>
    clamp([
      ...asString(input.oldString)
        .split("\n")
        .map((line) => `- ${line}`),
      ...asString(input.newString)
        .split("\n")
        .map((line) => `+ ${line}`),
    ]),
  result: () => "edited",
};
