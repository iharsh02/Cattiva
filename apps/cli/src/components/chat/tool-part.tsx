import { TextAttributes } from "@opentui/core";
import { getToolName, isToolUIPart, type ToolUIPart } from "ai";
import type { CattivaUIPart } from "@cattiva/shared";
import { asRecord, toolFor } from "@/tools";
import { useTheme } from "@/providers/theme";

export type ToolPartView = Extract<CattivaUIPart, ToolUIPart>;

export function isToolPart(part: CattivaUIPart): part is ToolPartView {
  return isToolUIPart(part);
}

const MAX_GIST = 58;

const STATE_MARKS: Record<ToolUIPart["state"], string> = {
  "input-streaming": "◌",
  "input-available": "◍",
  "approval-requested": "◆",
  "approval-responded": "◍",
  "output-available": "●",
  "output-error": "●",
  "output-denied": "○",
};

export function summarise(tool: string, input: unknown): string {
  const gist = toolFor(tool)?.gist(asRecord(input)) ?? "";
  const line = gist.split("\n")[0] ?? "";

  return line.length > MAX_GIST ? `${line.slice(0, MAX_GIST - 1)}…` : line;
}

function Gutter({ label, lines, fg }: { label: string; lines: string[]; fg: string }) {
  const { colors } = useTheme();

  return (
    <box flexDirection="row" gap={1} width="100%">
      <text fg={colors.dimSeparator}>{label.padEnd(3)}</text>
      <box flexDirection="column" flexGrow={1}>
        {lines.map((line, index) => (
          <text key={index} fg={fg}>
            {line}
          </text>
        ))}
      </box>
    </box>
  );
}

export function ToolPart({ part }: { part: ToolPartView }) {
  const { colors } = useTheme();

  const tool = getToolName(part);
  const presenter = toolFor(tool);
  const failed = part.state === "output-error";
  const denied = part.state === "output-denied";
  const done = part.state === "output-available";

  const markColor = failed
    ? colors.error
    : denied
      ? colors.dimSeparator
      : done
        ? colors.success
        : part.state === "approval-requested"
          ? colors.planMode
          : colors.primary;

  const output = asRecord("output" in part ? part.output : undefined);
  const result = done ? (presenter?.result?.(output) ?? "") : denied ? "declined" : "";

  const inLines = presenter?.body?.(asRecord(part.input)) ?? [];
  const outLines = failed
    ? [part.errorText ?? "failed"]
    : done
      ? (presenter?.outputBody?.(output) ?? [])
      : [];

  return (
    <box flexDirection="column" paddingX={3} width="100%">
      <box flexDirection="row" gap={1}>
        <text fg={markColor}>{STATE_MARKS[part.state]}</text>
        <text attributes={TextAttributes.BOLD}>{tool}</text>
        <text fg={colors.dimSeparator}>{summarise(tool, part.input)}</text>
        {result.length > 0 ? <text fg={colors.dimSeparator}>{`· ${result}`}</text> : null}
      </box>

      {inLines.length > 0 || outLines.length > 0 ? (
        <box
          flexDirection="column"
          marginLeft={2}
          paddingX={1}
          width="100%"
          border
          borderStyle="rounded"
          borderColor={colors.thinkingBorder}
        >
          {inLines.length > 0 ? <Gutter label="IN" lines={inLines} fg={colors.info} /> : null}
          {outLines.length > 0 ? (
            <Gutter label="OUT" lines={outLines} fg={failed ? colors.error : colors.dimSeparator} />
          ) : null}
        </box>
      ) : null}
    </box>
  );
}
