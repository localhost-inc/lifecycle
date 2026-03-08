import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { TypedTitle } from "../../../components/typed-title";
import {
  tabTitle,
  workspaceTabDomId,
  workspaceTabPanelId,
  type WorkspaceSurfaceTab,
} from "./workspace-surface-logic";

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
  showLeadingSeparator: boolean;
  showFloatingReadyDot: boolean;
  style?: { transform: string };
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
  showLeadingSeparator,
  showFloatingReadyDot,
  style,
  tab,
  tabIndex,
  onRenameBlur,
  onRenameChange,
  onRenameKeyDown,
}: WorkspaceSurfaceTabItemProps) {
  const className = `group relative flex max-w-[300px] shrink-0 touch-none select-none items-center gap-1.5 rounded-[18px] px-4 py-1.5 text-left text-sm font-medium will-change-transform ${
    active
      ? "bg-[var(--surface-selected)] text-[var(--foreground)]"
      : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
  } ${
    isRenaming
      ? "cursor-text ring-1 ring-[var(--foreground)]/20"
      : isDraggedTab
        ? "pointer-events-none z-20 cursor-grabbing opacity-90 shadow-[var(--tab-shadow-drag)] transition-none"
        : "cursor-grab transition-[background-color,color,box-shadow,opacity,transform] duration-200 ease-out"
  } ${isDropTarget ? "ring-1 ring-[var(--foreground)]/35" : ""}`;

  return (
    <div
      ref={refCallback}
      id={workspaceTabDomId(tab.key)}
      aria-controls={isRenaming ? undefined : workspaceTabPanelId(tab.key)}
      aria-selected={isRenaming ? undefined : active}
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role={isRenaming ? undefined : "tab"}
      style={style}
      tabIndex={tabIndex}
      title={tabTitle(tab)}
    >
      {showLeadingSeparator ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[-1px] top-1/2 h-5 w-px -translate-y-1/2 bg-[var(--border)]/70"
          data-slot="workspace-tab-separator"
        />
      ) : null}
      {showFloatingReadyDot ? (
        <ResponseReadyDot className="pointer-events-none absolute right-3 top-1.5" />
      ) : null}
      {leading}
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
        <TypedTitle className="min-w-0 flex-1 truncate" text={tab.label} />
      )}
      {!isRenaming ? (
        <button
          type="button"
          aria-label={`Close ${tab.label}`}
          data-tab-action="close"
          className={`ml-auto shrink-0 rounded-full p-1 transition hover:bg-[var(--background)]/70 ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
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
      ) : null}
    </div>
  );
}
