import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@lifecycle/ui";
import type { ReactNode } from "react";
import type { HarnessProvider } from "../../terminals/api";
import { ClaudeIcon, CodexIcon, ShellIcon } from "./surface-icons";

export type SurfaceLaunchRequest =
  | { kind: "terminal"; launchType: "shell" }
  | { kind: "terminal"; launchType: "harness"; harnessProvider: HarnessProvider };

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

export function SurfaceLaunchActions({ actions, onLaunch }: SurfaceLaunchActionsProps) {
  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center pr-3">
        <div className="inline-flex items-center gap-px">
          {actions.map((action, index) => {
            const isFirst = index === 0;
            const isLast = index === actions.length - 1;
            const rounding =
              isFirst && isLast
                ? "rounded-xl"
                : isFirst
                  ? "rounded-l-xl"
                  : isLast
                    ? "rounded-r-xl"
                    : "";

            return (
              <Tooltip key={action.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex h-8 w-8 items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)] outline-none transition-[background-color,border-color,color,opacity] duration-150 ease-in-out hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_8%)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50 ${rounding}`}
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
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

export { ClaudeIcon, CodexIcon, ShellIcon };
