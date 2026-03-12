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
    <ul>
      {terminals.map((terminal, index) => {
        const hasLiveSession = terminalHasLiveSession(terminal.status);
        const isCurrent = terminal.id === activeTerminalId;
        const isLast = index === terminals.length - 1;
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
              className={`flex w-full items-start gap-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-50 ${
                !isLast ? "border-b border-[var(--border)]/40" : ""
              } ${
                isCurrent
                  ? "bg-[var(--surface-hover)]"
                  : "hover:bg-[var(--surface-hover)]"
              }`}
            >
              <TerminalStatusDot className="mt-1.5 shrink-0" size="default" status={terminal.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 text-sm font-medium text-[var(--foreground)]">
                    {sessionLabel(terminal)}
                  </p>
                  {isCurrent ? (
                    <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--foreground)]/70">
                      Current
                    </span>
                  ) : canResume ? (
                    <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--foreground)]/70">
                      Resume
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                    {activityTime(terminal)}
                  </span>
                </div>
                {sessionMeta(terminal) ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]/45">
                    {sessionMeta(terminal)}
                  </p>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
