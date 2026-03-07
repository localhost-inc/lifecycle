import {
  clampSplitRatio,
  DEFAULT_WORKSPACE_SIDEBAR_TOP_PANEL_RATIO,
  getSplitRatioBounds,
  getVerticalSplitRatioFromPointer,
  MIN_WORKSPACE_SIDEBAR_PANEL_HEIGHT,
  readPersistedPanelValue,
  WORKSPACE_SIDEBAR_TOP_PANEL_RATIO_STORAGE_KEY,
  writePersistedPanelValue,
} from "../../../lib/panel-layout";
import {
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GitDiffScope, GitLogEntry } from "@lifecycle/contracts";
import { EnvironmentPanel } from "./environment-panel";
import type { ServiceRow, WorkspaceRow } from "../api";
import { VersionControlPanel } from "../../git/components/version-control-panel";

const PANEL_SEPARATOR_STEP_PX = 32;

interface WorkspaceSidebarProps {
  hasManifest: boolean;
  onOpenDiff: (filePath: string, scope: GitDiffScope) => void;
  onOpenCommitDiff: (entry: GitLogEntry) => void;
  services: ServiceRow[];
  workspace: WorkspaceRow;
}

export function WorkspaceSidebar({
  hasManifest,
  onOpenDiff,
  onOpenCommitDiff,
  services,
  workspace,
}: WorkspaceSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [sidebarHeight, setSidebarHeight] = useState(0);
  const [topPanelRatio, setTopPanelRatio] = useState(() =>
    readPersistedPanelValue(
      WORKSPACE_SIDEBAR_TOP_PANEL_RATIO_STORAGE_KEY,
      DEFAULT_WORKSPACE_SIDEBAR_TOP_PANEL_RATIO,
    ),
  );
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const splitBounds = useMemo(
    () => getSplitRatioBounds(sidebarHeight, MIN_WORKSPACE_SIDEBAR_PANEL_HEIGHT),
    [sidebarHeight],
  );
  const clampedTopPanelRatio = useMemo(
    () => clampSplitRatio(topPanelRatio, splitBounds),
    [splitBounds, topPanelRatio],
  );

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) {
      return;
    }

    const syncHeight = () => {
      setSidebarHeight(sidebar.getBoundingClientRect().height);
    };

    syncHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncHeight);
      return () => window.removeEventListener("resize", syncHeight);
    }

    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (topPanelRatio === clampedTopPanelRatio) {
      return;
    }

    setTopPanelRatio(clampedTopPanelRatio);
  }, [clampedTopPanelRatio, topPanelRatio]);

  useEffect(() => {
    writePersistedPanelValue(
      WORKSPACE_SIDEBAR_TOP_PANEL_RATIO_STORAGE_KEY,
      clampedTopPanelRatio,
    );
  }, [clampedTopPanelRatio]);

  useEffect(() => {
    if (!isResizingPanels) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const sidebar = sidebarRef.current;
      if (!sidebar) {
        return;
      }

      const bounds = sidebar.getBoundingClientRect();
      setTopPanelRatio(
        getVerticalSplitRatioFromPointer(
          event.clientY,
          bounds.top,
          bounds.height,
          MIN_WORKSPACE_SIDEBAR_PANEL_HEIGHT,
        ),
      );
    };

    const handlePointerUp = () => {
      setIsResizingPanels(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isResizingPanels]);

  useEffect(() => {
    if (!isResizingPanels) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingPanels]);

  const handlePanelSeparatorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      setIsResizingPanels(true);
    },
    [],
  );

  const handlePanelSeparatorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const ratioStep =
        sidebarHeight > 0 ? PANEL_SEPARATOR_STEP_PX / sidebarHeight : 0.08;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setTopPanelRatio((current) => clampSplitRatio(current - ratioStep, splitBounds));
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setTopPanelRatio((current) => clampSplitRatio(current + ratioStep, splitBounds));
      }

      if (event.key === "Home") {
        event.preventDefault();
        setTopPanelRatio(splitBounds.minRatio);
      }

      if (event.key === "End") {
        event.preventDefault();
        setTopPanelRatio(splitBounds.maxRatio);
      }
    },
    [sidebarHeight, splitBounds],
  );

  return (
    <aside
      ref={sidebarRef}
      className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden bg-[var(--panel)]"
    >
      <div
        className="min-h-0 shrink-0 overflow-hidden"
        style={{ flexBasis: `${clampedTopPanelRatio * 100}%` }}
      >
        <VersionControlPanel
          onOpenDiff={onOpenDiff}
          onOpenCommitDiff={onOpenCommitDiff}
          workspaceId={workspace.id}
          workspaceMode={workspace.mode}
          worktreePath={workspace.worktree_path}
        />
      </div>
      <div className="relative h-px shrink-0">
        <div
          role="separator"
          aria-label="Resize workspace sidebar panels"
          aria-orientation="horizontal"
          aria-valuemax={Math.round(splitBounds.maxRatio * 100)}
          aria-valuemin={Math.round(splitBounds.minRatio * 100)}
          aria-valuenow={Math.round(clampedTopPanelRatio * 100)}
          tabIndex={0}
          onKeyDown={handlePanelSeparatorKeyDown}
          onPointerDown={handlePanelSeparatorPointerDown}
          className="group absolute inset-x-0 top-1/2 z-10 flex h-3 -translate-y-1/2 cursor-row-resize items-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
        >
          <div className="h-px w-full bg-[var(--border)] transition-colors group-hover:bg-[var(--primary)] group-focus-visible:bg-[var(--primary)]" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <EnvironmentPanel hasManifest={hasManifest} services={services} />
      </div>
    </aside>
  );
}
