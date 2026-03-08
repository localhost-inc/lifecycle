import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { isCommitDiffDocument, isLauncherDocument } from "../state/workspace-surface-state";
import {
  getWorkspaceTabDragShiftDirection,
  reorderWorkspaceTabKeys,
  type WorkspaceSurfaceTab,
  type WorkspaceTabPlacement,
} from "./workspace-surface-logic";
import { WorkspaceSurfaceTabItem } from "./workspace-surface-tab-item";

const TAB_DRAG_GAP_PX = 2;
const TAB_DRAG_START_THRESHOLD_PX = 6;

interface WorkspaceTabDragState {
  draggedKey: string;
  draggedWidth: number;
  placement: WorkspaceTabPlacement | null;
  pointerDeltaX: number;
  targetKey: string | null;
}

interface WorkspaceTabPointerSession {
  draggedKey: string;
  draggedWidth: number;
  initialPointerX: number;
  pointerId: number;
  started: boolean;
}

interface WorkspaceSurfaceTabBarProps {
  activeTabKey: string | null;
  onCloseDocumentTab: (tabKey: string) => void;
  onCloseRuntimeTab: (tabKey: string, terminalId: string) => void;
  onRenameRuntimeTab?: (terminalId: string, label: string) => Promise<unknown> | unknown;
  onSelectTab: (key: string) => void;
  onSetTabOrder: (keys: string[]) => void;
  renderTabLeading?: (tab: WorkspaceSurfaceTab) => ReactNode;
  visibleTabs: WorkspaceSurfaceTab[];
}

interface WorkspaceTabRenameState {
  error: string | null;
  key: string;
  saving: boolean;
  terminalId: string;
  value: string;
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
  onRenameRuntimeTab,
  onSelectTab,
  onSetTabOrder,
  renderTabLeading,
  visibleTabs,
}: WorkspaceSurfaceTabBarProps) {
  const [dragState, setDragState] = useState<WorkspaceTabDragState | null>(null);
  const [renameState, setRenameState] = useState<WorkspaceTabRenameState | null>(null);
  const dragSessionRef = useRef<WorkspaceTabPointerSession | null>(null);
  const dragStateRef = useRef<WorkspaceTabDragState | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const skipRenameBlurRef = useRef(false);
  const tabElementsRef = useRef(new Map<string, HTMLDivElement>());
  const onSetTabOrderRef = useRef(onSetTabOrder);
  const suppressClickRef = useRef<string | null>(null);
  const visibleTabKeys = visibleTabs.map((tab) => tab.key);
  const visibleTabKeysRef = useRef(visibleTabKeys);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    onSetTabOrderRef.current = onSetTabOrder;
  }, [onSetTabOrder]);

  useEffect(() => {
    visibleTabKeysRef.current = visibleTabKeys;
  }, [visibleTabKeys]);

  useEffect(() => {
    if (!renameState) {
      return;
    }

    const activeTab = visibleTabs.find(
      (tab) => tab.key === renameState.key && tab.type === "terminal",
    );
    if (!activeTab) {
      setRenameState(null);
    }
  }, [renameState, visibleTabs]);

  useEffect(() => {
    if (!renameState) {
      return;
    }

    const timeoutId = setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [renameState]);

  const setTabElement = useCallback((key: string, element: HTMLDivElement | null) => {
    if (element) {
      tabElementsRef.current.set(key, element);
      return;
    }

    tabElementsRef.current.delete(key);
  }, []);

  const resolveDragTarget = useCallback((pointerX: number, draggedKey: string) => {
    const orderedKeys = visibleTabKeysRef.current.filter((key) => key !== draggedKey);
    let trailingKey: string | null = null;

    for (const key of orderedKeys) {
      const element = tabElementsRef.current.get(key);
      if (!element) {
        continue;
      }

      trailingKey = key;
      const rect = element.getBoundingClientRect();
      if (pointerX < rect.left + rect.width / 2) {
        return { placement: "before" as const, targetKey: key };
      }
    }

    return trailingKey ? { placement: "after" as const, targetKey: trailingKey } : null;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const pointerDeltaX = event.clientX - session.initialPointerX;
      if (!session.started && Math.abs(pointerDeltaX) < TAB_DRAG_START_THRESHOLD_PX) {
        return;
      }

      const nextTarget = resolveDragTarget(event.clientX, session.draggedKey);
      session.started = true;
      document.body.style.userSelect = "none";
      setDragState((current) => {
        const nextState: WorkspaceTabDragState = {
          draggedKey: session.draggedKey,
          draggedWidth: session.draggedWidth,
          placement: nextTarget?.placement ?? null,
          pointerDeltaX,
          targetKey: nextTarget?.targetKey ?? null,
        };

        if (
          current?.draggedKey === nextState.draggedKey &&
          current.draggedWidth === nextState.draggedWidth &&
          current.placement === nextState.placement &&
          current.pointerDeltaX === nextState.pointerDeltaX &&
          current.targetKey === nextState.targetKey
        ) {
          return current;
        }

        return nextState;
      });
    };

    const handlePointerFinish = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const finalDragState = dragStateRef.current;
      if (session.started) {
        suppressClickRef.current = session.draggedKey;
      }

      if (session.started && finalDragState?.targetKey && finalDragState.placement) {
        onSetTabOrderRef.current(
          reorderWorkspaceTabKeys(
            visibleTabKeysRef.current,
            session.draggedKey,
            finalDragState.targetKey,
            finalDragState.placement,
          ),
        );
      }

      dragSessionRef.current = null;
      dragStateRef.current = null;
      document.body.style.userSelect = "";
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
      document.body.style.userSelect = "";
    };
  }, [resolveDragTarget]);

  const handleTabPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, key: string) => {
      if (renameState?.key === key) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      dragSessionRef.current = {
        draggedKey: key,
        draggedWidth: event.currentTarget.getBoundingClientRect().width,
        initialPointerX: event.clientX,
        pointerId: event.pointerId,
        started: false,
      };
    },
    [renameState],
  );

  const handleTabClick = useCallback(
    (key: string) => {
      if (renameState?.key === key) {
        return;
      }

      if (suppressClickRef.current === key) {
        suppressClickRef.current = null;
        return;
      }

      onSelectTab(key);
    },
    [onSelectTab, renameState],
  );

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, key: string) => {
      if (renameState?.key === key) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      onSelectTab(key);
    },
    [onSelectTab, renameState],
  );

  const startRenamingTab = useCallback(
    (tab: WorkspaceSurfaceTab) => {
      if (tab.type !== "terminal" || !onRenameRuntimeTab) {
        return;
      }

      dragSessionRef.current = null;
      dragStateRef.current = null;
      document.body.style.userSelect = "";
      setDragState(null);
      skipRenameBlurRef.current = false;
      setRenameState({
        error: null,
        key: tab.key,
        saving: false,
        terminalId: tab.terminalId,
        value: tab.label,
      });
      onSelectTab(tab.key);
    },
    [onRenameRuntimeTab, onSelectTab],
  );

  const cancelTabRename = useCallback(() => {
    setRenameState(null);
  }, []);

  const commitTabRename = useCallback(async () => {
    if (!renameState || !onRenameRuntimeTab || renameState.saving) {
      return;
    }

    const normalizedLabel = renameState.value.trim().replace(/\s+/g, " ");
    if (normalizedLabel.length === 0) {
      setRenameState((current) =>
        current
          ? {
              ...current,
              error: "Session title cannot be empty.",
            }
          : current,
      );
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
      return;
    }

    const currentTab = visibleTabs.find(
      (tab): tab is Extract<WorkspaceSurfaceTab, { type: "terminal" }> =>
        tab.key === renameState.key && tab.type === "terminal",
    );
    if (!currentTab) {
      setRenameState(null);
      return;
    }

    if (normalizedLabel === currentTab.label) {
      setRenameState(null);
      return;
    }

    setRenameState((current) =>
      current
        ? {
            ...current,
            error: null,
            saving: true,
          }
        : current,
    );

    try {
      await onRenameRuntimeTab(renameState.terminalId, normalizedLabel);
      setRenameState(null);
    } catch (error) {
      setRenameState((current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : "Session rename failed.",
              saving: false,
            }
          : current,
      );
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [onRenameRuntimeTab, renameState, visibleTabs]);

  return (
    <div className="relative min-w-0 flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[var(--background)] to-transparent"
      />
      <div
        aria-label="Workspace tabs"
        className="flex items-center gap-0.5 overflow-x-auto py-1"
        role="tablist"
      >
        {visibleTabs.map((tab) => {
          const active = tab.key === activeTabKey;
          const isTerminal = tab.type === "terminal";
          const isRenaming = renameState?.key === tab.key;
          const isDropTarget = dragState?.targetKey === tab.key;
          const isDraggedTab = dragState?.draggedKey === tab.key;
          const leading = renderTabLeading ? renderTabLeading(tab) : defaultTabLeading(tab);
          const showFloatingReadyDot =
            isTerminal && tab.responseReady && !active && !renderTabLeading;
          const previewShiftDirection =
            dragState?.targetKey && dragState.placement
              ? getWorkspaceTabDragShiftDirection(
                  visibleTabKeys,
                  dragState.draggedKey,
                  dragState.targetKey,
                  dragState.placement,
                  tab.key,
                )
              : 0;
          const previewShiftPx =
            previewShiftDirection === 0 || !dragState
              ? 0
              : previewShiftDirection * (dragState.draggedWidth + TAB_DRAG_GAP_PX);
          const translateX = isDraggedTab ? (dragState?.pointerDeltaX ?? 0) : previewShiftPx;

          return (
            <WorkspaceSurfaceTabItem
              key={tab.key}
              active={active}
              isDraggedTab={isDraggedTab}
              isDropTarget={isDropTarget}
              isRenaming={Boolean(isRenaming)}
              leading={leading}
              onClick={() => handleTabClick(tab.key)}
              onClose={() => {
                if (isTerminal) {
                  void onCloseRuntimeTab(tab.key, tab.terminalId);
                  return;
                }

                onCloseDocumentTab(tab.key);
              }}
              onDoubleClick={(event) => {
                if (!isTerminal || !onRenameRuntimeTab) {
                  return;
                }

                if (
                  event.target instanceof Element &&
                  event.target.closest("[data-tab-action='close']")
                ) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                startRenamingTab(tab);
              }}
              onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
              onPointerDown={(event) => handleTabPointerDown(event, tab.key)}
              refCallback={(element) => setTabElement(tab.key, element)}
              renameError={renameState?.error ?? null}
              renameInputRef={renameInputRef}
              renameSaving={renameState?.saving ?? false}
              renameValue={renameState?.value ?? tab.label}
              showFloatingReadyDot={showFloatingReadyDot}
              style={translateX === 0 ? undefined : { transform: `translateX(${translateX}px)` }}
              tab={tab}
              tabIndex={isRenaming ? -1 : active ? 0 : -1}
              onRenameBlur={() => {
                if (skipRenameBlurRef.current) {
                  skipRenameBlurRef.current = false;
                  return;
                }
                void commitTabRename();
              }}
              onRenameChange={(value) => {
                setRenameState((current) =>
                  current
                    ? {
                        ...current,
                        error: null,
                        value,
                      }
                    : current,
                );
              }}
              onRenameKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitTabRename();
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  skipRenameBlurRef.current = true;
                  cancelTabRename();
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
