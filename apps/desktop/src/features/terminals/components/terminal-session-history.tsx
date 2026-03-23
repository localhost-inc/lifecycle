import type { TerminalRecord } from "@lifecycle/contracts";
import { formatCompactRelativeTime } from "@/lib/format";
import { terminalHasLiveSession } from "@/features/terminals/api";
import { ShellIcon } from "@/features/workspaces/components/surface-icons";
import {
  getWorkspaceSessionStatusState,
  WorkspaceSessionStatus,
} from "@/features/workspaces/components/workspace-session-status";

interface TerminalSessionHistoryProps {
  activeTerminalId: string | null;
  creatingSelection: "shell" | "claude" | "codex" | null;
  isTerminalResponseReady: (terminalId: string) => boolean;
  isTerminalTurnRunning: (terminalId: string) => boolean;
  onOpenTerminal: (terminalId: string) => void;
  terminals: TerminalRecord[];
}

function providerIcon(terminal: TerminalRecord) {
  void terminal;
  return <ShellIcon size={13} />;
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
  isTerminalResponseReady,
  isTerminalTurnRunning,
  onOpenTerminal,
  terminals,
}: TerminalSessionHistoryProps) {
  return (
    <ul className="space-y-0.5">
      {terminals.map((terminal) => {
        const hasLiveSession = terminalHasLiveSession(terminal.status);
        const isCurrent = terminal.id === activeTerminalId;
        const sessionStatusState = getWorkspaceSessionStatusState({
          responseReady: isTerminalResponseReady(terminal.id),
          running: isTerminalTurnRunning(terminal.id),
        });
        function handleClick() {
          if (hasLiveSession) {
            onOpenTerminal(terminal.id);
          }
        }

        const isClickable = hasLiveSession && creatingSelection === null;

        return (
          <li key={terminal.id}>
            <button
              type="button"
              disabled={!isClickable}
              onClick={handleClick}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-40 ${
                isCurrent ? "bg-[var(--surface-hover)]" : "hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--muted-foreground)]">
                {providerIcon(terminal)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--foreground)]">
                {terminal.label}
              </span>
              {sessionStatusState !== "hidden" ? (
                <WorkspaceSessionStatus
                  className="min-w-4 justify-center"
                  state={sessionStatusState}
                />
              ) : (
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]/60">
                  {activityTime(terminal)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
