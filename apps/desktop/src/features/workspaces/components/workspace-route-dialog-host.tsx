import { Dialog, DialogClose, DialogDescription, DialogTitle } from "@lifecycle/ui";
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
      <DialogTitle className="sr-only" id={titleId}>
        Changes
      </DialogTitle>
      <DialogDescription className="sr-only" id={descriptionId}>
        Review local workspace edits in a dedicated workspace surface.
      </DialogDescription>
      <DialogClose
        aria-label="Close changes dialog"
        className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-[color-mix(in_srgb,var(--background)_78%,transparent)] text-[var(--muted-foreground)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:shadow-[0_0_0_1px_var(--ring)]"
      >
        <X className="size-4" strokeWidth={2} />
      </DialogClose>
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
        <div
          className="absolute inset-0 z-30 flex min-h-0 flex-col p-3 sm:p-4 lg:p-5"
          data-slot="workspace-route-dialog"
        >
          <div
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--background)_48%,transparent)] backdrop-blur-[6px]"
            data-slot="workspace-route-dialog-backdrop"
          />
          <div
            ref={popupRef}
            aria-describedby={descriptionId}
            aria-labelledby={titleId}
            aria-modal="true"
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--border)_82%,transparent)] bg-[color-mix(in_srgb,var(--background)_92%,var(--surface))] shadow-[0_28px_90px_rgba(0,0,0,0.28)] outline-none"
            data-slot="workspace-route-dialog-panel"
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
