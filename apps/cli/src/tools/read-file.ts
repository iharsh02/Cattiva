import { toolInputSchemas } from "@cattiva/shared";
import { insideProject } from "./project";
import { asString, type Tool } from "./types";

const asNumber = (value: unknown): number | null => (typeof value === "number" ? value : null);

const MAX_FILE_CHARS = 10_000;

export const readFile: Tool = {
  name: "readFile",
  async run(input) {
    const { path, offset, limit } = toolInputSchemas.readFile.parse(input);
    const { target } = await insideProject(path);
    const file = Bun.file(target);

    if (!(await file.exists())) throw new Error(`No such file: ${path}`);

    const lines = (await file.text()).split("\n");
    const start = (offset ?? 1) - 1;
    const asked = lines.slice(start, limit === undefined ? undefined : start + limit);

    const kept: string[] = [];
    let size = 0;

    for (const line of asked) {
      if (kept.length > 0 && size + line.length + 1 > MAX_FILE_CHARS) break;
      kept.push(line.slice(0, MAX_FILE_CHARS));
      size += line.length + 1;
    }

    const lastLine = start + kept.length;

    return {
      content: kept.join("\n"),
      firstLine: start + 1,
      lastLine,
      totalLines: lines.length,
      ...(lastLine < lines.length ? { nextOffset: lastLine + 1 } : {}),
    };
  },
  gist: (input) => asString(input.path),
  result: (output) => {
    const first = asNumber(output.firstLine);
    const last = asNumber(output.lastLine);
    const total = asNumber(output.totalLines);

    if (total === null || first === null || last === null) return "";

    return last - first + 1 >= total ? `${total} lines` : `lines ${first}-${last} of ${total}`;
  },
};
