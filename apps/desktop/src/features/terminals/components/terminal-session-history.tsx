import type { TerminalRecord } from "@lifecycle/contracts";
import { formatCompactRelativeTime } from "../../../lib/format";
import { terminalHasLiveSession, type CreateTerminalRequest, type HarnessProvider } from "../api";
import { TerminalStatusDot } from "./terminal-status-dot";

interface TerminalSessionHistoryProps {
  activeTerminalId: string | null;
  creatingSelection: "shell" | HarnessProvider | null;
  onOpenTerminal: (terminalId: string) => void;
  onResumeTerminal: (input: Extract<CreateTerminalRequest, { launchType: "harness" }>) => void;
  terminals: TerminalRecord[];
}

function isHarnessProvider(value: string | null): value is HarnessProvider {
  return value === "claude" || value === "codex";
}

function sessionLabel(terminal: TerminalRecord): string {
  return terminal.label;
}

function sessionMeta(terminal: TerminalRecord): string {
  if (terminal.harness_session_id) {
    return `session ${terminal.harness_session_id.slice(0, 6)}`;
  }

  if (terminal.launch_type === "shell") {
    return "zsh";
  }

  return "";
}

function activityTime(terminal: TerminalRecord): string {
  if (terminal.ended_at) {
    return formatCompactRelativeTime(terminal.ended_at);
  }

  return formatCompactRelativeTime(terminal.last_active_at);
}

export function TerminalSessionHistory({
  activeTerminalId,
  creatingSelection,
  onOpenTerminal,
  onResumeTerminal,
  terminals,
}: TerminalSessionHistoryProps) {
  return (
    <ul className="space-y-1.5">
      {terminals.map((terminal) => {
        const hasLiveSession = terminalHasLiveSession(terminal.status);
        const isCurrent = terminal.id === activeTerminalId;
        const canResume =
          !hasLiveSession &&
          terminal.launch_type === "harness" &&
          isHarnessProvider(terminal.harness_provider) &&
          typeof terminal.harness_session_id === "string" &&
          terminal.harness_session_id.length > 0;
        function handleClick() {
          if (hasLiveSession) {
            onOpenTerminal(terminal.id);
          } else if (canResume) {
            onResumeTerminal({
              harnessProvider: terminal.harness_provider as HarnessProvider,
              harnessSessionId: terminal.harness_session_id as string,
              launchType: "harness",
            });
          }
        }

        const isClickable = (hasLiveSession || canResume) && creatingSelection === null;

        return (
          <li key={terminal.id}>
            <button
              type="button"
              disabled={!isClickable}
              onClick={handleClick}
              className={`flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-50 ${
                isCurrent
                  ? "border-[var(--border)]/50 bg-[var(--surface-hover)]"
                  : "hover:border-[var(--border)]/50 hover:bg-[var(--surface-hover)]"
              }`}
            >
              <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs font-medium text-[var(--foreground)]">
                {hasLiveSession && (
                  <TerminalStatusDot className="shrink-0" size="sm" status={terminal.status} />
                )}
                {sessionLabel(terminal)}
              </p>

              <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]/40">
                {sessionMeta(terminal)}
              </span>

              {isCurrent ? (
                <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--foreground)]/70">
                  Current
                </span>
              ) : canResume ? (
                <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--foreground)]/70">
                  Resume
                </span>
              ) : null}

              <span className="w-14 shrink-0 text-right text-[11px] text-[var(--muted-foreground)]">
                {activityTime(terminal)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
