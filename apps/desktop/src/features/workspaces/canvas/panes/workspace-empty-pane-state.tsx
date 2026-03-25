import { Button, EmptyState } from "@lifecycle/ui";
import { PanelsTopLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { SurfaceLaunchRequest } from "@/features/workspaces/canvas/workspace-canvas-requests";
import type { SurfaceLaunchAction } from "@/features/workspaces/surfaces/surface-launch-actions";

interface WorkspaceEmptyPaneStateProps {
  actions: SurfaceLaunchAction[];
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
  actions,
  onLaunchSurface,
}: WorkspaceEmptyPaneStateProps) {
  const busy = actions.some((action) => action.loading);

  return (
    <EmptyState
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions.map((action) => (
            <LaunchButton
              key={action.key}
              active={Boolean(action.loading)}
              disabled={busy || Boolean(action.disabled)}
              onClick={() => onLaunchSurface(action.request)}
            >
              {action.loading ? null : action.icon}
              <span>{action.title}</span>
            </LaunchButton>
          ))}
        </div>
      }
      description="Launch an agent to get started."
      icon={<PanelsTopLeft />}
      title="No open tabs"
    />
  );
}
