import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useTheme,
} from "@lifecycle/ui";
import { Plus } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { HostedOverlayAction } from "../../overlays/overlay-contract";
import { useHostedOverlay } from "../../overlays/use-hosted-overlay";
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
  const { resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const anyLoading = actions.some((action) => action.loading);

  const hostedOverlayPayload = useMemo(
    () => ({
      actions: actions.map((action) => ({
        disabled: action.disabled,
        key: action.key,
        loading: action.loading,
        title: action.title,
      })),
      kind: "surface-launch" as const,
      placement: {
        align: "end" as const,
        estimatedHeight: actions.length * 32 + 10,
        gutter: 8,
        preferredWidth: 148,
        side: "bottom" as const,
        sideOffset: 8,
      },
      resolvedTheme,
      requiresWindowFocus: false,
    }),
    [actions, resolvedTheme],
  );

  const hostedOverlay = useHostedOverlay({
    anchorRef,
    onAction: (action: HostedOverlayAction) => {
      if (action.kind !== "surface-launch" || action.action !== "launch") {
        return;
      }

      const matchedAction = actions.find((a) => a.key === action.key);
      if (matchedAction) {
        setOpen(false);
        onLaunch(matchedAction.request);
      }
    },
    onRequestClose: () => {
      setOpen(false);
    },
    open,
    payload: hostedOverlayPayload,
  });

  if (hostedOverlay.hosted) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              ref={anchorRef}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"
              disabled={anyLoading}
              onClick={() => setOpen((current) => !current)}
              title="New tab"
            >
              {anyLoading ? <LoadingDot /> : <Plus size={16} />}
            </button>
          </TooltipTrigger>
          <TooltipContent align="end">New tab</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Popover onOpenChange={setOpen} open={open}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                ref={anchorRef}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"
                disabled={anyLoading}
                title="New tab"
              >
                {anyLoading ? <LoadingDot /> : <Plus size={16} />}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent align="end">New tab</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="w-44 rounded-lg border-[var(--border)] bg-[var(--surface)] p-1"
          side="bottom"
          sideOffset={8}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                onLaunch(action.request);
              }}
              type="button"
            >
              {action.loading ? <LoadingDot /> : action.icon}
              {action.title}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

export { ClaudeIcon, CodexIcon, ShellIcon };
