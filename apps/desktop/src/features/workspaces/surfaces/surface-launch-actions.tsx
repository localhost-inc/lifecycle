import type { AgentSessionProviderId } from "@lifecycle/contracts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@lifecycle/ui";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ClaudeIcon, CodexIcon, ShellIcon } from "@/features/workspaces/surfaces/surface-icons";

export type SurfaceLaunchRequest =
  | { kind: "terminal"; launchType: "shell" }
  | { kind: "agent"; provider: AgentSessionProviderId };

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
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  onLaunch: (request: SurfaceLaunchRequest) => void;
}

function LoadingDot() {
  return (
    <span className="lifecycle-motion-soft-pulse block h-[14px] w-[14px] rounded-full bg-current opacity-50" />
  );
}

export function SurfaceLaunchActions({
  actions,
  defaultOpen = false,
  onOpenChange,
  open: controlledOpen,
  onLaunch,
}: SurfaceLaunchActionsProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const anyLoading = actions.some((action) => action.loading);
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  return (
    <TooltipProvider>
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div
            key="surface-launch-actions"
            animate={{
              opacity: 1,
              width: "auto",
              transition: {
                delayChildren: 0.04,
                duration: 0.18,
                ease: "easeInOut",
                staggerChildren: 0.045,
              },
            }}
            className="flex items-center gap-px overflow-hidden"
            exit={{ opacity: 0, width: 0, transition: { duration: 0.14, ease: "easeInOut" } }}
            initial={{ opacity: 0, width: 0 }}
          >
            {actions.map((action) => (
              <motion.div
                key={action.key}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 6, scale: 0.94 }}
                initial={{ opacity: 0, x: 6, scale: 0.94 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={action.title}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"
                      disabled={action.disabled}
                      onClick={() => {
                        setOpen(false);
                        onLaunch(action.request);
                      }}
                      title={action.title}
                    >
                      {action.loading ? <LoadingDot /> : action.icon}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent align="end">{action.title}</TooltipContent>
                </Tooltip>
              </motion.div>
            ))}
            <motion.div
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 6, scale: 0.94 }}
              initial={{ opacity: 0, x: 6, scale: 0.94 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Close new tab actions"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)]"
                    onClick={() => setOpen(false)}
                    title="Close"
                  >
                    <X size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent align="end">Close</TooltipContent>
              </Tooltip>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="surface-launch-trigger"
            animate={{ opacity: 1, width: "auto", x: 0 }}
            exit={{ opacity: 0, width: 0, x: -8, transition: { duration: 0.12 } }}
            initial={{ opacity: 0, width: 0, x: -8 }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"
                  disabled={anyLoading}
                  onClick={() => setOpen(true)}
                  title="New tab"
                >
                  {anyLoading ? <LoadingDot /> : <Plus size={16} />}
                </button>
              </TooltipTrigger>
              <TooltipContent align="end">New tab</TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
}

export { ClaudeIcon, CodexIcon, ShellIcon };
