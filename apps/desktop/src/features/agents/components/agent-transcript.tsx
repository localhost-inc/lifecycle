import { ChevronRight } from "lucide-react";
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
        <ToolCallPart toolName={part.toolName} inputJson={part.inputJson} outputJson={part.outputJson} status={part.status} errorText={part.errorText} isStreaming={isStreaming} onOpenFile={onOpenFile} />
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
      activeToolParts.push(part);
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

function ToolCallList({
  toolParts,
  isStreaming,
  spacedFromPrevious,
  onResolveApproval,
  onOpenFile,
  resolvingApprovalIds,
}: {
  toolParts: ParsedMessagePartEntry[];
  isStreaming?: boolean;
  spacedFromPrevious: boolean;
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  onOpenFile?: (filePath: string) => void;
  resolvingApprovalIds?: ReadonlySet<string>;
}) {
  return (
    <div className={spacedFromPrevious ? "mt-2" : ""}>
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
    <div className={isToolOnly ? "px-4 py-1.5" : "px-4 py-3"}>
      {segments.map((segment, index) => {
        const isLastSegment = isStreaming && index === segments.length - 1;
        return segment.kind === "tool_call" ? (
          <ToolCallList
            key={getAssistantSegmentKey(segment)}
            toolParts={segment.parts}
            isStreaming={isLastSegment}
            spacedFromPrevious={!isToolOnly && index > 0}
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

export function TranscriptMessage({
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
}
