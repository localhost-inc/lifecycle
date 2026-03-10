import { Button } from "@lifecycle/ui";
import type { TerminalRecord } from "@lifecycle/contracts";

import type { ReactNode } from "react";
import type { CreateTerminalRequest, HarnessProvider } from "../../terminals/api";
import { TerminalSessionHistory } from "../../terminals/components/terminal-session-history";
import type { WorkspaceActivityItem } from "../hooks";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";
import { WorkspaceActivityFeed } from "./workspace-activity-feed";

interface WorkspaceLauncherSurfaceProps {
  activeTerminalId: string | null;
  activity: WorkspaceActivityItem[];
  creatingSelection: "shell" | HarnessProvider | null;
  onCreateTerminal: (input: CreateTerminalRequest) => void;
  onOpenTerminal: (terminalId: string) => void;
  onResumeTerminal: (input: Extract<CreateTerminalRequest, { launchType: "harness" }>) => void;
  terminals: TerminalRecord[];
}

interface LauncherActionCardProps {
  description: string;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function LauncherActionCard({
  description,
  disabled,
  icon,
  label,
  onClick,
}: LauncherActionCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-3xl border border-[var(--border)] bg-[var(--panel)] px-4 py-4 text-left transition hover:border-[var(--foreground)]/30 hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-[var(--muted-foreground)]">{icon}</span>
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>
      </div>
    </button>
  );
}

export function WorkspaceLauncherSurface({
  activeTerminalId,
  activity,
  creatingSelection,
  onCreateTerminal,
  onOpenTerminal,
  onResumeTerminal,
  terminals,
}: WorkspaceLauncherSurfaceProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--background)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <LauncherActionCard
            description="Plain shell tab."
            disabled={creatingSelection !== null}
            icon={
              creatingSelection === "shell" ? (
                <span className="lifecycle-motion-soft-pulse block h-7 w-7 rounded-full bg-current opacity-50" />
              ) : (
                <ShellIcon size={28} />
              )
            }
            label="Shell"
            onClick={() => onCreateTerminal({ launchType: "shell" })}
          />
          <LauncherActionCard
            description="Fresh Claude tab."
            disabled={creatingSelection !== null}
            icon={
              creatingSelection === "claude" ? (
                <span className="lifecycle-motion-soft-pulse block h-7 w-7 rounded-full bg-current opacity-50" />
              ) : (
                <ClaudeIcon size={28} />
              )
            }
            label="Claude"
            onClick={() => onCreateTerminal({ harnessProvider: "claude", launchType: "harness" })}
          />
          <LauncherActionCard
            description="Fresh Codex tab."
            disabled={creatingSelection !== null}
            icon={
              creatingSelection === "codex" ? (
                <span className="lifecycle-motion-soft-pulse block h-7 w-7 rounded-full bg-current opacity-50" />
              ) : (
                <CodexIcon size={28} />
              )
            }
            label="Codex"
            onClick={() => onCreateTerminal({ harnessProvider: "codex", launchType: "harness" })}
          />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
              Recent sessions
            </p>
            <div className="mt-3">
              {terminals.length > 0 ? (
                <TerminalSessionHistory
                  activeTerminalId={activeTerminalId}
                  creatingSelection={creatingSelection}
                  onOpenTerminal={onOpenTerminal}
                  onResumeTerminal={onResumeTerminal}
                  terminals={terminals}
                />
              ) : (
                <p className="py-3 text-xs text-[var(--muted-foreground)]/60">
                  No sessions yet.
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
              Workspace activity
            </p>
            <div className="mt-3">
              <WorkspaceActivityFeed items={activity} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <Button
            className="h-7 px-2 text-xs"
            onClick={() => onCreateTerminal({ launchType: "shell" })}
            size="sm"
            variant="ghost"
          >
            Quick Shell
          </Button>
          <span>Cmd/Ctrl + T opens a new launcher tab.</span>
        </div>
      </div>
    </div>
  );
}
