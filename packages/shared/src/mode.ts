import type { ToolApprovalStatus } from "ai";
import type { Mode } from "@cattiva/database/enums";
import { ALL_TOOL_NAMES, READ_ONLY_TOOL_NAMES, type ToolName } from "./tools";

const DESTRUCTIVE_TOOLS = ["writeFile", "editFile", "bash"] as const satisfies readonly ToolName[];

export type ModePolicy = {
  activeTools: ToolName[];

  approvals: Partial<Record<ToolName, ToolApprovalStatus>>;

  allows: (tool: string) => boolean;
};

export function modePolicy(mode: Mode): ModePolicy {
  const activeTools = mode === "PLAN" ? READ_ONLY_TOOL_NAMES : ALL_TOOL_NAMES;

  return {
    activeTools,
    approvals:
      mode === "PLAN"
        ? {}
        : Object.fromEntries(DESTRUCTIVE_TOOLS.map((tool) => [tool, "user-approval"])),
    allows: (tool) => (activeTools as string[]).includes(tool),
  };
}
