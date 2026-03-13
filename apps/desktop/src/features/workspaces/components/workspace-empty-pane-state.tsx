import { Button, EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import type { CreateTerminalRequest, HarnessProvider } from "../../terminals/api";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";

interface WorkspaceEmptyPaneStateProps {
  creatingSelection: "shell" | HarnessProvider | null;
  onCreateTerminal: (input: CreateTerminalRequest) => void;
}

function LaunchButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button disabled={disabled} onClick={onClick} size="sm" variant="secondary">
      {active ? (
        <span className="lifecycle-motion-soft-pulse block h-3.5 w-3.5 rounded-full bg-current opacity-50" />
      ) : null}
      {children}
    </Button>
  );
}

export function WorkspaceEmptyPaneState({
  creatingSelection,
  onCreateTerminal,
}: WorkspaceEmptyPaneStateProps) {
  const busy = creatingSelection !== null;

  return (
    <EmptyState
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <LaunchButton
            active={creatingSelection === "shell"}
            disabled={busy}
            onClick={() => onCreateTerminal({ launchType: "shell" })}
          >
            {creatingSelection === "shell" ? null : <ShellIcon />}
            <span>Shell</span>
          </LaunchButton>
          <LaunchButton
            active={creatingSelection === "claude"}
            disabled={busy}
            onClick={() => onCreateTerminal({ harnessProvider: "claude", launchType: "harness" })}
          >
            {creatingSelection === "claude" ? null : <ClaudeIcon />}
            <span>Claude</span>
          </LaunchButton>
          <LaunchButton
            active={creatingSelection === "codex"}
            disabled={busy}
            onClick={() => onCreateTerminal({ harnessProvider: "codex", launchType: "harness" })}
          >
            {creatingSelection === "codex" ? null : <CodexIcon />}
            <span>Codex</span>
          </LaunchButton>
        </div>
      }
      description="Launch a shell or harness session in this pane."
      icon={<TerminalSquare />}
      title="No tabs in this pane"
    />
  );
}
