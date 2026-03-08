import type { FileDiffMetadata } from "@pierre/diffs/react";

const DIFF_SECTION_BODY_MIN_HEIGHT = 48;
const DIFF_SECTION_BODY_PADDING = 16;
const DIFF_SECTION_HEADER_HEIGHT = 50;
const DIFF_SECTION_HUNK_SEPARATOR_HEIGHT = 24;
const DIFF_SECTION_LINE_HEIGHT = 20;

export const DIFF_SECTION_OVERSCAN_PX = 960;
export const DIFF_ACTIVE_FILE_SCROLL_OFFSET = 24;

export interface DiffSectionLayoutItem {
  end: number;
  height: number;
  path: string;
  start: number;
}

export interface DiffSectionLayout {
  items: DiffSectionLayoutItem[];
  totalHeight: number;
}

export function estimateDiffBodyHeight(fileDiff: FileDiffMetadata): number {
  const lineCount = Math.max(fileDiff.splitLineCount, fileDiff.unifiedLineCount, 0);
  const separatorCount = Math.max(fileDiff.hunks.length, 1);

  return Math.max(
    DIFF_SECTION_BODY_MIN_HEIGHT,
    lineCount * DIFF_SECTION_LINE_HEIGHT +
      separatorCount * DIFF_SECTION_HUNK_SEPARATOR_HEIGHT +
      DIFF_SECTION_BODY_PADDING,
  );
}

export function estimateDiffSectionHeight(fileDiff: FileDiffMetadata, collapsed: boolean): number {
  if (collapsed) {
    return DIFF_SECTION_HEADER_HEIGHT;
  }

  return DIFF_SECTION_HEADER_HEIGHT + estimateDiffBodyHeight(fileDiff);
}

export function buildDiffSectionLayout({
  collapsedPaths,
  files,
  measuredHeights,
}: {
  collapsedPaths: ReadonlySet<string>;
  files: FileDiffMetadata[];
  measuredHeights: Readonly<Record<string, number>>;
}): DiffSectionLayout {
  const items: DiffSectionLayoutItem[] = [];
  let totalHeight = 0;

  for (const fileDiff of files) {
    const measuredHeight = measuredHeights[fileDiff.name];
    const height =
      measuredHeight ?? estimateDiffSectionHeight(fileDiff, collapsedPaths.has(fileDiff.name));

    items.push({
      end: totalHeight + height,
      height,
      path: fileDiff.name,
      start: totalHeight,
    });
    totalHeight += height;
  }

  return {
    items,
    totalHeight,
  };
}

export function findDiffSectionIndexAtOffset(layout: DiffSectionLayout, offset: number): number {
  if (layout.items.length === 0) {
    return -1;
  }

  const clampedOffset = Math.min(Math.max(offset, 0), Math.max(layout.totalHeight - 1, 0));
  let low = 0;
  let high = layout.items.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const item = layout.items[mid]!;

    if (clampedOffset < item.start) {
      high = mid - 1;
      continue;
    }

    if (clampedOffset >= item.end) {
      low = mid + 1;
      continue;
    }

    return mid;
  }

  return Math.min(Math.max(low, 0), layout.items.length - 1);
}

export function getVirtualDiffRange(
  layout: DiffSectionLayout,
  scrollTop: number,
  viewportHeight: number,
  overscanPx: number = DIFF_SECTION_OVERSCAN_PX,
): {
  endIndex: number;
  startIndex: number;
} {
  if (layout.items.length === 0) {
    return {
      endIndex: 0,
      startIndex: 0,
    };
  }

  const visibleStart = Math.max(scrollTop - overscanPx, 0);
  const visibleEnd = Math.max(scrollTop + Math.max(viewportHeight, 1) + overscanPx, 1);
  const startIndex = findDiffSectionIndexAtOffset(layout, visibleStart);
  const endIndex = findDiffSectionIndexAtOffset(layout, visibleEnd - 1) + 1;

  return {
    endIndex: Math.max(startIndex + 1, endIndex),
    startIndex,
  };
}

export function buildPatchRenderCacheKey(baseKey: string, patch: string): string {
  return `${baseKey}:${patch.length}:${hashString(patch)}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
