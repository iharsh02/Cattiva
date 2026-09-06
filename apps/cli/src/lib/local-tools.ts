import { z } from "zod";
import { modePolicy } from "@cattiva/shared";
import type { Mode } from "@cattiva/database/enums";
import { toolFor } from "@/tools";

/** Zod's own message is a multi-line JSON dump; the model only needs the field and the reason. */
function invalidInput(toolName: string, error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const reason = issue.message.replace(/^Invalid input:\s*/, "");
      const field = issue.path.join(".");
      return field.length > 0 ? `${field} — ${reason}` : reason;
    })
    .join("; ");

  return `Invalid input for ${toolName}: ${details}`;
}

export async function executeLocalTool(
  toolName: string,
  input: unknown,
  mode: Mode,
): Promise<unknown> {
  const tool = toolFor(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  if (!modePolicy(mode).allows(toolName)) {
    throw new Error(`${toolName} is not available in ${mode.toLowerCase()} mode`);
  }

  try {
    return await tool.run(input);
  } catch (error) {
    throw error instanceof z.ZodError ? new Error(invalidInput(toolName, error)) : error;
  }
}
