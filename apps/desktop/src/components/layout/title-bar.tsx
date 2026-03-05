import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useHistoryAvailability } from "../../app/history-stack";

const SIDEBAR_WIDTH_CLASS = "w-64";

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

export function TitleBar() {
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

  const onBackKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goBack();
    }
  };

  const onForwardKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goForward();
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="flex h-11 shrink-0 border-b border-[var(--border)]"
    >
      <div
        data-tauri-drag-region
        className={`${SIDEBAR_WIDTH_CLASS} border-r border-[var(--border)] bg-[var(--panel)]`}
      />
      <div
        data-tauri-drag-region
        className="flex flex-1 items-center justify-end bg-[var(--background)] px-4 text-[11px] text-[var(--muted-foreground)]"
      >
        <div data-no-drag className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Go back"
            onClick={goBack}
            onKeyDown={onBackKeyDown}
            disabled={!canGoBack}
            className="h-6 w-6 rounded text-sm text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Go forward"
            onClick={goForward}
            onKeyDown={onForwardKeyDown}
            disabled={!canGoForward}
            className="h-6 w-6 rounded text-sm text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>
    </header>
  );
}
