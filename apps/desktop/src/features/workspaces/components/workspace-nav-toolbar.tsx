import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
  Spinner,
} from "@lifecycle/ui";
import { ChevronDown, GitCommitHorizontal, Play, RotateCcw, Square } from "lucide-react";
import { useState } from "react";
import type { WorkspaceToolbarSlot } from "../state/workspace-toolbar-context";

interface WorkspaceNavToolbarProps {
  slot: WorkspaceToolbarSlot;
}

function RunIcon({ label, loading }: { label: string; loading: boolean }) {
  if (loading) return <Spinner className="size-3.5" />;
  if (label === "Stop" || label === "Stopping...") return <Square className="size-3 fill-current" strokeWidth={2.2} />;
  return <Play className="size-3 fill-current" strokeWidth={2.2} />;
}

export function WorkspaceNavToolbar({ slot }: WorkspaceNavToolbarProps) {
  const [restartMenuOpen, setRestartMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      {/* Run / Stop — plain button when no restart, split when restart is available */}
      {slot.runAction && (
        slot.restartAction ? (
          <SplitButton className="gap-0">
            <SplitButtonPrimary
              disabled={slot.runAction.disabled}
              leadingIcon={<RunIcon label={slot.runAction.label} loading={slot.runAction.loading} />}
              onClick={slot.runAction.onClick}
              variant="outline"
            >
              {slot.runAction.label}
            </SplitButtonPrimary>
            <Popover onOpenChange={setRestartMenuOpen} open={restartMenuOpen}>
              <PopoverTrigger asChild>
                <SplitButtonSecondary
                  aria-label="Show run actions"
                  disabled={slot.restartAction.disabled}
                  variant="outline"
                >
                  <ChevronDown className="size-3.5" strokeWidth={2.4} />
                </SplitButtonSecondary>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-44 rounded-lg border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
                side="bottom"
                sideOffset={8}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={slot.restartAction.disabled}
                  onClick={() => {
                    setRestartMenuOpen(false);
                    slot.restartAction?.onClick();
                  }}
                >
                  <RotateCcw className="size-3.5" strokeWidth={2.2} />
                  <span>Restart</span>
                </button>
              </PopoverContent>
            </Popover>
          </SplitButton>
        ) : (
          <Button
            disabled={slot.runAction.disabled}
            onClick={slot.runAction.onClick}
            size="sm"
            variant="outline"
          >
            <RunIcon label={slot.runAction.label} loading={slot.runAction.loading} />
            <span>{slot.runAction.label}</span>
          </Button>
        )
      )}

      {/* Git action */}
      {slot.gitAction && (
        <Button
          disabled={slot.gitAction.disabled}
          onClick={slot.gitAction.onClick}
          size="sm"
          variant="outline"
        >
          {slot.gitAction.loading ? (
            <Spinner className="size-3.5" />
          ) : (
            <GitCommitHorizontal className="size-3.5" strokeWidth={2.2} />
          )}
          <span>{slot.gitAction.label}</span>
        </Button>
      )}
    </div>
  );
}
