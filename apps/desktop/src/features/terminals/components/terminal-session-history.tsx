import type { TerminalRecord } from "@lifecycle/contracts";
import { formatCompactRelativeTime } from "../../../lib/format";
import { terminalHasLiveSession, type CreateTerminalRequest, type HarnessProvider } from "../api";
import { ClaudeIcon, CodexIcon, ShellIcon } from "../../workspaces/components/surface-icons";

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

function providerIcon(terminal: TerminalRecord) {
  if (terminal.harness_provider === "claude") return <ClaudeIcon size={13} />;
  if (terminal.harness_provider === "codex") return <CodexIcon size={13} />;
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
  onOpenTerminal,
  onResumeTerminal,
  terminals,
}: TerminalSessionHistoryProps) {
  return (
    <ul className="space-y-0.5">
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
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-40 ${
                isCurrent
                  ? "bg-[var(--surface-hover)]"
                  : "hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--muted-foreground)]">
                {providerIcon(terminal)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--foreground)]">
                {terminal.label}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]/60">
                {activityTime(terminal)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
