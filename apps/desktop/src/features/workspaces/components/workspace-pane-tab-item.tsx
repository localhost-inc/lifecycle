import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { TabChip } from "@/components/tab-chip";
import { TypedTitle } from "@/components/typed-title";
import { tabTitle, type WorkspaceCanvasTab } from "@/features/workspaces/components/workspace-canvas-tabs";
import { canvasTabDomId, canvasTabPanelId } from "@/features/workspaces/components/workspace-canvas-ids";

interface WorkspacePaneTabItemProps {
  active: boolean;
  isDraggedTab: boolean;
  isDropTarget: boolean;
  isRenaming: boolean;
  leading: ReactNode;
  onClick: () => void;
  onClose: () => void;
  onDoubleClick: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  refCallback: (element: HTMLDivElement | null) => void;
  renameError: string | null;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameSaving: boolean;
  renameValue: string;
  style?: CSSProperties;
  tab: WorkspaceCanvasTab;
  tabIndex: number;
  onRenameBlur: () => void;
  onRenameChange: (value: string) => void;
  onRenameKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}

export function WorkspacePaneTabItem({
  active,
  isDraggedTab,
  isDropTarget,
  isRenaming,
  leading,
  onClick,
  onClose,
  onDoubleClick,
  onKeyDown,
  onPointerDown,
  refCallback,
  renameError,
  renameInputRef,
  renameSaving,
  renameValue,
  style,
  tab,
  tabIndex,
  onRenameBlur,
  onRenameChange,
  onRenameKeyDown,
}: WorkspacePaneTabItemProps) {
  const dragDropClasses = [
    isRenaming ? "cursor-text" : "",
    isDraggedTab ? "pointer-events-none cursor-grabbing opacity-0 transition-none" : "",
    !isRenaming && !isDraggedTab ? "cursor-grab" : "",
    isDropTarget ? "ring-1 ring-[var(--foreground)]/35" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <TabChip
      active={active}
      activeSurface="surface"
      className={`max-w-[300px] touch-none select-none ${dragDropClasses}`}
      closable={!isRenaming}
      id={canvasTabDomId(tab.key)}
      indicator={undefined}
      label={tab.label}
      leading={leading}
      onClick={onClick}
      onClose={onClose}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      refCallback={refCallback}
      style={style}
      tabIndex={tabIndex}
      title={tabTitle(tab)}
      ariaControls={isRenaming ? undefined : canvasTabPanelId(tab.key)}
      ariaSelected={isRenaming ? undefined : active}
      role={isRenaming ? undefined : "tab"}
      dataAttributes={{ "workspace-tab-key": tab.key }}
    >
      {isRenaming ? (
        <input
          ref={renameInputRef}
          aria-label="Rename session"
          className={`min-w-0 flex-1 bg-transparent outline-none ${
            renameError ? "text-[var(--destructive)]" : "text-inherit"
          }`}
          disabled={renameSaving}
          onBlur={onRenameBlur}
          onChange={(event) => {
            onRenameChange(event.target.value);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={onRenameKeyDown}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          title={renameError ?? tab.label}
          value={renameValue}
        />
      ) : (
        <TypedTitle className="min-w-0 flex-1 truncate leading-none font-medium" text={tab.label} />
      )}
    </TabChip>
  );
}
