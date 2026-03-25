import { useState, type ComponentType } from "react";
import {
  Dialog,
  DialogClose,
  DialogPopup,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lifecycle/ui";
import { Brain, Bug, ChevronDown, Shield, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AgentSessionDisplayStatus, AgentSessionState, AgentSessionUsage } from "@lifecycle/agents";
import type { AgentMessageWithParts, AgentSessionRecord } from "@lifecycle/contracts";
import { AlertCircle, Loader2, MessageSquare, Pause } from "lucide-react";
import { ResponseReadyDot } from "@/components/response-ready-dot";

// ---------------------------------------------------------------------------
// Shared option type
// ---------------------------------------------------------------------------

export interface ToolbarOption {
  id: string;
  label: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Inline dropdown (shared by config dropdowns)
// ---------------------------------------------------------------------------

function InlineDropdown({
  options,
  value,
  onChange,
  Icon,
}: {
  options: readonly ToolbarOption[];
  value: string;
  onChange: (value: string) => void;
  Icon?: LucideIcon;
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
          {Icon ? <Icon className="size-3 text-[var(--muted-foreground)]" /> : null}
          <span className="text-[var(--foreground)]">{selected?.label}</span>
          <ChevronDown className="size-2.5 text-[var(--muted-foreground)]/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[180px] max-w-[280px] p-1"
        side="top"
        sideOffset={4}
        align="start"
      >
        {options.map((option) => (
          <button
            key={option.id}
            className={[
              "block w-full rounded-sm px-2.5 py-1.5 text-left transition-colors",
              option.id === value ? "bg-[var(--surface-hover)]" : "hover:bg-[var(--surface-hover)]",
            ].join(" ")}
            onClick={() => {
              onChange(option.id);
              setOpen(false);
            }}
            type="button"
          >
            <div
              className={[
                "text-[11px]",
                option.id === value ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]",
              ].join(" ")}
            >
              {option.label}
            </div>
            {option.description ? (
              <div className="text-[10px] text-[var(--muted-foreground)]/60 mt-0.5 leading-tight">
                {option.description}
              </div>
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// AgentConfig — provider icon + model / reasoning / permissions dropdowns
// ---------------------------------------------------------------------------

export interface AgentConfigProps {
  providerName: string;
  ProviderIcon: ComponentType<{ size?: number }>;
  responseReady: boolean;
  permissions: {
    options: readonly ToolbarOption[];
    selected: string;
    onChange: (value: string) => void;
  };
  model: {
    options: readonly ToolbarOption[];
    selected: string;
    onChange: (value: string) => void;
  };
  reasoning: {
    options: readonly ToolbarOption[];
    selected: string;
    onChange: (value: string) => void;
  };
  catalogLoading: boolean;
  catalogError: Error | null;
}

function AgentConfig({
  providerName,
  ProviderIcon,
  responseReady,
  permissions,
  model,
  reasoning,
  catalogLoading,
  catalogError,
}: AgentConfigProps) {
  return (
    <>
      <div
        aria-label={`${providerName} provider`}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"
        title={providerName}
      >
        {responseReady ? <ResponseReadyDot className="scale-[0.85]" /> : <ProviderIcon size={12} />}
      </div>
      <InlineDropdown options={model.options} value={model.selected} onChange={model.onChange} />
      <InlineDropdown
        options={reasoning.options}
        value={reasoning.selected}
        onChange={reasoning.onChange}
        Icon={Brain}
      />
      <InlineDropdown
        options={permissions.options}
        value={permissions.selected}
        onChange={permissions.onChange}
        Icon={Shield}
      />
      {catalogLoading ? (
        <span className="text-[11px] text-[var(--muted-foreground)]/60">loading…</span>
      ) : null}
      {catalogError ? (
        <span className="text-[11px] text-[var(--destructive)]" title={catalogError.message}>
          catalog error
        </span>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// AgentStatus — usage stats + status indicator + debug inspector
// ---------------------------------------------------------------------------

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`;
  return String(tokens);
}

function formatCost(usd: number): string {
  if (usd >= 1) return usd.toFixed(2);
  if (usd >= 0.01) return usd.toFixed(2);
  return usd.toFixed(3);
}

const STATUS_CONFIG: Record<
  AgentSessionDisplayStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  idle: {
    label: "Idle",
    icon: MessageSquare,
    className: "text-[var(--muted-foreground)]/50",
  },
  working: {
    label: "Working",
    icon: Loader2,
    className: "text-[var(--accent)]",
  },
  waiting: {
    label: "Waiting",
    icon: Pause,
    className: "text-[var(--warning,#f59e0b)]",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className: "text-[var(--destructive)]",
  },
};

function SessionStatusIndicator({ status }: { status: AgentSessionDisplayStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const isAnimated = status === "working";

  return (
    <span
      className={`flex items-center gap-1.5 text-[11px] font-medium ${config.className}`}
      title={config.label}
    >
      <Icon className={`size-3 ${isAnimated ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

export interface AgentStatusProps {
  displayStatus: AgentSessionDisplayStatus;
  usage: AgentSessionUsage;
  debug?: {
    session: AgentSessionRecord | undefined;
    sessionState: AgentSessionState;
    messages: AgentMessageWithParts[];
  };
}

function AgentStatus({ displayStatus, usage, debug }: AgentStatusProps) {
  const [debugOpen, setDebugOpen] = useState(false);
  const contextTokens = usage.inputTokens + usage.cacheReadTokens;
  const hasUsage = contextTokens > 0 || usage.costUsd > 0;

  return (
    <>
      {hasUsage ? (
        <span
          className="ml-auto text-[11px] text-[var(--muted-foreground)]/50"
          title={`Input: ${usage.inputTokens.toLocaleString()} | Output: ${usage.outputTokens.toLocaleString()} | Cache read: ${usage.cacheReadTokens.toLocaleString()}`}
        >
          {formatTokenCount(contextTokens)} ctx
          {usage.costUsd > 0 ? ` · $${formatCost(usage.costUsd)}` : ""}
        </span>
      ) : null}
      <span className={hasUsage ? "" : "ml-auto"}>
        <SessionStatusIndicator status={displayStatus} />
      </span>
      {debug ? (
        <>
          <button
            className="flex items-center gap-1 text-[11px] transition-colors text-[var(--muted-foreground)]/40 hover:text-[var(--foreground)]"
            onClick={() => setDebugOpen(true)}
            title="Debug inspector"
            type="button"
          >
            <Bug className="size-3" />
          </button>
          <DebugDialog
            open={debugOpen}
            onOpenChange={setDebugOpen}
            session={debug.session}
            sessionState={debug.sessionState}
            messages={debug.messages}
          />
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// AgentToolbar — composes AgentConfig + AgentStatus in one row
// ---------------------------------------------------------------------------

export interface AgentToolbarProps extends AgentConfigProps, AgentStatusProps {}

export function AgentToolbar(props: AgentToolbarProps) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-1.5">
      <AgentConfig
        providerName={props.providerName}
        ProviderIcon={props.ProviderIcon}
        responseReady={props.responseReady}
        permissions={props.permissions}
        model={props.model}
        reasoning={props.reasoning}
        catalogLoading={props.catalogLoading}
        catalogError={props.catalogError}
      />
      <AgentStatus
        displayStatus={props.displayStatus}
        usage={props.usage}
        debug={props.debug}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debug dialog (internal)
// ---------------------------------------------------------------------------

const kvRow = "border-b border-[var(--border)] last:border-b-0";
const kvKey =
  "px-2 py-1 text-[var(--muted-foreground)] font-mono whitespace-nowrap align-top w-[1%]";
const kvVal = "px-2 py-1 font-mono text-[var(--foreground)]";

function Val({ v }: { v: unknown }) {
  if (v === null) return <span className="text-[var(--muted-foreground)]/50">null</span>;
  if (v === undefined) return <span className="text-[var(--muted-foreground)]/50">—</span>;
  if (typeof v === "boolean")
    return <span className={v ? "text-green-400" : "text-red-400"}>{String(v)}</span>;
  if (typeof v === "number") return <span className="text-blue-400">{v}</span>;
  if (typeof v === "string" && v.length === 0)
    return <span className="text-[var(--muted-foreground)]/50">""</span>;
  if (typeof v === "string") return <span className="text-amber-300">{v}</span>;
  if (Array.isArray(v) && v.length === 0)
    return <span className="text-[var(--muted-foreground)]/50">[]</span>;
  return (
    <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">
      {JSON.stringify(v, null, 2)}
    </pre>
  );
}

function KvTable({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <table className="w-full text-[11px]">
        <tbody>
          {Object.entries(data).map(([k, v]) => (
            <tr key={k} className={kvRow}>
              <td className={kvKey}>{k}</td>
              <td className={kvVal}>
                <Val v={v} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)] mb-1.5">
      {children}
    </h3>
  );
}

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function parsePartData(data: string | null): unknown {
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function MessageRow({ msg, index }: { msg: AgentMessageWithParts; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const roleColor =
    msg.role === "user"
      ? "text-blue-400"
      : msg.role === "assistant"
        ? "text-green-400"
        : "text-[var(--muted-foreground)]";

  const partsSummary =
    msg.parts.length > 0 ? msg.parts.map((p) => p.part_type).join(", ") : "text-only";

  const preview = msg.text
    ? truncateText(msg.text, 120)
    : msg.parts.length > 0
      ? msg.parts
          .map((p) =>
            p.part_type === "text" ? truncateText(p.text ?? "", 60) : `[${p.part_type}]`,
          )
          .join(" ")
      : "(empty)";

  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        className="w-full text-left px-2 py-1.5 hover:bg-[var(--surface-hover)] transition-colors flex items-start gap-2"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]/40 font-mono w-4 text-right pt-px">
          {index}
        </span>
        <span className={`shrink-0 text-[11px] font-mono font-semibold w-16 ${roleColor}`}>
          {msg.role}
        </span>
        <span className="min-w-0 flex-1 text-[11px] font-mono text-[var(--foreground)]/70 truncate">
          {preview}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]/40 font-mono">
          {partsSummary}
        </span>
      </button>
      {expanded ? (
        <div className="px-2 pb-2 pl-8 flex flex-col gap-2">
          <KvTable
            data={{
              id: msg.id,
              session_id: msg.session_id,
              role: msg.role,
              turn_id: msg.turn_id,
              created_at: msg.created_at,
              text_length: msg.text.length,
              parts_count: msg.parts.length,
            }}
          />
          {msg.text.length > 0 ? (
            <div>
              <div className="text-[10px] text-[var(--muted-foreground)] mb-1">text</div>
              <pre className="text-[11px] font-mono leading-tight whitespace-pre-wrap break-all bg-[var(--surface)] border border-[var(--border)] rounded p-2 max-h-[200px] overflow-y-auto">
                {msg.text}
              </pre>
            </div>
          ) : null}
          {msg.parts.map((part, pi) => (
            <div key={part.id}>
              <div className="text-[10px] text-[var(--muted-foreground)] mb-1">
                part[{pi}] — {part.part_type}
              </div>
              <KvTable
                data={{
                  id: part.id,
                  part_index: part.part_index,
                  part_type: part.part_type,
                  text: part.text ? truncateText(part.text, 500) : null,
                  data: parsePartData(part.data),
                  created_at: part.created_at,
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildDebugDump(
  session: AgentSessionRecord | undefined,
  sessionState: AgentSessionState,
  messages: AgentMessageWithParts[],
): unknown {
  return {
    session: session ?? null,
    sessionState,
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      turn_id: msg.turn_id,
      text: msg.text,
      created_at: msg.created_at,
      parts: msg.parts.map((p) => ({
        id: p.id,
        part_index: p.part_index,
        part_type: p.part_type,
        text: p.text,
        data: parsePartData(p.data),
        created_at: p.created_at,
      })),
    })),
  };
}

function DebugDialog({
  open,
  onOpenChange,
  session,
  sessionState,
  messages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AgentSessionRecord | undefined;
  sessionState: AgentSessionState;
  messages: AgentMessageWithParts[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="!items-start !pt-4 !pb-4">
        <div className="w-[760px] max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-raised,var(--surface))] shadow-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-raised,var(--surface))] px-4 py-2.5">
            <DialogTitle className="text-xs font-semibold uppercase tracking-[0.1em]">
              Session Debug
            </DialogTitle>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                type="button"
                onClick={() => {
                  const dump = buildDebugDump(session, sessionState, messages);
                  void navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
                }}
              >
                Copy JSON
              </button>
              <DialogClose className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]">
                <X className="size-3.5" />
              </DialogClose>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {session ? (
              <div>
                <SectionHeader>Session Record</SectionHeader>
                <KvTable
                  data={{
                    id: session.id,
                    provider: session.provider,
                    provider_session_id: session.provider_session_id,
                    status: session.status,
                    title: session.title,
                    workspace_id: session.workspace_id,
                    created_at: session.created_at,
                    updated_at: session.updated_at,
                    last_message_at: session.last_message_at,
                  }}
                />
              </div>
            ) : (
              <div>
                <SectionHeader>Session Record</SectionHeader>
                <div className="text-[11px] text-[var(--destructive)]">Session not found</div>
              </div>
            )}

            <div>
              <SectionHeader>Live State</SectionHeader>
              <KvTable
                data={{
                  authStatus: sessionState.authStatus,
                  lastError: sessionState.lastError,
                  providerStatus: sessionState.providerStatus,
                  responseReady: sessionState.responseReady,
                  pendingTurnIds: sessionState.pendingTurnIds,
                  pendingApprovals: sessionState.pendingApprovals,
                  turnActivity: sessionState.turnActivity,
                  "usage.inputTokens": sessionState.usage.inputTokens,
                  "usage.outputTokens": sessionState.usage.outputTokens,
                  "usage.cacheReadTokens": sessionState.usage.cacheReadTokens,
                  "usage.costUsd": sessionState.usage.costUsd,
                }}
              />
            </div>

            <div>
              <SectionHeader>Messages ({messages.length})</SectionHeader>
              {messages.length === 0 ? (
                <div className="text-[11px] text-[var(--muted-foreground)]/50">No messages</div>
              ) : (
                <div className="rounded border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                  {messages.map((msg, i) => (
                    <MessageRow key={msg.id} msg={msg} index={i} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
