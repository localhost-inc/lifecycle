import { Dialog, DialogBackdrop, DialogClose, DialogDescription, DialogTitle } from "@lifecycle/ui";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { GitDiffSurface } from "../../git/components/git-diff-surface";
import type { WorkspaceRouteDialogState } from "../routes/workspace-route-query-state";

interface WorkspaceRouteDialogHostProps {
  dialog: WorkspaceRouteDialogState | null;
  onDialogChange: (dialog: WorkspaceRouteDialogState | null) => void;
  onOpenFile: (filePath: string) => void;
  workspaceId: string;
}

function WorkspaceChangesDialog({
  descriptionId,
  focusPath,
  onOpenFile,
  titleId,
  workspaceId,
}: {
  descriptionId: string;
  focusPath: string | null;
  onOpenFile: (filePath: string) => void;
  titleId: string;
  workspaceId: string;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <DialogTitle className="text-base" id={titleId}>
            Changes
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-5" id={descriptionId}>
            Review local workspace edits in a canvas overlay.
          </DialogDescription>
          {focusPath ? (
            <p className="mt-2 truncate font-mono text-[11px] text-[var(--muted-foreground)]">
              {focusPath}
            </p>
          ) : null}
        </div>
        <DialogClose
          aria-label="Close changes dialog"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)]"
        >
          <X className="size-4" strokeWidth={2} />
        </DialogClose>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <GitDiffSurface
          onOpenFile={onOpenFile}
          source={{ focusPath, mode: "changes" }}
          workspaceId={workspaceId}
        />
      </div>
    </>
  );
}

export function WorkspaceRouteDialogHost({
  dialog,
  onDialogChange,
  onOpenFile,
  workspaceId,
}: WorkspaceRouteDialogHostProps) {
  const open = dialog !== null;
  const popupRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!dialog) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      popupRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [dialog]);

  useEffect(() => {
    if (!dialog) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDialogChange(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialog, onDialogChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDialogChange(null);
        }
      }}
    >
      {dialog ? (
        <div className="absolute inset-0 z-20 p-3 sm:p-4" data-slot="workspace-route-dialog">
          <DialogBackdrop className="!absolute !inset-0 rounded-[20px] bg-[color-mix(in_srgb,var(--background)_58%,transparent)] backdrop-blur-[2px]" />
          <div
            ref={popupRef}
            aria-describedby={descriptionId}
            aria-labelledby={titleId}
            aria-modal="true"
            className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--background)] shadow-[0_28px_90px_rgba(0,0,0,0.24)] outline-none"
            role="dialog"
            tabIndex={-1}
          >
            {dialog.kind === "changes" ? (
              <WorkspaceChangesDialog
                descriptionId={descriptionId}
                focusPath={dialog.focusPath}
                onOpenFile={onOpenFile}
                titleId={titleId}
                workspaceId={workspaceId}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
