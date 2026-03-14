export type ProjectContentTabPlacement = "after" | "before";

const NO_TAB_DRAG_SHIFT = 0 as const;

export interface ProjectContentTabRect {
  id: string;
  left: number;
  width: number;
}

export function reorderProjectContentTabIds(
  tabIds: readonly string[],
  draggedId: string,
  targetId: string,
  placement: ProjectContentTabPlacement,
): string[] {
  if (draggedId === targetId) {
    return [...tabIds];
  }

  const nextIds = tabIds.filter((tabId) => tabId !== draggedId);
  const targetIndex = nextIds.indexOf(targetId);
  if (targetIndex < 0) {
    return [...tabIds];
  }

  const insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [...nextIds.slice(0, insertionIndex), draggedId, ...nextIds.slice(insertionIndex)];
}

export function resolveProjectContentTabStripDropTarget({
  draggedId,
  pointerX,
  tabRects,
}: {
  draggedId: string;
  pointerX: number;
  tabRects: readonly ProjectContentTabRect[];
}): { placement: ProjectContentTabPlacement; targetId: string } | null {
  const orderedRects = [...tabRects]
    .filter((tabRect) => tabRect.id !== draggedId)
    .sort((left, right) => left.left - right.left);

  if (orderedRects.length === 0) {
    return null;
  }

  let trailingTabId: string | null = null;
  for (const tabRect of orderedRects) {
    trailingTabId = tabRect.id;
    if (pointerX < tabRect.left + tabRect.width / 2) {
      return {
        placement: "before",
        targetId: tabRect.id,
      };
    }
  }

  return trailingTabId
    ? {
        placement: "after",
        targetId: trailingTabId,
      }
    : null;
}

export function getProjectContentTabDragShiftDirection(
  tabIds: readonly string[],
  draggedId: string,
  targetId: string,
  placement: ProjectContentTabPlacement,
  tabId: string,
): -1 | 0 | 1 {
  if (tabId === draggedId) {
    return NO_TAB_DRAG_SHIFT;
  }

  const currentIndex = tabIds.indexOf(tabId);
  if (currentIndex < 0) {
    return NO_TAB_DRAG_SHIFT;
  }

  const previewIndex = reorderProjectContentTabIds(tabIds, draggedId, targetId, placement).indexOf(
    tabId,
  );

  if (previewIndex < 0 || previewIndex === currentIndex) {
    return NO_TAB_DRAG_SHIFT;
  }

  return previewIndex < currentIndex ? -1 : 1;
}
