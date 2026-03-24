import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lifecycle/ui";
import { Brain, ChevronDown, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClaudeIcon } from "@/features/workspaces/surfaces/surface-icons";
import type { AgentSessionUsage } from "@lifecycle/agents";
import { ResponseReadyDot } from "@/components/response-ready-dot";

// ---------------------------------------------------------------------------
// Formatting helpers
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

// ---------------------------------------------------------------------------
// Shared option type used by all status bar dropdowns
// ---------------------------------------------------------------------------

export interface StatusBarOption {
  id: string;
  label: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Inline dropdown
// ---------------------------------------------------------------------------

function InlineDropdown({
  options,
  value,
  onChange,
  Icon,
}: {
  options: readonly StatusBarOption[];
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
      <PopoverContent className="w-auto min-w-[180px] max-w-[280px] p-1" side="top" sideOffset={4} align="start">
        {options.map((option) => (
          <button
            key={option.id}
            className={[
              "block w-full rounded-sm px-2.5 py-1.5 text-left transition-colors",
              option.id === value
                ? "bg-[var(--surface-hover)]"
                : "hover:bg-[var(--surface-hover)]",
            ].join(" ")}
            onClick={() => {
              onChange(option.id);
              setOpen(false);
            }}
            type="button"
          >
            <div className={[
              "text-[11px]",
              option.id === value ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]",
            ].join(" ")}>
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
// AgentStatusBar
// ---------------------------------------------------------------------------

export interface AgentStatusBarProps {
  providerName: string;
  ProviderIcon: typeof ClaudeIcon;
  responseReady: boolean;
  providerStatus: string | null;
  permissions: {
    options: readonly StatusBarOption[];
    selected: string;
    onChange: (value: string) => void;
  };
  model: {
    options: readonly StatusBarOption[];
    selected: string;
    onChange: (value: string) => void;
  };
  reasoning: {
    options: readonly StatusBarOption[];
    selected: string;
    onChange: (value: string) => void;
  };
  catalogLoading: boolean;
  catalogError: Error | null;
  usage: AgentSessionUsage;
}

export function AgentStatusBar({
  providerName,
  ProviderIcon,
  responseReady,
  providerStatus,
  permissions,
  model,
  reasoning,
  catalogLoading,
  catalogError,
  usage,
}: AgentStatusBarProps) {
  const contextTokens = usage.inputTokens + usage.cacheReadTokens;
  const hasUsage = contextTokens > 0 || usage.costUsd > 0;
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-1.5">
      <div
        aria-label={`${providerName} provider`}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]"
        title={providerName}
      >
        {responseReady ? (
          <ResponseReadyDot className="scale-[0.85]" />
        ) : (
          <ProviderIcon size={12} />
        )}
      </div>
      <InlineDropdown
        options={model.options}
        value={model.selected}
        onChange={model.onChange}
      />
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
        <span
          className="text-[11px] text-[var(--destructive)]"
          title={catalogError.message}
        >
          catalog error
        </span>
      ) : null}
      {providerStatus ? (
        <span className="text-[11px] text-[var(--warning,var(--accent))]">
          {providerStatus}
        </span>
      ) : null}
      {hasUsage ? (
        <span
          className="ml-auto text-[11px] text-[var(--muted-foreground)]/50"
          title={`Input: ${usage.inputTokens.toLocaleString()} | Output: ${usage.outputTokens.toLocaleString()} | Cache read: ${usage.cacheReadTokens.toLocaleString()}`}
        >
          {formatTokenCount(contextTokens)} ctx
          {usage.costUsd > 0 ? ` · $${formatCost(usage.costUsd)}` : ""}
        </span>
      ) : null}
    </div>
  );
}
