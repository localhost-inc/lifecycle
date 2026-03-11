import {
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { summarizeChanges } from "./git-file-header";
import { DiffFileTree } from "./diff-file-tree";
import { DiffFileSection } from "./diff-file-section";
import {
  DIFF_ACTIVE_FILE_SCROLL_OFFSET,
  buildDiffSectionLayout,
  findDiffSectionIndexAtOffset,
  getVirtualDiffRange,
} from "../lib/diff-virtualization";
import {
  clampPanelSize,
  DEFAULT_DIFF_FILE_TREE_WIDTH,
  DIFF_FILE_TREE_WIDTH_STORAGE_KEY,
  getLeftSidebarWidthFromPointer,
  MAX_DIFF_FILE_TREE_WIDTH,
  MIN_DIFF_FILE_TREE_WIDTH,
  readPersistedPanelValue,
  writePersistedPanelValue,
} from "../../../lib/panel-layout";

interface MultiFileDiffLayoutProps {
  files: FileDiffMetadata[];
  initialFilePath?: string | null;
  onOpenFile?: ((filePath: string) => void) | null;
  theme: string;
  themeType: "light" | "dark";
}

const TREE_BOUNDS = {
  minSize: MIN_DIFF_FILE_TREE_WIDTH,
  maxSize: MAX_DIFF_FILE_TREE_WIDTH,
};

export function MultiFileDiffLayout({
  files,
  initialFilePath,
  onOpenFile,
  theme,
  themeType,
}: MultiFileDiffLayoutProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());
  const { totalAdditions, totalDeletions } = useMemo(() => {
    let adds = 0;
    let dels = 0;
    for (const f of files) {
      const s = summarizeChanges(f);
      adds += s.additions;
      dels += s.deletions;
    }
    return { totalAdditions: adds, totalDeletions: dels };
  }, [files]);

  useEffect(() => {
    const validPaths = new Set(files.map((file) => file.name));
    setCollapsedPaths((prev) => {
      let changed = false;
      const next = new Set<string>();

      for (const path of prev) {
        if (!validPaths.has(path)) {
          changed = true;
          continue;
        }

        next.add(path);
      }

      return changed ? next : prev;
    });
  }, [files]);

  const handleToggleCollapse = useCallback((path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (files.length <= 1) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        {files.map((fileDiff, index) => (
          <DiffFileSection
            key={`${fileDiff.prevName ?? ""}:${fileDiff.name}:${index}`}
            collapsed={collapsedPaths.has(fileDiff.name)}
            fileDiff={fileDiff}
            onOpenFile={onOpenFile}
            onToggleCollapse={handleToggleCollapse}
            theme={theme}
            themeType={themeType}
          />
        ))}
      </div>
    );
  }

  return (
    <MultiFileDiffLayoutInner
      files={files}
      onOpenFile={onOpenFile}
      collapsedPaths={collapsedPaths}
      initialFilePath={initialFilePath}
      onToggleCollapse={handleToggleCollapse}
      theme={theme}
      themeType={themeType}
      totalAdditions={totalAdditions}
      totalDeletions={totalDeletions}
    />
  );
}

interface InnerProps {
  collapsedPaths: ReadonlySet<string>;
  files: FileDiffMetadata[];
  initialFilePath?: string | null;
  onOpenFile?: ((filePath: string) => void) | null;
  onToggleCollapse: (path: string) => void;
  theme: string;
  themeType: "light" | "dark";
  totalAdditions: number;
  totalDeletions: number;
}

function MultiFileDiffLayoutInner({
  collapsedPaths,
  files,
  initialFilePath,
  onOpenFile,
  onToggleCollapse,
  theme,
  themeType,
  totalAdditions,
  totalDeletions,
}: InnerProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [treeWidth, setTreeWidth] = useState(() =>
    readPersistedPanelValue(DIFF_FILE_TREE_WIDTH_STORAGE_KEY, DEFAULT_DIFF_FILE_TREE_WIDTH),
  );
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const lastAutoFocusedSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    writePersistedPanelValue(DIFF_FILE_TREE_WIDTH_STORAGE_KEY, treeWidth);
  }, [treeWidth]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    let frameId: number | null = null;

    const syncScrollMetrics = () => {
      setScrollTop((prev) => {
        const next = scrollContainer.scrollTop;
        return prev === next ? prev : next;
      });
      setViewportHeight((prev) => {
        const next = scrollContainer.clientHeight;
        return prev === next ? prev : next;
      });
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncScrollMetrics();
      });
    };

    syncScrollMetrics();

    scrollContainer.addEventListener("scroll", scheduleSync, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleSync();
          });
    resizeObserver?.observe(scrollContainer);

    return () => {
      scrollContainer.removeEventListener("scroll", scheduleSync);
      resizeObserver?.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [files]);

  useEffect(() => {
    setMeasuredHeights((prev) => {
      return Object.keys(prev).length === 0 ? prev : {};
    });
  }, [files]);

  const fileIndexByPath = useMemo(() => {
    const next = new Map<string, number>();
    files.forEach((file, index) => {
      next.set(file.name, index);
    });
    return next;
  }, [files]);

  const layout = useMemo(
    () =>
      buildDiffSectionLayout({
        collapsedPaths,
        files,
        measuredHeights,
      }),
    [collapsedPaths, files, measuredHeights],
  );
  const virtualRange = useMemo(
    () => getVirtualDiffRange(layout, scrollTop, viewportHeight),
    [layout, scrollTop, viewportHeight],
  );
  const topSpacerHeight = layout.items[virtualRange.startIndex]?.start ?? 0;
  const bottomSpacerHeight =
    layout.totalHeight - (layout.items[virtualRange.endIndex - 1]?.end ?? 0);
  const activeFileIndex = useMemo(
    () => findDiffSectionIndexAtOffset(layout, scrollTop + DIFF_ACTIVE_FILE_SCROLL_OFFSET),
    [layout, scrollTop],
  );
  const activeFilePath =
    activeFileIndex === -1 ? null : (layout.items[activeFileIndex]?.path ?? null);
  const deferredActiveFilePath = useDeferredValue(activeFilePath);

  const handleSelectFile = useCallback(
    (path: string, behavior: ScrollBehavior = "smooth") => {
      const scrollContainer = scrollContainerRef.current;
      const index = fileIndexByPath.get(path);
      if (scrollContainer && index !== undefined) {
        scrollContainer.scrollTo({
          behavior,
          top: layout.items[index]?.start ?? 0,
        });
      }
    },
    [fileIndexByPath, layout],
  );

  useEffect(() => {
    if (!initialFilePath) {
      return;
    }

    const firstFile = files[0]?.name ?? "";
    const lastFile = files.at(-1)?.name ?? "";
    const signature = `${initialFilePath}:${files.length}:${firstFile}:${lastFile}`;

    if (lastAutoFocusedSignatureRef.current === signature) {
      return;
    }

    if (!fileIndexByPath.has(initialFilePath)) {
      return;
    }

    lastAutoFocusedSignatureRef.current = signature;
    handleSelectFile(initialFilePath, "auto");
  }, [fileIndexByPath, files, handleSelectFile, initialFilePath]);

  const handleSectionHeightChange = useCallback((path: string, height: number) => {
    if (height <= 0) {
      return;
    }

    const roundedHeight = Math.round(height);
    setMeasuredHeights((prev) => {
      if (prev[path] === roundedHeight) {
        return prev;
      }

      return {
        ...prev,
        [path]: roundedHeight,
      };
    });
  }, []);

  const handleVirtualizedToggleCollapse = useCallback(
    (path: string) => {
      setMeasuredHeights((prev) => {
        if (!(path in prev)) {
          return prev;
        }

        const next = { ...prev };
        delete next[path];
        return next;
      });
      onToggleCollapse(path);
    },
    [onToggleCollapse],
  );

  // Resize handling
  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      setTreeWidth(getLeftSidebarWidthFromPointer(event.clientX, bounds.left, TREE_BOUNDS));
    };

    const handlePointerUp = () => {
      setResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [resizing]);

  useEffect(() => {
    if (!resizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizing]);

  const handleSeparatorPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  }, []);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
      <div
        className="flex min-h-0 shrink-0 bg-[var(--panel)]"
        style={{ width: `${clampPanelSize(treeWidth, TREE_BOUNDS)}px` }}
      >
        <DiffFileTree
          activeFilePath={deferredActiveFilePath}
          files={files}
          onSelectFile={(path) => handleSelectFile(path)}
          totalAdditions={totalAdditions}
          totalDeletions={totalDeletions}
        />
      </div>
      <div className="relative w-px shrink-0">
        <div
          role="separator"
          aria-label="Resize file tree"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={handleSeparatorPointerDown}
          className="group absolute inset-y-0 left-1/2 z-10 flex w-3 -translate-x-1/2 touch-none cursor-col-resize justify-center outline-none focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <div className="w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--ring)] group-focus-visible:bg-[var(--ring)]" />
        </div>
      </div>
      <div ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
        {topSpacerHeight > 0 && (
          <div aria-hidden="true" style={{ height: `${topSpacerHeight}px` }} />
        )}
        {files.slice(virtualRange.startIndex, virtualRange.endIndex).map((fileDiff, index) => (
          <DiffFileSection
            key={`${fileDiff.prevName ?? ""}:${fileDiff.name}:${virtualRange.startIndex + index}`}
            collapsed={collapsedPaths.has(fileDiff.name)}
            fileDiff={fileDiff}
            onHeightChange={handleSectionHeightChange}
            onOpenFile={onOpenFile}
            onToggleCollapse={handleVirtualizedToggleCollapse}
            theme={theme}
            themeType={themeType}
          />
        ))}
        {bottomSpacerHeight > 0 && (
          <div aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }} />
        )}
      </div>
    </div>
  );
}
