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
  showFloatingReadyDot,
  style,
  tab,
  tabIndex,
  onRenameBlur,
  onRenameChange,
  onRenameKeyDown,
}: WorkspaceSurfaceTabItemProps) {
  const className = `group relative flex h-[34px] max-w-[300px] shrink-0 touch-none select-none items-center justify-start gap-2 whitespace-nowrap rounded-[var(--radius-xl)] px-[14px] text-left text-sm font-medium shadow-none outline-none ring-0 will-change-transform focus-visible:ring-1 focus-visible:ring-[var(--ring)] ${
    active
      ? "bg-[var(--muted)] text-[var(--foreground)]"
      : "bg-transparent text-[var(--muted-foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] hover:text-[var(--foreground)]"
  } ${
    isRenaming
      ? "cursor-text ring-1 ring-[var(--foreground)]/20"
      : isDraggedTab
        ? "pointer-events-none z-20 cursor-grabbing opacity-90 transition-none"
        : "cursor-grab transition-[background-color,border-color,color,opacity,transform] duration-200 ease-out"
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
          className="ml-auto shrink-0 rounded-[8px] p-1 transition hover:bg-[var(--surface-hover)]"
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
