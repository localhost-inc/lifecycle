import { Button } from "@lifecycle/ui";

import type { ReactNode } from "react";
import type { CreateTerminalRequest, HarnessProvider, TerminalRow } from "../../terminals/api";
import { TerminalSessionHistory } from "../../terminals/components/terminal-session-history";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";

interface WorkspaceLauncherSurfaceProps {
  activeTerminalId: string | null;
  creatingSelection: "shell" | HarnessProvider | null;
  onCreateTerminal: (input: CreateTerminalRequest) => void;
  onOpenTerminal: (terminalId: string) => void;
  onResumeTerminal: (input: Extract<CreateTerminalRequest, { launchType: "harness" }>) => void;
  terminals: TerminalRow[];
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
      className="flex min-h-28 flex-col items-start gap-3 rounded-3xl border border-[var(--border)] bg-[var(--panel)] px-4 py-4 text-left transition hover:border-[var(--foreground)]/30 hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-[#b8b0a8]">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>
      </div>
    </button>
  );
}

export function WorkspaceLauncherSurface({
  activeTerminalId,
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
            description="Open a plain shell in this workspace."
            disabled={creatingSelection !== null}
            icon={
              creatingSelection === "shell" ? (
                <span className="block h-7 w-7 animate-pulse rounded-full bg-current opacity-50" />
              ) : (
                <ShellIcon size={28} />
              )
            }
            label="Shell"
            onClick={() => onCreateTerminal({ launchType: "shell" })}
          />
          <LauncherActionCard
            description="Start a Claude Code session in a fresh tab."
            disabled={creatingSelection !== null}
            icon={
              creatingSelection === "claude" ? (
                <span className="block h-7 w-7 animate-pulse rounded-full bg-current opacity-50" />
              ) : (
                <ClaudeIcon size={28} />
              )
            }
            label="Claude"
            onClick={() => onCreateTerminal({ harnessProvider: "claude", launchType: "harness" })}
          />
          <LauncherActionCard
            description="Start a Codex session in a fresh tab."
            disabled={creatingSelection !== null}
            icon={
              creatingSelection === "codex" ? (
                <span className="block h-7 w-7 animate-pulse rounded-full bg-current opacity-50" />
              ) : (
                <CodexIcon size={28} />
              )
            }
            label="Codex"
            onClick={() => onCreateTerminal({ harnessProvider: "codex", launchType: "harness" })}
          />
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--muted-foreground)]/40">
            Recent sessions
          </p>
          <div className="max-h-60 overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--panel)]">
            {terminals.length > 0 ? (
              <TerminalSessionHistory
                activeTerminalId={activeTerminalId}
                creatingSelection={creatingSelection}
                onOpenTerminal={onOpenTerminal}
                onResumeTerminal={onResumeTerminal}
                terminals={terminals}
              />
            ) : (
              <div className="px-4 py-3">
                <p className="text-xs text-[var(--muted-foreground)]/60">
                  Sessions will appear here as you work.
                </p>
              </div>
            )}
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
          <span>Cmd/Ctrl + T opens another launcher tab.</span>
        </div>
      </div>
    </div>
  );
}
