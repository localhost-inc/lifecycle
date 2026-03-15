import type { HostedSurfaceLaunchActionItem } from "../../overlays/overlay-contract";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";

function LoadingDot() {
  return (
    <span className="lifecycle-motion-soft-pulse block h-[14px] w-[14px] rounded-full bg-current opacity-50" />
  );
}

function SurfaceLaunchIcon({ actionKey }: { actionKey: string }) {
  if (actionKey === "claude") {
    return <ClaudeIcon />;
  }

  if (actionKey === "codex") {
    return <CodexIcon />;
  }

  return <ShellIcon />;
}

interface SurfaceLaunchMenuContentProps {
  actions: HostedSurfaceLaunchActionItem[];
  onLaunch: (key: string) => void;
}

export function SurfaceLaunchMenuContent({ actions, onLaunch }: SurfaceLaunchMenuContentProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {actions.map((action) => (
        <button
          key={action.key}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50"
          disabled={action.disabled}
          onClick={() => onLaunch(action.key)}
          type="button"
        >
          {action.loading ? <LoadingDot /> : <SurfaceLaunchIcon actionKey={action.key} />}
          {action.title}
        </button>
      ))}
    </div>
  );
}
