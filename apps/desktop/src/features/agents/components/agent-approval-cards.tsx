import { useState } from "react";
import type { AgentApprovalDecision, AgentMessagePart } from "@lifecycle/agents";
import { isRecord } from "@/features/agents/components/agent-message-parsing";

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
  const isApproved = part.status === "approved_session" || part.status === "approved_once";
  const isRejected = part.status === "rejected";
  const statusLabel =
    part.status === "approved_session"
      ? "approved for session"
      : part.status === "approved_once"
        ? "approved"
        : isRejected
          ? "rejected"
          : (part.status ?? "pending");
  const statusColor = isApproved
    ? "text-[var(--terminal-ansi-green)]"
    : isRejected
      ? "text-[var(--terminal-ansi-red)]"
      : "text-[var(--muted-foreground)]";

  return (
    <div className="my-0.5 text-[12px]">
      <div className="text-[var(--foreground)]">{part.message ?? "Approval request"}</div>
      <div className={statusColor}>{statusLabel}</div>
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
  const input = metadata?.input;
  const command = isRecord(input) && typeof input.command === "string" ? input.command : null;
  const filePath = isRecord(input) && typeof input.file_path === "string" ? input.file_path : null;
  const suggestions = Array.isArray(metadata?.suggestions) && metadata.suggestions.length > 0;

  const detail = command ?? filePath;

  return (
    <div className="my-1 text-[12px]">
      <div className="text-[var(--foreground)]">
        {part.message ?? "Approval required"}
        {detail ? (
          <>
            {": "}
            <span className="text-[var(--muted-foreground)]">{detail}</span>
          </>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          className="rounded bg-[var(--foreground)] px-2 py-0.5 text-[11px] font-medium text-[var(--background)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void onResolve("approve_once")}
          type="button"
        >
          Allow
        </button>
        {suggestions ? (
          <button
            className="rounded bg-[var(--foreground)] px-2 py-0.5 text-[11px] font-medium text-[var(--background)] disabled:opacity-50"
            disabled={disabled}
            onClick={() => void onResolve("approve_session")}
            type="button"
          >
            Allow for session
          </button>
        ) : null}
        <button
          className="rounded bg-[var(--muted-foreground)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)] disabled:opacity-50"
          disabled={disabled}
          onClick={() => void onResolve("reject")}
          type="button"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

export function ApprovalRefPart({
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
