import { EmptyState, Popover, PopoverContent, PopoverTrigger, Shimmer, Spinner } from "@lifecycle/ui";
import { Bot, ChevronDown, ChevronRight, Wrench } from "lucide-react";
import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type {
  AgentApprovalDecision,
  AgentApprovalKind,
  AgentApprovalStatus,
  AgentArtifactType,
  AgentMessagePart,
  AgentToolCallStatus,
} from "@lifecycle/agents";
import { parseAgentMessagePartData, type AgentMessagePartRecord } from "@lifecycle/contracts";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import "streamdown/styles.css";
import { createPatch } from "diff";
import { PatchDiff } from "@pierre/diffs/react";
import { diffTheme } from "@lifecycle/ui";
import { useSettings } from "@/features/settings/state/settings-provider";
import {
  claudeEffortOptions,
  codexReasoningEffortOptions,
  type ClaudeEffort,
  type CodexReasoningEffort,
} from "@/features/settings/state/harness-settings";
import { DiffRenderProvider } from "@/features/git/components/diff-render-provider";
import { useAgentSession, useAgentSessionMessages } from "@/features/agents/hooks";
import { useProviderModelCatalog } from "@/features/agents/state/use-provider-model-catalog";
import { useAgentSessionState } from "@/features/agents/state/agent-session-state";
import { ResponseReadyDot } from "@/components/response-ready-dot";
import { ClaudeIcon, CodexIcon } from "@/features/workspaces/surfaces/surface-icons";
import { useAgentOrchestrator } from "@/store/provider";

const streamdownPlugins = { code };
const claudeEffortLabelByValue = new Map(claudeEffortOptions.map((option) => [option.value, option.label]));
const codexReasoningLabelByValue = new Map(
  codexReasoningEffortOptions.map((option) => [option.value, option.label]),
);

// ---------------------------------------------------------------------------
// Convert DB part records → AgentMessagePart for rendering
// ---------------------------------------------------------------------------

interface ParsedMessage {
  id: string;
  role: string;
  parts: AgentMessagePart[];
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function partRecordToPart(record: AgentMessagePartRecord): AgentMessagePart {
  const data = parseAgentMessagePartData(record.part_type, record.data) as Record<
    string,
    unknown
  > | null;
  const readString = (key: string): string | undefined => {
    const value = data?.[key];
    return typeof value === "string" ? value : undefined;
  };

  switch (record.part_type) {
    case "text":
      return { type: "text", text: record.text ?? "" };
    case "thinking":
      return { type: "thinking", text: record.text ?? "" };
    case "status":
      return { type: "status", text: record.text ?? "" };
    case "tool_call":
      return {
        type: "tool_call",
        toolCallId: readString("tool_call_id") ?? "",
        toolName: readString("tool_name") ?? "",
        inputJson: readString("input_json"),
        outputJson: readString("output_json"),
        status: readString("status") as AgentToolCallStatus | undefined,
        errorText: readString("error_text"),
      };
    case "tool_result":
      return {
        type: "tool_result",
        toolCallId: readString("tool_call_id") ?? "",
        outputJson: readString("output_json"),
        errorText: readString("error_text"),
      };
    case "attachment_ref":
      return { type: "attachment_ref", attachmentId: readString("attachment_id") ?? "" };
    case "approval_ref":
      return {
        type: "approval_ref",
        approvalId: readString("approval_id") ?? "",
        decision: readString("decision") as AgentApprovalDecision | undefined,
        kind: readString("kind") as AgentApprovalKind | undefined,
        message: readString("message"),
        metadata: (data?.metadata as Record<string, unknown> | undefined) ?? undefined,
        status: readString("status") as AgentApprovalStatus | undefined,
      };
    case "artifact_ref":
      return {
        type: "artifact_ref",
        artifactId: readString("artifact_id") ?? "",
        artifactType: readString("artifact_type") as AgentArtifactType | undefined,
        title: readString("title"),
        uri: readString("uri"),
      };
    default:
      return { type: "text", text: record.text ?? "" };
  }
}

function createTurnId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-turn-${Date.now()}`;
}

function ensureSelectedOption<T extends string>(
  options: readonly { id: T; label: string }[],
  value: T,
): { id: T; label: string }[] {
  if (options.some((option) => option.id === value)) {
    return [...options];
  }

  return [{ id: value, label: value }, ...options];
}

function buildReasoningOptions<T extends string>(
  provider: "claude" | "codex",
  reasoningEfforts: string[],
  selected: T,
): Array<{ id: T; label: string }> {
  const labelMap: ReadonlyMap<string, string> =
    provider === "claude" ? claudeEffortLabelByValue : codexReasoningLabelByValue;
  const ids = Array.from(new Set(["default", ...reasoningEfforts])) as T[];
  const options = ids.map((id) => ({
    id,
    label: labelMap.get(id) ?? id,
  }));

  return ensureSelectedOption(options, selected);
}

// ---------------------------------------------------------------------------
// Part renderers
// ---------------------------------------------------------------------------

function TextPart({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  return (
    <Streamdown
      className="agent-streamdown min-w-0 text-[13px] leading-6 text-[var(--foreground)]"
      mode={isStreaming ? "streaming" : "static"}
      isAnimating={isStreaming}
      plugins={streamdownPlugins}
      lineNumbers={false}
    >
      {text}
    </Streamdown>
  );
}

function ThinkingPart({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isStreaming) {
      startRef.current = Date.now();
      const interval = setInterval(() => {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    setElapsed(Math.round((Date.now() - startRef.current) / 1000));
  }, [isStreaming]);

  const label = isStreaming
    ? `thinking${elapsed > 0 ? ` ${elapsed}s` : ""}`
    : `thought for ${Math.max(elapsed, 1)}s`;

  return (
    <div className="my-1">
      <button
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <ChevronRight
          className={["size-3 transition-transform", open ? "rotate-90" : ""].join(" ")}
        />
        <span className={isStreaming ? "agent-cursor-blink" : ""}>{label}</span>
      </button>
      {open ? (
        <pre className="mt-1 whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 text-[12px] leading-5 text-[var(--muted-foreground)]">
          {text}
        </pre>
      ) : null}
    </div>
  );
}

function extractToolMeta(toolName: string, inputJson?: string): string | null {
  if (!inputJson) return null;
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    const fileChangeSummary = (() => {
      const changes = input.changes;
      if (!Array.isArray(changes) || changes.length === 0) {
        return null;
      }

      const normalized = changes.flatMap((change) => {
        if (!change || typeof change !== "object" || Array.isArray(change)) {
          return [];
        }
        const record = change as Record<string, unknown>;
        const path = typeof record.path === "string" ? record.path : null;
        const kind = typeof record.kind === "string" ? record.kind : null;
        if (!path || !kind) {
          return [];
        }
        return [{ kind, path }] as const;
      });

      if (normalized.length === 0) {
        return null;
      }

      if (normalized.length === 1) {
        const change = normalized[0]!;
        return `${change.kind} ${change.path.replace(/.*\//, "")}`;
      }

      return `${normalized.length} files`;
    })();

    switch (toolName) {
      case "Read":
      case "Write":
      case "Edit":
      case "Delete":
      case "DeleteFile":
        return typeof input.file_path === "string" ? input.file_path.replace(/.*\//, "") : null;
      case "Glob":
      case "Grep":
        return typeof input.pattern === "string" ? input.pattern : null;
      case "Bash":
      case "command_execution":
        return typeof input.command === "string"
          ? input.command.length > 60
            ? `${input.command.slice(0, 57)}...`
            : input.command
          : null;
      case "file_change":
        return fileChangeSummary;
      case "Agent":
        return typeof input.subagent_type === "string"
          ? input.subagent_type
          : typeof input.description === "string"
            ? input.description
            : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
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

function buildToolPatch(inputJson: string): string | null {
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    const diff = typeof input.diff === "string" ? input.diff : null;
    const unifiedDiff = typeof input.unified_diff === "string" ? input.unified_diff : null;
    if (diff) return diff;
    if (unifiedDiff) return unifiedDiff;
    const filePath = typeof input.file_path === "string" ? input.file_path : "file";
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
    <div className="mt-1 overflow-hidden rounded border border-[var(--border)] text-[12px]">
      <PatchDiff patch={patch} />
    </div>
  );
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

function ToolCallPart({ toolName, inputJson }: { toolName: string; inputJson?: string }) {
  const meta = extractToolMeta(toolName, inputJson);
  const displayName = formatToolName(toolName);
  const [open, setOpen] = useState(false);
  const diffInputJson = typeof inputJson === "string" ? inputJson : null;
  const hasToolDiff =
    (toolName === "Edit" || toolName === "Write" || toolName === "Delete") &&
    diffInputJson !== null &&
    buildToolPatch(diffInputJson) !== null;
  const agentPrompt = toolName === "Agent" ? extractAgentPrompt(inputJson) : null;
  const isExpandable = hasToolDiff || agentPrompt;

  return (
    <div className="my-0.5">
      <button
        className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        onClick={() => isExpandable && setOpen(!open)}
        type="button"
      >
        <Wrench className="size-3 shrink-0" />
        <span className="font-semibold">{displayName}</span>
        {meta ? <span className="truncate text-[var(--muted-foreground)]/50">{meta}</span> : null}
        {isExpandable ? (
          <ChevronRight
            className={["size-3 shrink-0 transition-transform", open ? "rotate-90" : ""].join(" ")}
          />
        ) : null}
      </button>
      {open && hasToolDiff && diffInputJson ? <ToolDiffView inputJson={diffInputJson} /> : null}
      {open && agentPrompt ? (
        <pre className="mt-1 whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 text-[12px] leading-5 text-[var(--muted-foreground)]">
          {agentPrompt}
        </pre>
      ) : null}
    </div>
  );
}

function StatusPart({ text }: { text: string }) {
  return <div className="text-[11px] text-[var(--muted-foreground)]/70">{text}</div>;
}

interface ApprovalQuestionOption {
  description?: string;
  label: string;
  preview?: string;
}

interface ApprovalQuestionPrompt {
  header: string;
  id?: string;
  multiSelect?: boolean;
  options: ApprovalQuestionOption[];
  question: string;
}

function parseApprovalQuestions(
  metadata: Record<string, unknown> | null | undefined,
): ApprovalQuestionPrompt[] {
  const questions = metadata?.questions;
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.flatMap((question): ApprovalQuestionPrompt[] => {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      return [];
    }
    const questionRecord = question as Record<string, unknown>;
    const prompt = typeof questionRecord.question === "string" ? questionRecord.question : "";
    const header = typeof questionRecord.header === "string" ? questionRecord.header : prompt;
    const options = Array.isArray(questionRecord.options)
      ? questionRecord.options.flatMap((option): ApprovalQuestionOption[] => {
          if (!option || typeof option !== "object" || Array.isArray(option)) {
            return [];
          }
          const optionRecord = option as Record<string, unknown>;
          return typeof optionRecord.label === "string"
            ? [
                {
                  label: optionRecord.label,
                  description:
                    typeof optionRecord.description === "string"
                      ? optionRecord.description
                      : undefined,
                  preview:
                    typeof optionRecord.preview === "string" ? optionRecord.preview : undefined,
                },
              ]
            : [];
        })
      : [];

    if (!prompt || options.length === 0) {
      return [];
    }

    return [
      {
        header,
        id: typeof questionRecord.id === "string" ? questionRecord.id : undefined,
        multiSelect: questionRecord.multiSelect === true,
        options,
        question: prompt,
      },
    ];
  });
}

function ApprovalSummary({ part }: { part: Extract<AgentMessagePart, { type: "approval_ref" }> }) {
  const statusLabel =
    part.status === "approved_session"
      ? "approved for session"
      : part.status === "approved_once"
        ? "approved"
        : part.status === "rejected"
          ? "rejected"
          : (part.status ?? "pending");

  return (
    <div className="my-2 rounded border border-[var(--border)] bg-[var(--surface-hover)]/40 px-3 py-2 text-[12px]">
      <div className="font-medium text-[var(--foreground)]">
        {part.message ?? "Approval request"}
      </div>
      <div className="mt-1 text-[var(--muted-foreground)]">{statusLabel}</div>
    </div>
  );
}

function ApprovalQuestionCard({
  disabled,
  onResolve,
  part,
}: {
  disabled: boolean;
  onResolve: (
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  part: Extract<AgentMessagePart, { type: "approval_ref" }>;
}) {
  const questions = parseApprovalQuestions(part.metadata);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    const answers: Record<string, string> = {};

    for (const prompt of questions) {
      const answerKey = prompt.id ?? prompt.question;
      const otherAnswer = otherAnswers[prompt.question]?.trim();
      if (otherAnswer) {
        answers[answerKey] = otherAnswer;
        continue;
      }

      const selected = selectedAnswers[prompt.question] ?? [];
      if (selected.length === 0) {
        setLocalError(`Select an answer for "${prompt.header}".`);
        return;
      }
      answers[answerKey] = selected.join(", ");
    }

    setLocalError(null);
    await onResolve("approve_once", {
      answers,
      questions: questions.map((question) => ({
        header: question.header,
        id: question.id,
        multiSelect: question.multiSelect === true,
        options: question.options.map((option) => ({
          description: option.description,
          label: option.label,
          ...(option.preview ? { preview: option.preview } : {}),
        })),
        question: question.question,
      })),
    });
  }

  return (
    <div className="my-2 rounded border border-[var(--border)] bg-[var(--surface-hover)]/40 px-3 py-3 text-[12px]">
      <div className="font-medium text-[var(--foreground)]">
        {part.message ?? "Claude needs input"}
      </div>
      <div className="mt-3 space-y-3">
        {questions.map((prompt) => {
          const selected = selectedAnswers[prompt.question] ?? [];
          return (
            <div key={prompt.question}>
              <div className="mb-2 text-[var(--foreground)]">{prompt.question}</div>
              <div className="space-y-1.5">
                {prompt.options.map((option) => {
                  const checked = selected.includes(option.label);
                  return (
                    <label
                      key={option.label}
                      className="flex cursor-pointer items-start gap-2 rounded border border-[var(--border)] px-2 py-1.5"
                    >
                      <input
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => {
                          const nextSelected = selected.filter((value) => value !== option.label);
                          const value = event.target.checked
                            ? [...nextSelected, option.label]
                            : nextSelected;
                          setSelectedAnswers((prev) => ({
                            ...prev,
                            [prompt.question]: prompt.multiSelect ? value : value.slice(-1),
                          }));
                        }}
                        type={prompt.multiSelect ? "checkbox" : "radio"}
                      />
                      <div>
                        <div className="text-[var(--foreground)]">{option.label}</div>
                        {option.description ? (
                          <div className="text-[var(--muted-foreground)]">{option.description}</div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
                <input
                  className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-[12px] text-[var(--foreground)] outline-none"
                  disabled={disabled}
                  onChange={(event) => {
                    const value = event.target.value;
                    setOtherAnswers((prev) => ({ ...prev, [prompt.question]: value }));
                  }}
                  placeholder="Other"
                  value={otherAnswers[prompt.question] ?? ""}
                />
              </div>
            </div>
          );
        })}
      </div>
      {localError ? <div className="mt-2 text-[var(--destructive)]">{localError}</div> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded border border-[var(--border)] px-2 py-1 text-[var(--foreground)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void handleSubmit()}
          type="button"
        >
          Continue
        </button>
        <button
          className="rounded border border-[var(--border)] px-2 py-1 text-[var(--muted-foreground)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void onResolve("reject")}
          type="button"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function ApprovalElicitationCard({
  disabled,
  onResolve,
  part,
}: {
  disabled: boolean;
  onResolve: (
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  part: Extract<AgentMessagePart, { type: "approval_ref" }>;
}) {
  const [jsonDraft, setJsonDraft] = useState("{}");
  const [localError, setLocalError] = useState<string | null>(null);
  const metadata = part.metadata;
  const url = typeof metadata?.url === "string" ? metadata.url : null;
  const requestedSchema = isRecord(metadata?.requestedSchema) ? metadata.requestedSchema : null;

  async function handleSubmit(): Promise<void> {
    if (!requestedSchema) {
      setLocalError(null);
      await onResolve("approve_once");
      return;
    }

    try {
      const parsed = JSON.parse(jsonDraft) as unknown;
      if (!isRecord(parsed)) {
        throw new Error("Response must be a JSON object.");
      }
      setLocalError(null);
      await onResolve("approve_once", parsed);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Invalid JSON response.");
    }
  }

  return (
    <div className="my-2 rounded border border-[var(--border)] bg-[var(--surface-hover)]/40 px-3 py-3 text-[12px]">
      <div className="font-medium text-[var(--foreground)]">{part.message ?? "Input required"}</div>
      {url ? (
        <a
          className="mt-2 inline-block text-[var(--accent)] underline"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          Open requested URL
        </a>
      ) : null}
      {requestedSchema ? (
        <textarea
          className="mt-3 min-h-[96px] w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 font-[var(--font-mono)] text-[11px] text-[var(--foreground)] outline-none"
          disabled={disabled}
          onChange={(event) => setJsonDraft(event.target.value)}
          value={jsonDraft}
        />
      ) : null}
      {localError ? <div className="mt-2 text-[var(--destructive)]">{localError}</div> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded border border-[var(--border)] px-2 py-1 text-[var(--foreground)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void handleSubmit()}
          type="button"
        >
          Continue
        </button>
        <button
          className="rounded border border-[var(--border)] px-2 py-1 text-[var(--muted-foreground)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void onResolve("reject")}
          type="button"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function ApprovalToolCard({
  disabled,
  onResolve,
  part,
}: {
  disabled: boolean;
  onResolve: (
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  part: Extract<AgentMessagePart, { type: "approval_ref" }>;
}) {
  const metadata = part.metadata;
  const toolName = typeof metadata?.toolName === "string" ? metadata.toolName : null;
  const input = metadata?.input;
  const command = isRecord(input) && typeof input.command === "string" ? input.command : null;
  const filePath = isRecord(input) && typeof input.file_path === "string" ? input.file_path : null;
  const suggestions = Array.isArray(metadata?.suggestions) && metadata.suggestions.length > 0;

  return (
    <div className="my-2 rounded border border-[var(--border)] bg-[var(--surface-hover)]/40 px-3 py-3 text-[12px]">
      <div className="font-medium text-[var(--foreground)]">
        {part.message ?? "Approval required"}
      </div>
      {toolName ? (
        <div className="mt-1 text-[var(--muted-foreground)]">Tool: {toolName}</div>
      ) : null}
      {command ? (
        <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--foreground)]">
          {command}
        </pre>
      ) : null}
      {filePath ? <div className="mt-2 text-[var(--muted-foreground)]">{filePath}</div> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded border border-[var(--border)] px-2 py-1 text-[var(--foreground)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void onResolve("approve_once")}
          type="button"
        >
          Approve once
        </button>
        {suggestions ? (
          <button
            className="rounded border border-[var(--border)] px-2 py-1 text-[var(--foreground)] disabled:opacity-50"
            disabled={disabled}
            onClick={() => void onResolve("approve_session")}
            type="button"
          >
            Approve session
          </button>
        ) : null}
        <button
          className="rounded border border-[var(--border)] px-2 py-1 text-[var(--muted-foreground)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void onResolve("reject")}
          type="button"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function ApprovalRefPart({
  onResolve,
  part,
  resolving,
}: {
  onResolve?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  part: Extract<AgentMessagePart, { type: "approval_ref" }>;
  resolving: boolean;
}) {
  const isPending = part.status === "pending" && !part.decision;
  if (!isPending || !onResolve) {
    return <ApprovalSummary part={part} />;
  }

  const questions = parseApprovalQuestions(part.metadata);
  if (part.kind === "question" && questions.length > 0) {
    return (
        <ApprovalQuestionCard
          disabled={resolving}
          onResolve={(decision, response) => onResolve(part.approvalId, decision, response)}
          part={part}
        />
    );
  }

  if (part.kind === "question") {
    return (
        <ApprovalElicitationCard
          disabled={resolving}
          onResolve={(decision, response) => onResolve(part.approvalId, decision, response)}
          part={part}
        />
    );
  }

  return (
    <ApprovalToolCard
      disabled={resolving}
      onResolve={(decision, response) => onResolve(part.approvalId, decision, response)}
      part={part}
    />
  );
}

function MessagePartRenderer({
  onResolveApproval,
  part,
  resolvingApprovalIds,
  isStreaming,
}: {
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
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
      return <ToolCallPart toolName={part.toolName} inputJson={part.inputJson} />;
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

// ---------------------------------------------------------------------------
// Message renderers — single path, reads from DB collection
// ---------------------------------------------------------------------------

function UserMessage({ message }: { message: ParsedMessage }) {
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");

  return (
    <div className="bg-[var(--surface-hover)]/50 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="shrink-0 pt-[3px] text-[13px] text-[var(--accent)]">&#9654;</span>
        <pre className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--foreground)]">
          {text}
        </pre>
      </div>
    </div>
  );
}

function isToolOnlyAssistantMessage(message: ParsedMessage): boolean {
  return message.parts.every(
    (part) =>
      part.type === "tool_call" ||
      part.type === "tool_result" ||
      part.type === "status" ||
      part.type === "attachment_ref" ||
      part.type === "artifact_ref",
  );
}

function AssistantMessage({
  message,
  isStreaming,
  onResolveApproval,
  resolvingApprovalIds,
}: {
  message: ParsedMessage;
  isStreaming?: boolean;
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
  resolvingApprovalIds?: ReadonlySet<string>;
}) {
  const toolParts = message.parts.filter((p) => p.type === "tool_call");
  const contentParts = message.parts.filter((p) => p.type !== "tool_call" && p.type !== "tool_result");
  const hasContent = contentParts.some(
    (p) => p.type === "text" || p.type === "thinking" || p.type === "approval_ref",
  );
  const isToolOnly = isToolOnlyAssistantMessage(message);

  return (
    <div className={isToolOnly ? "px-4 py-1.5" : "px-4 py-3"}>
      {hasContent ? (
        <div className="flex items-start gap-2">
          <span className="shrink-0 pt-[3px] text-[13px] text-[var(--muted-foreground)]/60">
            &#8226;
          </span>
          <div className="min-w-0 flex-1 [&>*:last-child]:mb-0">
            {contentParts.map((part, i) => (
              <MessagePartRenderer
                key={i}
                part={part}
                isStreaming={isStreaming}
                onResolveApproval={onResolveApproval}
                resolvingApprovalIds={resolvingApprovalIds}
              />
            ))}
          </div>
        </div>
      ) : null}
      {toolParts.length > 0 ? (
        <div className={hasContent ? "mt-2 pl-5" : ""}>
          {toolParts.map((part, i) => (
            <MessagePartRenderer
              key={i}
              part={part}
              isStreaming={isStreaming}
              onResolveApproval={onResolveApproval}
              resolvingApprovalIds={resolvingApprovalIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TranscriptMessage({
  message,
  isStreaming,
  onResolveApproval,
  resolvingApprovalIds,
}: {
  message: ParsedMessage;
  isStreaming?: boolean;
  onResolveApproval?: (
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ) => Promise<void>;
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
      resolvingApprovalIds={resolvingApprovalIds}
    />
  );
}

// ---------------------------------------------------------------------------
// Inline dropdown
// ---------------------------------------------------------------------------

function InlineDropdown<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          type="button"
        >
          <span className="text-[var(--muted-foreground)]/50">{label}</span>
          <span className="text-[var(--foreground)]">{selected?.label}</span>
          <ChevronDown className="size-2.5 text-[var(--muted-foreground)]/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[80px] p-0.5" side="top" sideOffset={4} align="start">
        {options.map((option) => (
          <button
            key={option.id}
            className={[
              "block w-full rounded-sm px-2.5 py-1 text-left text-[11px] transition-colors",
              option.id === value
                ? "text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
            ].join(" ")}
            onClick={() => {
              onChange(option.id);
              setOpen(false);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

interface AgentSurfaceProps {
  agentSessionId: string;
  workspaceId: string;
}

export function AgentSurface({ agentSessionId, workspaceId }: AgentSurfaceProps) {
  const agentOrchestrator = useAgentOrchestrator();
  const session = useAgentSession(workspaceId, agentSessionId);
  const dbMessages = useAgentSessionMessages(agentSessionId);
  const state = useAgentSessionState(agentSessionId);
  const { harnesses, resolvedTheme, setClaudeHarnessSettings, setCodexHarnessSettings } =
    useSettings();
  const providerForCatalog = session?.provider === "codex" ? "codex" : "claude";
  const modelCatalog = useProviderModelCatalog(providerForCatalog, {
    loginMethod: harnesses.claude.loginMethod,
    preferredModel:
      providerForCatalog === "claude" ? harnesses.claude.model : harnesses.codex.model,
  });
  const [draftPrompt, setDraftPrompt] = useState("");
  const [resolvingApprovalIds, setResolvingApprovalIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isRunning = isSending || state.pendingTurnIds.length > 0;
  const showCursorBlink = !isRunning && draftPrompt.length === 0;
  const theme = diffTheme(resolvedTheme);

  // Track elapsed time while the agent is working
  const thinkingStartRef = useRef<number | null>(null);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);

  useEffect(() => {
    if (isRunning) {
      if (thinkingStartRef.current === null) {
        thinkingStartRef.current = Date.now();
      }
      setThinkingElapsed(0);
      const interval = setInterval(() => {
        setThinkingElapsed(
          Math.round((Date.now() - (thinkingStartRef.current ?? Date.now())) / 1000),
        );
      }, 1000);
      return () => clearInterval(interval);
    }
    thinkingStartRef.current = null;
    setThinkingElapsed(0);
  }, [isRunning]);

  // Escape key to interrupt current turn
  useEffect(() => {
    if (!isRunning) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        const activeTurnId = state.pendingTurnIds[0] ?? null;
        void (async () => {
          try {
            if (!session?.id) {
              return;
            }
            await agentOrchestrator.cancelTurn(session.id, { turnId: activeTurnId });
          } catch (err) {
            console.error("[agent] cancel turn failed:", err);
          }
        })();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isRunning, state.pendingTurnIds, agentOrchestrator, session?.id]);

  // Live query returns messages ordered by created_at via IVM.
  const messages = useMemo<ParsedMessage[]>(
    () =>
      (dbMessages.data ?? []).map((record) => ({
        id: record.id,
        role: record.role,
        text: record.text,
        parts:
          record.parts.length > 0
            ? record.parts.map(partRecordToPart)
            : record.text.length > 0
              ? [{ type: "text" as const, text: record.text }]
              : [],
      })),
    [dbMessages.data],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isRunning, messages]);

  async function handleSend(): Promise<void> {
    if (!session) return;
    const prompt = draftPrompt.trim();
    if (prompt.length === 0 || isSending) return;

    setIsSending(true);
    setSendError(null);

    try {
      await agentOrchestrator.sendTurn(session.id, {
        turnId: createTurnId(),
        input: [{ type: "text", text: prompt }],
      });
      setDraftPrompt("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send prompt.");
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleResolveApproval(
    approvalId: string,
    decision: AgentApprovalDecision,
    response?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!session) {
      return;
    }

    setResolvingApprovalIds((prev) => {
      const next = new Set(prev);
      next.add(approvalId);
      return next;
    });
    setSendError(null);

    try {
      await agentOrchestrator.resolveApproval(session.id, {
        approvalId,
        decision,
        response: response ?? null,
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to resolve approval.");
    } finally {
      setResolvingApprovalIds((prev) => {
        const next = new Set(prev);
        next.delete(approvalId);
        return next;
      });
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    setDraftPrompt(event.target.value);
    const el = event.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  if (!session) {
    return (
      <EmptyState
        description="Lifecycle could not find this agent session."
        icon={<Bot />}
        title="Agent unavailable"
      />
    );
  }

  if (dbMessages.error) {
    return (
      <DiffRenderProvider theme={theme}>
        <EmptyState
          description={dbMessages.error.message}
          icon={<Bot />}
          title="Agent transcript unavailable"
        />
      </DiffRenderProvider>
    );
  }

  const providerName = session.provider === "claude" ? "claude" : "codex";
  const sessionSlug = session.id.slice(0, 8);
  const visibleError = sendError ?? state.lastError;
  const isClaude = session.provider === "claude";
  const selectedModel = isClaude ? harnesses.claude.model : harnesses.codex.model;
  const selectedCatalogModel =
    modelCatalog.catalog?.models.find((model) => model.value === selectedModel) ?? null;
  const modelOptions = ensureSelectedOption(
    (modelCatalog.catalog?.models ?? []).map((option) => ({
      id: option.value,
      label: option.label,
    })),
    selectedModel,
  );
  const reasoningLabel = isClaude ? "effort" : "reasoning";
  const selectedReasoning = isClaude ? harnesses.claude.effort : harnesses.codex.reasoningEffort;
  const reasoningOptions = buildReasoningOptions(
    session.provider,
    selectedCatalogModel?.reasoningEfforts ?? [],
    selectedReasoning,
  );
  const ProviderIcon = isClaude ? ClaudeIcon : CodexIcon;

  const lastMessage = messages[messages.length - 1];
  const showThinking = isRunning && lastMessage?.role === "user";

  function handleModelChange(value: string): void {
    const nextCatalogModel =
      modelCatalog.catalog?.models.find((model) => model.value === value) ?? null;
    const supportedReasoning = new Set(nextCatalogModel?.reasoningEfforts ?? []);
    if (isClaude) {
      setClaudeHarnessSettings({
        ...harnesses.claude,
        effort:
          harnesses.claude.effort === "default" || supportedReasoning.has(harnesses.claude.effort)
            ? harnesses.claude.effort
            : "default",
        model: value,
      });
      return;
    }

    setCodexHarnessSettings({
      ...harnesses.codex,
      model: value,
      reasoningEffort:
        harnesses.codex.reasoningEffort === "default" ||
        supportedReasoning.has(harnesses.codex.reasoningEffort)
          ? harnesses.codex.reasoningEffort
          : "default",
    });
  }

  function handleReasoningChange(value: ClaudeEffort | CodexReasoningEffort): void {
    if (isClaude) {
      setClaudeHarnessSettings({
        ...harnesses.claude,
        effort: value as ClaudeEffort,
      });
      return;
    }

    setCodexHarnessSettings({
      ...harnesses.codex,
      reasoningEffort: value as CodexReasoningEffort,
    });
  }

  return (
    <DiffRenderProvider theme={theme}>
      <section className="agent-surface flex h-full min-h-0 flex-col bg-[var(--terminal-surface,var(--surface))]">
        {/* Transcript + input */}
        <div
          ref={scrollRef}
          className="agent-message-list flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
          onClick={() => textareaRef.current?.focus()}
        >
          <div className="flex-1" />

          {/* Auth status */}
          {state.authStatus?.mode === "authenticating" ? (
            <div className="px-4 py-3 text-[13px] leading-6 text-[var(--muted-foreground)]">
              <span className="text-[var(--accent)]">[~]</span> signing in to {providerName}...
            </div>
          ) : null}
          {state.authStatus?.mode === "error" ? (
            <div className="px-4 py-3 text-[13px] leading-6 text-[var(--destructive)]">
              <span>[!]</span> authentication failed
            </div>
          ) : null}

          {/* Messages — single source from DB collection */}
          {messages.map((message, i) => (
            <TranscriptMessage
              key={message.id}
              message={message}
              isStreaming={isRunning && i === messages.length - 1 && message.role === "assistant"}
              onResolveApproval={handleResolveApproval}
              resolvingApprovalIds={resolvingApprovalIds}
            />
          ))}

          {/* Working indicator */}
          {showThinking ? (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 text-[13px]">
                <span className="agent-cursor-blink text-[var(--muted-foreground)]">&#8226;</span>
                <Shimmer as="span" duration={2} spread={2} className="text-[13px]">
                  Working
                </Shimmer>
                <span className="text-[var(--muted-foreground)]/50">
                  ({thinkingElapsed}s · esc to interrupt)
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Input */}
        <div className="shrink-0 bg-[var(--surface-hover)]/50">
          <div className="flex items-start px-4 pt-3 pb-2">
            <span className="shrink-0 pt-[3px] text-[13px] text-[var(--accent)]">
              &#9654;&nbsp;
            </span>
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={`w-full resize-none overflow-hidden bg-transparent font-[var(--font-mono)] text-[13px] leading-6 text-[var(--foreground)] outline-none p-0 m-0 ${showCursorBlink ? "caret-transparent" : "caret-[var(--foreground)]"}`}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder=""
                rows={1}
                style={{ height: "auto" }}
                value={draftPrompt}
              />
              {showCursorBlink ? (
                <span className="agent-cursor-blink pointer-events-none absolute left-0 top-[5px] h-[14px] w-[7px] bg-[var(--foreground)]" />
              ) : null}
            </div>
          </div>
          {visibleError ? (
            <div className="px-4 pb-1 text-[12px] text-[var(--destructive)]">
              <span>[!]</span> {visibleError}
            </div>
          ) : null}
        </div>

        {/* Model & Reasoning — on bare surface */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-1.5">
          <div
            aria-label={`${providerName} provider`}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"
            title={providerName}
          >
            {isRunning ? (
              <Spinner className="size-3 text-[var(--muted-foreground)]" />
            ) : state.responseReady ? (
              <ResponseReadyDot className="scale-[0.85]" />
            ) : (
              <ProviderIcon size={12} />
            )}
            <span>{providerName}</span>
          </div>
          <InlineDropdown
            options={modelOptions}
            value={selectedModel}
            onChange={handleModelChange}
            label="model"
          />
          <InlineDropdown
            options={reasoningOptions}
            value={selectedReasoning}
            onChange={handleReasoningChange}
            label={reasoningLabel}
          />
          {modelCatalog.isLoading ? (
            <span className="text-[11px] text-[var(--muted-foreground)]/60">loading catalog…</span>
          ) : null}
          {modelCatalog.error ? (
            <span
              className="text-[11px] text-[var(--destructive)]"
              title={modelCatalog.error.message}
            >
              catalog unavailable
            </span>
          ) : null}
          {state.providerStatus ? (
            <span className="text-[11px] text-[var(--warning,var(--accent))]">
              {state.providerStatus}
            </span>
          ) : null}
          <span className="ml-auto text-[11px] text-[var(--muted-foreground)]/50">
            {sessionSlug}
          </span>
        </div>

        <style>{`
        @keyframes agent-cursor-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        .agent-cursor-blink {
          animation: agent-cursor-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
      </section>
    </DiffRenderProvider>
  );
}
