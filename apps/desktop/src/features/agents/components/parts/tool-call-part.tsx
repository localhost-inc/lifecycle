import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { createPatch } from "diff";
import { PatchDiff } from "@pierre/diffs/react";
import type { AgentToolCallStatus } from "@lifecycle/agents";
import { withCopyableGitDiffOptions } from "@/features/git/components/git-diff-rendering";

interface ParsedFileChange {
  diff?: string;
  kind: "add" | "delete" | "update";
  path: string;
}

function parseFileChanges(input: Record<string, unknown>): ParsedFileChange[] {
  const changes = input.changes;
  if (!Array.isArray(changes)) {
    return [];
  }

  return changes.flatMap((change): ParsedFileChange[] => {
    if (!change || typeof change !== "object" || Array.isArray(change)) {
      return [];
    }

    const record = change as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path : null;
    const kind = typeof record.kind === "string" ? record.kind : null;
    if (!path || (kind !== "add" && kind !== "delete" && kind !== "update")) {
      return [];
    }

    const diff = typeof record.diff === "string" ? record.diff : undefined;
    return [{ ...(diff ? { diff } : {}), kind, path }];
  });
}

function summarizeFileChanges(changes: ParsedFileChange[]): string | null {
  if (changes.length === 0) {
    return null;
  }

  if (changes.length === 1) {
    const change = changes[0]!;
    return `${change.kind} ${change.path.replace(/.*\//, "")}`;
  }

  return `${changes.length} files`;
}

export function buildToolPatch(inputJson: string): string | null {
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    const diff = typeof input.diff === "string" ? input.diff : null;
    const unifiedDiff = typeof input.unified_diff === "string" ? input.unified_diff : null;
    const fileChangeDiff = parseFileChanges(input)
      .map((change) => change.diff)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join("\n");
    if (diff) return diff;
    if (unifiedDiff) return unifiedDiff;
    if (fileChangeDiff) return fileChangeDiff;
    const filePath =
      typeof input.file_path === "string"
        ? input.file_path
        : typeof input.filePath === "string"
          ? input.filePath
          : "file";
    const oldStr = typeof input.old_string === "string" ? input.old_string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string : "";
    if (!oldStr && !newStr) return null;
    return createPatch(filePath, oldStr, newStr, "", "", { context: 3 });
  } catch {
    return null;
  }
}

function ToolDiffView({ inputJson }: { inputJson: string }) {
  const patch = buildToolPatch(inputJson);
  if (!patch) return null;

  return (
    <div className="mt-0.5 overflow-hidden text-[12px]">
      <PatchDiff
        patch={patch}
        options={withCopyableGitDiffOptions({
          diffStyle: "unified" as const,
          disableFileHeader: true,
        })}
      />
    </div>
  );
}

function formatToolName(toolName: string): string {
  switch (toolName) {
    case "command_execution":
      return "Shell";
    case "file_change":
      return "File change";
    case "web_search":
      return "Web search";
    default:
      return toolName.includes("_") ? toolName.replace(/_/g, " ") : toolName;
  }
}

function extractAgentPrompt(inputJson?: string): string | null {
  if (!inputJson) return null;
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    return typeof input.prompt === "string" ? input.prompt : null;
  } catch {
    return null;
  }
}

function cleanSearchPattern(pattern: string): string {
  const cleaned = pattern
    .replace(/\.\*/g, " ")
    .replace(/[|]/g, " ")
    .replace(/[\\^$()[\]{}+?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 40) return `${cleaned.slice(0, 37)}…`;
  return cleaned || pattern.slice(0, 40);
}

function buildToolCallHeader(
  toolName: string,
  inputJson?: string,
): { verb: string; subject: string | null; filePath: string | null; summary: string | null } {
  let input: Record<string, unknown> | null = null;
  try {
    if (inputJson) input = JSON.parse(inputJson) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  const filePath =
    typeof input?.file_path === "string"
      ? input.file_path
      : typeof input?.filePath === "string"
        ? input.filePath
        : null;
  const shortPath = filePath?.replace(/.*\//, "") ?? null;

  switch (toolName) {
    case "Edit":
      return { verb: "Update", subject: shortPath, filePath, summary: diffSummary(inputJson) };
    case "Write":
      return { verb: "Write", subject: shortPath, filePath, summary: null };
    case "Read": {
      const offset = typeof input?.offset === "number" ? input.offset : 0;
      const limit = typeof input?.limit === "number" ? input.limit : null;
      const start = Math.max(offset, 1);
      const range = limit != null ? `:${start}-${start + limit - 1}` : null;
      return {
        verb: "Read",
        subject: shortPath ? `${shortPath}${range ?? ""}` : null,
        filePath,
        summary: null,
      };
    }
    case "Delete":
    case "DeleteFile":
      return { verb: "Delete", subject: shortPath, filePath, summary: null };
    case "Glob":
    case "Grep": {
      const raw = typeof input?.pattern === "string" ? input.pattern : null;
      return {
        verb: "Search",
        subject: raw ? cleanSearchPattern(raw) : null,
        filePath: null,
        summary: null,
      };
    }
    case "ToolSearch":
    case "WebSearch": {
      const query = typeof input?.query === "string" ? input.query : null;
      return {
        verb: "Search",
        subject: query && query.length > 60 ? `${query.slice(0, 57)}…` : query,
        filePath: null,
        summary: null,
      };
    }
    case "WebFetch": {
      const url =
        typeof input?.url === "string" ? input.url.replace(/^https?:\/\//, "").slice(0, 60) : null;
      return { verb: "Fetch", subject: url, filePath: null, summary: null };
    }
    case "Bash":
    case "command_execution": {
      const cmd = typeof input?.command === "string" ? input.command : null;
      const short = cmd && cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd;
      return { verb: "Shell", subject: short, filePath: null, summary: null };
    }
    case "Agent":
      return {
        verb: "Agent",
        subject:
          typeof input?.description === "string"
            ? input.description
            : typeof input?.subagent_type === "string"
              ? input.subagent_type
              : null,
        filePath: null,
        summary: null,
      };
    case "file_change": {
      const changes = input ? parseFileChanges(input) : [];
      const primaryChange = changes.length === 1 ? changes[0]! : null;
      return {
        verb: "File change",
        subject: summarizeFileChanges(changes),
        filePath: primaryChange?.path ?? null,
        summary: null,
      };
    }
    default:
      return { verb: formatToolName(toolName), subject: null, filePath: null, summary: null };
  }
}

function diffSummary(inputJson?: string): string | null {
  if (!inputJson) return null;
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    const oldStr = typeof input.old_string === "string" ? input.old_string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string : "";
    if (!oldStr && !newStr) return null;
    const oldLines = oldStr.split("\n").length;
    const newLines = newStr.split("\n").length;
    const added = newLines - oldLines;
    const parts: string[] = [];
    if (added > 0) parts.push(`Added ${added} line${added === 1 ? "" : "s"}`);
    if (added < 0) parts.push(`Removed ${Math.abs(added)} line${Math.abs(added) === 1 ? "" : "s"}`);
    if (added === 0) parts.push(`Changed ${oldLines} line${oldLines === 1 ? "" : "s"}`);
    return parts.join(", ");
  } catch {
    return null;
  }
}

function parseCommandExecutionOutput(
  outputJson?: string | null,
): { exitCode: number | null; output: string | null } | null {
  if (!outputJson) {
    return null;
  }

  try {
    const output = JSON.parse(outputJson) as Record<string, unknown>;
    const stdout = typeof output.stdout === "string" ? output.stdout : "";
    const stderr = typeof output.stderr === "string" ? output.stderr : "";
    const mergedOutput =
      typeof output.output === "string"
        ? output.output
        : `${stdout}${stdout && stderr ? "\n" : ""}${stderr}`;
    return {
      exitCode: typeof output.exitCode === "number" ? output.exitCode : null,
      output: mergedOutput.length > 0 ? mergedOutput : null,
    };
  } catch {
    return null;
  }
}

function hasFailed(status?: AgentToolCallStatus | null, errorText?: string | null): boolean {
  return status === "failed" || !!errorText;
}

export function ToolCallPart({
  toolName,
  inputJson,
  outputJson,
  status,
  errorText,
  isStreaming: _isStreaming,
  onOpenFile,
}: {
  toolName: string;
  inputJson?: string;
  outputJson?: string | null;
  status?: AgentToolCallStatus | null;
  errorText?: string | null;
  isStreaming?: boolean;
  onOpenFile?: (filePath: string) => void;
}) {
  const { verb, subject, filePath, summary } = buildToolCallHeader(toolName, inputJson);
  const diffInputJson = typeof inputJson === "string" ? inputJson : null;
  const hasToolDiff =
    (toolName === "Edit" ||
      toolName === "Write" ||
      toolName === "Delete" ||
      toolName === "DeleteFile" ||
      toolName === "file_change") &&
    diffInputJson !== null &&
    buildToolPatch(diffInputJson) !== null;
  const agentPrompt = toolName === "Agent" ? extractAgentPrompt(inputJson) : null;
  const commandExecution =
    toolName === "command_execution" ? parseCommandExecutionOutput(outputJson) : null;
  const commandOutput = commandExecution?.output ?? null;
  const commandExitCode = commandExecution?.exitCode ?? null;
  const hasCommandOutput = commandOutput !== null;
  const isExpandable = hasToolDiff || agentPrompt || hasCommandOutput;
  const [open, setOpen] = useState(hasToolDiff || hasCommandOutput);
  useEffect(() => {
    if (hasToolDiff) setOpen(true);
  }, [hasToolDiff]);
  useEffect(() => {
    if (hasCommandOutput) {
      setOpen(true);
    }
  }, [hasCommandOutput]);
  const canOpenFile = !!filePath && !!onOpenFile;
  const isCompleted = status === "completed" || status === "failed" || status === "cancelled";

  return (
    <div className={["transition-opacity", isCompleted ? "opacity-50" : ""].join(" ")}>
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)]">
        {hasFailed(status, errorText) ? (
          <span className="flex size-3 shrink-0 items-center justify-center">
            <span className="size-1.5 rounded-full bg-[var(--terminal-ansi-red)]" />
          </span>
        ) : isExpandable ? (
          <button
            className="hover:text-[var(--foreground)] transition-colors"
            onClick={() => setOpen(!open)}
            type="button"
          >
            <ChevronRight
              className={["size-3 shrink-0 transition-transform", open ? "rotate-90" : ""].join(
                " ",
              )}
            />
          </button>
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span className="inline-flex items-center">
          <button
            className="hover:text-[var(--foreground)] transition-colors"
            onClick={() => isExpandable && setOpen(!open)}
            type="button"
          >
            <span className="font-medium text-[var(--foreground)]">{verb}</span>
          </button>
          {subject ? (
            <>
              <span className="text-[var(--muted-foreground)]/60">(</span>
              {canOpenFile ? (
                <button
                  className="text-[var(--muted-foreground)] hover:text-[var(--accent)] hover:underline transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFile(filePath);
                  }}
                  title={filePath}
                  type="button"
                >
                  {subject}
                </button>
              ) : (
                <span className="text-[var(--muted-foreground)]">{subject}</span>
              )}
              <span className="text-[var(--muted-foreground)]/60">)</span>
            </>
          ) : null}
        </span>
      </div>
      {open && hasToolDiff && summary ? (
        <div className="flex items-center gap-1 pl-[1.125rem] text-[11px] text-[var(--muted-foreground)]/60">
          <span>└</span>
          <span>{summary}</span>
        </div>
      ) : null}
      {open && hasToolDiff && diffInputJson ? <ToolDiffView inputJson={diffInputJson} /> : null}
      {open && agentPrompt ? (
        <pre className="mt-1 ml-[1.125rem] whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 text-[12px] leading-5 text-[var(--muted-foreground)]">
          {agentPrompt}
        </pre>
      ) : null}
      {open && hasCommandOutput ? (
        <div className="mt-1 ml-[1.125rem] overflow-hidden rounded border border-[var(--border)] bg-[var(--surface-hover)]/40">
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--muted-foreground)]">
            <span>Output</span>
            {commandExitCode !== null ? <span>exit {commandExitCode}</span> : null}
          </div>
          <pre className="max-h-72 overflow-auto border-t border-[var(--border)] px-3 py-2 whitespace-pre-wrap break-words font-[var(--font-mono)] text-[12px] leading-5 text-[var(--foreground)]">
            {commandOutput}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
