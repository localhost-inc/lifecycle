import {
  useCallback,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { isCommitDiffDocument, isLauncherDocument } from "../state/workspace-surface-state";
import {
  getTabDragPlacement,
  reorderWorkspaceTabKeys,
  tabTitle,
  workspaceTabDomId,
  workspaceTabPanelId,
  type WorkspaceSurfaceTab,
  type WorkspaceTabPlacement,
} from "./workspace-surface-logic";

interface WorkspaceTabDragState {
  draggedKey: string;
  placement: WorkspaceTabPlacement | null;
  targetKey: string | null;
}

interface WorkspaceSurfaceTabBarProps {
  activeTabKey: string | null;
  onCloseDocumentTab: (tabKey: string) => void;
  onCloseRuntimeTab: (tabKey: string, terminalId: string) => void;
  onOpenLauncher: () => void;
  onSelectTab: (key: string) => void;
  onSetTabOrder: (keys: string[]) => void;
  renderTabLeading?: (tab: WorkspaceSurfaceTab) => ReactNode;
  visibleTabs: WorkspaceSurfaceTab[];
}

function defaultTabLeading(tab: WorkspaceSurfaceTab) {
  if (tab.type === "terminal") {
    return null;
  }

  if (isLauncherDocument(tab)) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--background)]/70 text-[11px] text-[var(--muted-foreground)]">
        +
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--background)]/70 font-mono text-[10px] text-[var(--muted-foreground)]">
      {isCommitDiffDocument(tab) ? "#" : "D"}
    </span>
  );
}

export function WorkspaceSurfaceTabBar({
  activeTabKey,
  onCloseDocumentTab,
  onCloseRuntimeTab,
  onOpenLauncher,
  onSelectTab,
  onSetTabOrder,
  renderTabLeading,
  visibleTabs,
}: WorkspaceSurfaceTabBarProps) {
  const [dragState, setDragState] = useState<WorkspaceTabDragState | null>(null);
  const visibleTabKeys = visibleTabs.map((tab) => tab.key);

  const handleTabDragStart = useCallback((event: ReactDragEvent<HTMLElement>, key: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    setDragState({
      draggedKey: key,
      placement: null,
      targetKey: null,
    });
  }, []);

  const handleTabDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>, key: string) => {
      if (!dragState || dragState.draggedKey === key) {
        return;
      }

      event.preventDefault();
      const placement = getTabDragPlacement(event, event.currentTarget);
      if (dragState.targetKey === key && dragState.placement === placement) {
        return;
      }

      setDragState({
        draggedKey: dragState.draggedKey,
        placement,
        targetKey: key,
      });
    },
    [dragState],
  );

  const handleTabDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, key: string) => {
      if (!dragState) {
        return;
      }

      event.preventDefault();
      const placement = getTabDragPlacement(event, event.currentTarget);
      onSetTabOrder(reorderWorkspaceTabKeys(visibleTabKeys, dragState.draggedKey, key, placement));
      setDragState(null);
    },
    [dragState, onSetTabOrder, visibleTabKeys],
  );

  const handleTabDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  return (
    <div
      aria-label="Workspace tabs"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      role="tablist"
    >
      {visibleTabs.map((tab) => {
        const active = tab.key === activeTabKey;
        const isTerminal = tab.type === "terminal";
        const isDropTarget = dragState?.targetKey === tab.key;
        const leading = renderTabLeading ? renderTabLeading(tab) : defaultTabLeading(tab);
        const showFloatingReadyDot = isTerminal && tab.responseReady && !renderTabLeading;

        return (
          <div
            key={tab.key}
            id={workspaceTabDomId(tab.key)}
            aria-controls={workspaceTabPanelId(tab.key)}
            aria-selected={active}
            className={`group relative flex max-w-[300px] shrink-0 items-center gap-1.5 rounded-[18px] px-3 py-1.5 text-left text-sm font-semibold transition-all ${
              active
                ? "bg-[var(--surface-selected)] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_30px_rgba(0,0,0,0.22)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            } ${dragState?.draggedKey === tab.key ? "opacity-60" : ""} ${
              isDropTarget ? "ring-1 ring-[var(--foreground)]/35" : ""
            }`}
            draggable
            onClick={() => onSelectTab(tab.key)}
            onDragEnd={handleTabDragEnd}
            onDragOver={(event) => handleTabDragOver(event, tab.key)}
            onDragStart={(event) => handleTabDragStart(event, tab.key)}
            onDrop={(event) => handleTabDrop(event, tab.key)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key !== "Enter" && event.key !== " ") {
                return;
              }

              event.preventDefault();
              onSelectTab(tab.key);
            }}
            role="tab"
            tabIndex={active ? 0 : -1}
            title={tabTitle(tab)}
          >
            {showFloatingReadyDot ? (
              <ResponseReadyDot className="pointer-events-none absolute right-3 top-1.5" />
            ) : null}
            {leading}
            <span className="truncate">{tab.label}</span>
            <button
              type="button"
              aria-label={`Close ${tab.label}`}
              className={`ml-auto shrink-0 rounded-full p-1 transition hover:bg-[var(--background)]/70 ${
                active
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              }`}
              draggable={false}
              onClick={(event) => {
                event.stopPropagation();

                if (isTerminal) {
                  void onCloseRuntimeTab(tab.key, tab.terminalId);
                  return;
                }

                onCloseDocumentTab(tab.key);
              }}
            >
              <svg
                fill="none"
                height="12"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.5"
                viewBox="0 0 12 12"
                width="12"
              >
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="shrink-0 whitespace-nowrap px-2 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        onClick={onOpenLauncher}
      >
        + New Tab
      </button>
    </div>
  );
}
