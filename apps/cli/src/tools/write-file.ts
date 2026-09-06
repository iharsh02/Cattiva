import { relative } from "node:path";
import { toolInputSchemas } from "@cattiva/shared";
import { insideProject } from "./project";
import { asString, clamp, type Tool } from "./types";

export const writeFile: Tool = {
  name: "writeFile",
  async run(input) {
    const { path, content } = toolInputSchemas.writeFile.parse(input);
    const { root, target } = await insideProject(path);

    const bytesWritten = await Bun.write(target, content);
    return { path: relative(root, target), bytesWritten };
  },
  gist: (input) => asString(input.path),
  body: (input) => clamp(asString(input.content).split("\n")),
  result: (output) =>
    typeof output.bytesWritten === "number" ? `${output.bytesWritten} bytes` : "written",
};
