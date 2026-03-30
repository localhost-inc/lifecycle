import { ChevronRight } from "lucide-react";
import { memo, useState } from "react";
import type { AgentApprovalDecision, AgentMessagePart } from "@lifecycle/agents";
import type {
  ParsedMessage,
  ParsedMessagePartEntry,
} from "@/features/agents/components/agent-message-parsing";
import {
  TextPart,
  ThinkingPart,
  ToolCallPart,
  StatusPart,
} from "@/features/agents/components/agent-part-renderers";
import { ApprovalRefPart } from "@/features/agents/components/agent-approval-cards";

interface ToolCallSegment {
  kind: "tool_call";
  parts: ParsedMessagePartEntry[];
}

interface ContentSegment {
  kind: "content";
  parts: ParsedMessagePartEntry[];
}

type AssistantSegment = ToolCallSegment | ContentSegment;

function MessagePartRenderer({
  onResolveApproval,
  onOpenFile,
  part,
  resolvingApprovalIds,
  isStreaming,
}: {
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  onOpenFile?: (filePath: string) => void;
  part: AgentMessagePart;
  resolvingApprovalIds?: ReadonlySet<string>;
  isStreaming?: boolean;
}) {
  switch (part.type) {
    case "text":
      return <TextPart text={part.text} isStreaming={isStreaming} />;
    case "thinking":
      return <ThinkingPart text={part.text} isStreaming={isStreaming} />;
    case "status":
      return <StatusPart text={part.text} />;
    case "tool_call":
      return (
        <ToolCallPart
          toolName={part.toolName}
          inputJson={part.inputJson}
          outputJson={part.outputJson}
          status={part.status}
          errorText={part.errorText}
          isStreaming={isStreaming}
          onOpenFile={onOpenFile}
        />
      );
    case "tool_result":
    case "attachment_ref":
    case "artifact_ref":
      return null;
    case "approval_ref":
      return (
        <ApprovalRefPart
          onResolve={onResolveApproval}
          part={part}
          resolving={resolvingApprovalIds?.has(part.approvalId) ?? false}
        />
      );
  }
}

function UserMessage({ message }: { message: ParsedMessage }) {
  const text = message.parts
    .map(({ part }) => part)
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
  const imageParts = message.parts.filter(
    (
      entry,
    ): entry is ParsedMessagePartEntry & {
      part: Extract<AgentMessagePart, { type: "image" }>;
    } => entry.part.type === "image",
  );

  return (
    <div className="bg-[var(--surface-hover)]/50 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="shrink-0 pt-[3px] text-[13px] text-[var(--accent)]">&#9654;</span>
        <div className="min-w-0 flex-1">
          {text ? (
            <pre className="whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--foreground)]">
              {text}
            </pre>
          ) : null}
          {imageParts.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {imageParts.map(({ id, part: img }, i) => (
                <img
                  key={id}
                  src={`data:${img.mediaType};base64,${img.base64Data}`}
                  alt={`User image ${i + 1}`}
                  className="max-h-48 max-w-64 rounded border border-[var(--border)] object-contain"
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function isToolOnlyAssistantMessage(message: ParsedMessage): boolean {
  return message.parts.every(
    ({ part }) =>
      part.type === "tool_call" ||
      part.type === "tool_result" ||
      part.type === "status" ||
      part.type === "attachment_ref" ||
      part.type === "artifact_ref",
  );
}

function shouldRenderAssistantPart(part: AgentMessagePart): boolean {
  return (
    part.type !== "tool_result" && part.type !== "attachment_ref" && part.type !== "artifact_ref"
  );
}

function buildAssistantSegments(parts: ParsedMessagePartEntry[]): AssistantSegment[] {
  const segments: AssistantSegment[] = [];
  let activeToolParts: ParsedMessagePartEntry[] = [];
  let activeContentParts: ParsedMessagePartEntry[] = [];

  const flushTools = () => {
    if (activeToolParts.length === 0) {
      return;
    }
    segments.push({ kind: "tool_call", parts: activeToolParts });
    activeToolParts = [];
  };

  const flushContent = () => {
    if (activeContentParts.length === 0) {
      return;
    }
    segments.push({ kind: "content", parts: activeContentParts });
    activeContentParts = [];
  };

  for (const part of parts) {
    if (!shouldRenderAssistantPart(part.part)) {
      continue;
    }

    if (part.part.type === "tool_call") {
      flushContent();
      // Diff-producing tools render individually so their patches stay visible while streaming.
      const name = part.part.toolName;
      if (
        name === "Edit" ||
        name === "Write" ||
        name === "Delete" ||
        name === "DeleteFile" ||
        name === "file_change"
      ) {
        flushTools();
        segments.push({ kind: "tool_call", parts: [part] });
      } else {
        activeToolParts.push(part);
      }
      continue;
    }

    // Thinking parts break out of content segments — they render standalone
    if (part.part.type === "thinking") {
      flushTools();
      flushContent();
      segments.push({ kind: "content", parts: [part] });
      continue;
    }

    flushTools();
    activeContentParts.push(part);
  }

  flushTools();
  flushContent();

  return segments;
}

function getAssistantSegmentKey(segment: AssistantSegment): string {
  const firstId = segment.parts[0]?.id ?? "empty";
  const lastId = segment.parts[segment.parts.length - 1]?.id ?? firstId;
  return `${segment.kind}:${firstId}:${lastId}`;
}

interface ToolTally {
  searched: number;
  read: number;
  edited: number;
  wrote: number;
  deleted: number;
  ran: number;
  delegated: number;
  other: number;
}

function tallyToolCalls(parts: ParsedMessagePartEntry[]): ToolTally {
  const tally: ToolTally = {
    searched: 0,
    read: 0,
    edited: 0,
    wrote: 0,
    deleted: 0,
    ran: 0,
    delegated: 0,
    other: 0,
  };
  for (const { part } of parts) {
    if (part.type !== "tool_call") continue;
    switch (part.toolName) {
      case "Grep":
      case "Glob":
      case "ToolSearch":
      case "WebSearch":
        tally.searched++;
        break;
      case "Read":
        tally.read++;
        break;
      case "Edit":
        tally.edited++;
        break;
      case "Write":
        tally.wrote++;
        break;
      case "Delete":
      case "DeleteFile":
        tally.deleted++;
        break;
      case "Bash":
      case "command_execution":
        tally.ran++;
        break;
      case "WebFetch":
        tally.read++;
        break;
      case "Agent":
        tally.delegated++;
        break;
      default:
        tally.other++;
    }
  }
  return tally;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? `${singular}s`}`;
}

function buildToolSummary(tally: ToolTally, isStreaming?: boolean): string {
  const parts: string[] = [];
  const verb = isStreaming;
  if (tally.searched > 0)
    parts.push(`${verb ? "searching" : "searched"} ${pluralize(tally.searched, "pattern")}`);
  if (tally.read > 0) parts.push(`${verb ? "reading" : "read"} ${pluralize(tally.read, "file")}`);
  if (tally.edited > 0)
    parts.push(`${verb ? "editing" : "edited"} ${pluralize(tally.edited, "file")}`);
  if (tally.wrote > 0)
    parts.push(`${verb ? "writing" : "wrote"} ${pluralize(tally.wrote, "file")}`);
  if (tally.deleted > 0)
    parts.push(`${verb ? "deleting" : "deleted"} ${pluralize(tally.deleted, "file")}`);
  if (tally.ran > 0) parts.push(`${verb ? "running" : "ran"} ${pluralize(tally.ran, "command")}`);
  if (tally.delegated > 0)
    parts.push(`${verb ? "delegating" : "delegated"} ${pluralize(tally.delegated, "agent")}`);
  if (tally.other > 0) parts.push(`${verb ? "running" : "ran"} ${pluralize(tally.other, "tool")}`);
  if (parts.length === 0) return isStreaming ? "working…" : "done";
  // Capitalize first part
  const summary = parts.join(", ");
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

function ToolCallGroup({
  toolParts,
  isStreaming,
  onResolveApproval,
  onOpenFile,
  resolvingApprovalIds,
}: {
  toolParts: ParsedMessagePartEntry[];
  isStreaming?: boolean;
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  onOpenFile?: (filePath: string) => void;
  resolvingApprovalIds?: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const tally = tallyToolCalls(toolParts);
  const summary = buildToolSummary(tally, isStreaming);

  // For a single tool call, just render it directly (no summary needed)
  if (toolParts.length === 1) {
    return (
      <div>
        {toolParts.map(({ id, part }) => (
          <MessagePartRenderer
            key={id}
            part={part}
            isStreaming={isStreaming}
            onResolveApproval={onResolveApproval}
            onOpenFile={onOpenFile}
            resolvingApprovalIds={resolvingApprovalIds}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <ChevronRight
          className={["size-3 shrink-0 transition-transform", open ? "rotate-90" : ""].join(" ")}
        />
        <span>{summary}</span>
      </button>
      {open ? (
        <div className="mt-0.5 ml-[1.125rem]">
          {toolParts.map(({ id, part }) => (
            <MessagePartRenderer
              key={id}
              part={part}
              isStreaming={isStreaming}
              onResolveApproval={onResolveApproval}
              onOpenFile={onOpenFile}
              resolvingApprovalIds={resolvingApprovalIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContentPartGroup({
  compact,
  isStreaming,
  onResolveApproval,
  onOpenFile,
  parts,
  resolvingApprovalIds,
}: {
  compact: boolean;
  isStreaming?: boolean;
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  onOpenFile?: (filePath: string) => void;
  parts: ParsedMessagePartEntry[];
  resolvingApprovalIds?: ReadonlySet<string>;
}) {
  if (compact) {
    return (
      <div className="[&>*:last-child]:mb-0">
        {parts.map(({ id, part }, i) => (
          <MessagePartRenderer
            key={id}
            part={part}
            isStreaming={isStreaming && i === parts.length - 1}
            onResolveApproval={onResolveApproval}
            onOpenFile={onOpenFile}
            resolvingApprovalIds={resolvingApprovalIds}
          />
        ))}
      </div>
    );
  }

  // Thinking parts render without the bullet dot
  const isThinkingOnly = parts.every(({ part }) => part.type === "thinking");

  if (isThinkingOnly) {
    return (
      <div className="[&>*:last-child]:mb-0">
        {parts.map(({ id, part }, i) => (
          <MessagePartRenderer
            key={id}
            part={part}
            isStreaming={isStreaming && i === parts.length - 1}
            onResolveApproval={onResolveApproval}
            onOpenFile={onOpenFile}
            resolvingApprovalIds={resolvingApprovalIds}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 pt-px text-[18px] leading-[1] text-[var(--muted-foreground)]/60">
        &#8226;
      </span>
      <div className="min-w-0 flex-1 [&>*:last-child]:mb-0">
        {parts.map(({ id, part }, i) => (
          <MessagePartRenderer
            key={id}
            part={part}
            isStreaming={isStreaming && i === parts.length - 1}
            onResolveApproval={onResolveApproval}
            onOpenFile={onOpenFile}
            resolvingApprovalIds={resolvingApprovalIds}
          />
        ))}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  isStreaming,
  onResolveApproval,
  onOpenFile,
  resolvingApprovalIds,
}: {
  message: ParsedMessage;
  isStreaming?: boolean;
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  onOpenFile?: (filePath: string) => void;
  resolvingApprovalIds?: ReadonlySet<string>;
}) {
  const segments = buildAssistantSegments(message.parts);
  const isToolOnly = isToolOnlyAssistantMessage(message);

  return (
    <div
      className={[
        isToolOnly ? "px-4 py-1.5" : "px-4 py-3",
        "flex flex-col",
        isToolOnly ? "gap-1" : "gap-2.5",
      ].join(" ")}
    >
      {segments.map((segment, index) => {
        const isLastSegment = isStreaming && index === segments.length - 1;
        return segment.kind === "tool_call" ? (
          <ToolCallGroup
            key={getAssistantSegmentKey(segment)}
            toolParts={segment.parts}
            isStreaming={isLastSegment}
            onResolveApproval={onResolveApproval}
            onOpenFile={onOpenFile}
            resolvingApprovalIds={resolvingApprovalIds}
          />
        ) : (
          <ContentPartGroup
            key={getAssistantSegmentKey(segment)}
            compact={isToolOnly}
            isStreaming={isLastSegment}
            onResolveApproval={onResolveApproval}
            onOpenFile={onOpenFile}
            parts={segment.parts}
            resolvingApprovalIds={resolvingApprovalIds}
          />
        );
      })}
    </div>
  );
}

export const TranscriptMessage = memo(function TranscriptMessage({
  message,
  isStreaming,
  onResolveApproval,
  onOpenFile,
  resolvingApprovalIds,
}: {
  message: ParsedMessage;
  isStreaming?: boolean;
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  onOpenFile?: (filePath: string) => void;
  resolvingApprovalIds?: ReadonlySet<string>;
}) {
  if (message.role === "user") {
    return <UserMessage message={message} />;
  }
  return (
    <AssistantMessage
      message={message}
      isStreaming={isStreaming}
      onResolveApproval={onResolveApproval}
      onOpenFile={onOpenFile}
      resolvingApprovalIds={resolvingApprovalIds}
    />
  );
});
