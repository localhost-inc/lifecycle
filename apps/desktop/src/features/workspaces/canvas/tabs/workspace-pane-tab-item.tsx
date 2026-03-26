import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { TabChip } from "@/components/tab-chip";
import { TypedTitle } from "@/components/typed-title";
import {
  canvasTabDomId,
  canvasTabPanelId,
} from "@/features/workspaces/canvas/workspace-canvas-ids";

interface WorkspacePaneTabItemProps {
  active: boolean;
  isDirty?: boolean;
  isDraggedTab: boolean;
  isDropTarget: boolean;
  label: string;
  leading: ReactNode;
  onClick: () => void;
  onClose: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  refCallback: (element: HTMLDivElement | null) => void;
  style?: CSSProperties;
  tabKey: string;
  tabIndex: number;
  title: string;
}

export function WorkspacePaneTabItem({
  active,
  isDirty,
  isDraggedTab,
  isDropTarget,
  label,
  leading,
  onClick,
  onClose,
  onKeyDown,
  onPointerDown,
  refCallback,
  style,
  tabKey,
  tabIndex,
  title,
}: WorkspacePaneTabItemProps) {
  const dragDropClasses = [
    isDraggedTab ? "pointer-events-none cursor-grabbing opacity-0 transition-none" : "",
    !isDraggedTab ? "cursor-grab" : "",
    isDropTarget ? "ring-1 ring-[var(--foreground)]/35" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <TabChip
      active={active}
      activeSurface="surface"
      className={`max-w-[300px] touch-none select-none ${dragDropClasses}`}
      dirty={isDirty}
      id={canvasTabDomId(tabKey)}
      indicator={undefined}
      label={label}
      leading={leading}
      onClick={onClick}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      refCallback={refCallback}
      style={style}
      tabIndex={tabIndex}
      title={title}
      ariaControls={canvasTabPanelId(tabKey)}
      ariaSelected={active}
      role="tab"
      dataAttributes={{ "workspace-tab-key": tabKey }}
    >
      <TypedTitle className="min-w-0 flex-1 truncate leading-none font-medium" text={label} />
    </TabChip>
  );
}
