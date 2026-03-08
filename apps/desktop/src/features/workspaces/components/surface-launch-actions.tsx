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

function LoadingDot() {
  return (
    <span className="block h-[14px] w-[14px] animate-pulse rounded-full bg-current opacity-50" />
  );
}

export function SurfaceLaunchActions({ actions, onLaunch, onOpenLauncher }: SurfaceLaunchActionsProps) {
  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-1 px-0 py-0">
        {onOpenLauncher && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                onClick={onOpenLauncher}
              >
                <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" viewBox="0 0 16 16" width="16">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent>New Tab</TooltipContent>
          </Tooltip>
        )}
        {actions.map((action) => (
          <Tooltip key={action.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-hover)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--border)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:pointer-events-none"
                disabled={action.disabled}
                onClick={() => onLaunch(action.request)}
                title={action.title}
              >
                {action.loading ? <LoadingDot /> : action.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent>{action.title}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

export { ClaudeIcon, CodexIcon, ShellIcon };
