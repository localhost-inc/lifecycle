import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { TabChip } from "../../../components/tab-chip";
import { TypedTitle } from "../../../components/typed-title";
import { tabTitle, type WorkspaceSurfaceTab } from "./workspace-surface-tabs";
import { workspaceTabDomId, workspaceTabPanelId } from "./workspace-surface-ids";

interface WorkspaceSurfaceTabItemProps {
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
  showFloatingReadyDot: boolean;
  style?: CSSProperties;
  tab: WorkspaceSurfaceTab;
  tabIndex: number;
  onRenameBlur: () => void;
  onRenameChange: (value: string) => void;
  onRenameKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}

export function WorkspaceSurfaceTabItem({
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
  showFloatingReadyDot,
  style,
  tab,
  tabIndex,
  onRenameBlur,
  onRenameChange,
  onRenameKeyDown,
}: WorkspaceSurfaceTabItemProps) {
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
      className={`max-w-[300px] touch-none select-none ${dragDropClasses}`}
      closable={!isRenaming}
      id={workspaceTabDomId(tab.key)}
      indicator={
        showFloatingReadyDot ? (
          <ResponseReadyDot className="pointer-events-none absolute right-3 top-1.5" />
        ) : undefined
      }
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
      ariaControls={isRenaming ? undefined : workspaceTabPanelId(tab.key)}
      ariaSelected={isRenaming ? undefined : active}
      role={isRenaming ? undefined : "tab"}
      dataAttributes={{ "workspace-tab-key": tab.key }}
    >
      {isRenaming ? (
        <input
          ref={renameInputRef}
          aria-label="Rename session"
          className={`min-w-0 flex-1 bg-transparent outline-none ${
            renameError ? "text-rose-300" : "text-inherit"
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
        <TypedTitle
          className={`min-w-0 flex-1 truncate leading-none ${active ? "font-semibold" : "font-medium"}`}
          text={tab.label}
        />
      )}
    </TabChip>
  );
}
