import type { WorkspaceStatus } from "@lifecycle/contracts";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useHistoryAvailability } from "../../app/history-stack";
import { WorkspaceBadge } from "../../features/workspaces/components/workspace-badge";
import type { WorkspaceRow } from "../../features/workspaces/api";

interface TitleBarProps {
  selectedWorkspace?: WorkspaceRow | null;
}

function shouldSkipDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest("button, a, input, textarea, select, [role='button'], [data-no-drag]") !== null
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.closest("[contenteditable='true']") !== null
  );
}

export function TitleBar({ selectedWorkspace }: TitleBarProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryAvailability();

  const handleMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (shouldSkipDrag(event.target)) return;
    if (!isTauri()) return;
    void getCurrentWindow()
      .startDragging()
      .catch((error) => {
        console.warn("Failed to start window dragging:", error);
      });
  };

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    navigate(-1);
  }, [canGoBack, navigate]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    navigate(1);
  }, [canGoForward, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const isMacShortcut = event.metaKey && !event.ctrlKey;
      const isNonMacShortcut = event.ctrlKey && !event.metaKey;
      if (!isMacShortcut && !isNonMacShortcut) return;

      if (event.key === "[") {
        event.preventDefault();
        goBack();
      }

      if (event.key === "]") {
        event.preventDefault();
        goForward();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goBack, goForward]);

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="flex h-11 shrink-0 items-center border-b border-[var(--border)] bg-[var(--background)] px-4 text-[11px] text-[var(--muted-foreground)]"
    >
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-3">
        {selectedWorkspace && (
          <div data-no-drag className="flex min-w-0 items-center gap-2.5">
            <span className="font-mono text-[13px] font-medium text-[var(--foreground)]">
              {selectedWorkspace.source_ref}
            </span>
            {selectedWorkspace.git_sha && (
              <span className="font-mono text-xs text-[var(--muted-foreground)]">
                {selectedWorkspace.git_sha.slice(0, 8)}
              </span>
            )}
            <WorkspaceBadge status={selectedWorkspace.status as WorkspaceStatus} />
          </div>
        )}
      </div>
      <div data-no-drag id="title-bar-actions" className="flex shrink-0 items-center gap-1" />
    </header>
  );
}
