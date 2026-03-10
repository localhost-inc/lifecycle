import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@lifecycle/ui";
import type { ReactNode } from "react";
import type { HarnessProvider } from "../../terminals/api";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";

export type SurfaceLaunchRequest =
  | { type: "terminal"; launchType: "shell" }
  | { type: "terminal"; launchType: "harness"; harnessProvider: HarnessProvider };

export interface SurfaceLaunchAction {
  key: string;
  title: string;
  icon: ReactNode;
  request: SurfaceLaunchRequest;
  loading?: boolean;
  disabled?: boolean;
}

interface SurfaceLaunchActionsProps {
  actions: SurfaceLaunchAction[];
  onLaunch: (request: SurfaceLaunchRequest) => void;
  onOpenLauncher?: () => void;
}

export function resolveSurfaceLaunchTooltipAlign(
  index: number,
  actionCount: number,
): "center" | "end" {
  void index;
  void actionCount;
  return "end";
}

function LoadingDot() {
  return (
    <span className="lifecycle-motion-soft-pulse block h-[14px] w-[14px] rounded-full bg-current opacity-50" />
  );
}

export function SurfaceLaunchActions({
  actions,
  onLaunch,
  onOpenLauncher,
}: SurfaceLaunchActionsProps) {
  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-1.5 px-0 py-0">
        {onOpenLauncher && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="compact-control-standalone compact-control-item compact-control-icon compact-control-tone-muted"
                onClick={onOpenLauncher}
              >
                <svg
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                  viewBox="0 0 16 16"
                  width="16"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent>New Tab</TooltipContent>
          </Tooltip>
        )}
        {actions.map((action, index) => (
          <Tooltip key={action.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="compact-control-standalone compact-control-item compact-control-icon compact-control-tone-muted"
                disabled={action.disabled}
                onClick={() => onLaunch(action.request)}
                title={action.title}
              >
                {action.loading ? <LoadingDot /> : action.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent align={resolveSurfaceLaunchTooltipAlign(index, actions.length)}>
              {action.title}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

export { ClaudeIcon, CodexIcon, ShellIcon };
