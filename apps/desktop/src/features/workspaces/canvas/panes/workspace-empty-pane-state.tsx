import { Button, EmptyState } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import type { SurfaceLaunchRequest } from "@/features/workspaces/surfaces/surface-launch-actions";
import { ClaudeIcon, CodexIcon, ShellIcon } from "@/features/workspaces/surfaces/surface-icons";

interface WorkspaceEmptyPaneStateProps {
  creatingSelection: "shell" | "claude" | "codex" | null;
  onLaunchSurface: (request: SurfaceLaunchRequest) => void;
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
  onLaunchSurface,
}: WorkspaceEmptyPaneStateProps) {
  const busy = creatingSelection !== null;

  return (
    <EmptyState
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <LaunchButton
            active={creatingSelection === "shell"}
            disabled={busy}
            onClick={() => onLaunchSurface({ kind: "terminal", launchType: "shell" })}
          >
            {creatingSelection === "shell" ? null : <ShellIcon />}
            <span>Shell</span>
          </LaunchButton>
          <LaunchButton
            active={creatingSelection === "claude"}
            disabled={busy}
            onClick={() => onLaunchSurface({ kind: "agent", provider: "claude" })}
          >
            {creatingSelection === "claude" ? null : <ClaudeIcon />}
            <span>Claude</span>
          </LaunchButton>
          <LaunchButton
            active={creatingSelection === "codex"}
            disabled={busy}
            onClick={() => onLaunchSurface({ kind: "agent", provider: "codex" })}
          >
            {creatingSelection === "codex" ? null : <CodexIcon />}
            <span>Codex</span>
          </LaunchButton>
        </div>
      }
      description="Launch a shell or agent to get started."
      icon={<TerminalSquare />}
      title="No open tabs"
    />
  );
}
