import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { WorkspaceRecord, WorkspaceStatus } from "@lifecycle/contracts";
import {
  cn,
  SidebarMenuAction,
  sidebarMenuSubButtonVariants,
  Spinner,
  StatusDot,
  type StatusDotTone,
} from "@lifecycle/ui";
import { Archive } from "lucide-react";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { TypedTitle } from "../../../components/typed-title";
import { formatCompactRelativeTime } from "../../../lib/format";
import { renameWorkspace } from "../api";

const dotTone: Record<WorkspaceStatus, StatusDotTone> = {
  idle: "neutral",
  starting: "info",
  active: "success",
  stopping: "warning",
};

const dotPulse: Record<WorkspaceStatus, boolean> = {
  idle: false,
  starting: true,
  active: false,
  stopping: true,
};

const dotClassName: Partial<Record<WorkspaceStatus, string>> = {
  idle: "bg-zinc-400",
};

const dotLabels: Record<WorkspaceStatus, string> = {
  idle: "Idle",
  starting: "Starting",
  active: "Active",
  stopping: "Stopping",
};

interface WorkspaceTreeItemProps {
  running?: boolean;
  responseReady?: boolean;
  workspace: WorkspaceRecord;
  selected: boolean;
  onSelect: () => void;
  onDestroy: () => void;
  destroyDisabled?: boolean;
}

export function WorkspaceTreeItem({
  running = false,
  responseReady = false,
  workspace,
  selected,
  onSelect,
  onDestroy,
  destroyDisabled = false,
}: WorkspaceTreeItemProps) {
  const status = workspace.status as WorkspaceStatus;
  const timestamp = formatCompactRelativeTime(workspace.last_active_at);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurCommitRef = useRef(false);
  const [draftName, setDraftName] = useState(workspace.name);
  const [editing, setEditing] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraftName(workspace.name);
      setRenameError(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [editing, workspace.name]);

  const startEditing = () => {
    skipBlurCommitRef.current = false;
    setDraftName(workspace.name);
    setRenameError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraftName(workspace.name);
    setRenameError(null);
    setSaving(false);
    setEditing(false);
  };

  const commitRename = async () => {
    if (saving) {
      return;
    }

    const normalizedName = draftName.trim().replace(/\s+/g, " ");
    if (normalizedName.length === 0) {
      setRenameError("Workspace name cannot be empty.");
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    if (normalizedName === workspace.name) {
      cancelEditing();
      return;
    }

    setSaving(true);
    setRenameError(null);

    try {
      await renameWorkspace(workspace.id, normalizedName);
      setEditing(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Workspace rename failed.");
      inputRef.current?.focus();
      inputRef.current?.select();
    } finally {
      setSaving(false);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitRename();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommitRef.current = true;
      cancelEditing();
    }
  };

  const rowClassName = cn(
    sidebarMenuSubButtonVariants({ active: selected }),
    "relative gap-1.5 pl-[16px] pr-2",
    editing ? "cursor-text ring-1 ring-[var(--sidebar-foreground)]/20" : undefined,
  );

  const titleText = renameError ?? workspace.source_ref;

  if (editing) {
    return (
      <div className={rowClassName} title={titleText}>
        {responseReady && <ResponseReadyDot className="absolute left-1 top-1/2 -translate-y-1/2" />}
        <StatusDot
          className={dotClassName[status]}
          pulse={dotPulse[status]}
          size="sm"
          title={dotLabels[status]}
          tone={dotTone[status]}
        />
        {running ? (
          <Spinner
            aria-hidden="true"
            aria-label={undefined}
            className="size-3.5 shrink-0 text-[var(--sidebar-muted-foreground)]"
            role={undefined}
          />
        ) : null}
        <input
          ref={inputRef}
          aria-label="Rename workspace"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--sidebar-muted-foreground)]",
            renameError ? "text-rose-300" : undefined,
          )}
          disabled={saving}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            void commitRename();
          }}
          onChange={(event) => {
            setDraftName(event.target.value);
            if (renameError) {
              setRenameError(null);
            }
          }}
          onKeyDown={handleInputKeyDown}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          value={draftName}
        />
        {timestamp && (
          <span className="shrink-0 text-[13px] text-[var(--sidebar-foreground)] opacity-70">
            {timestamp}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="group/workspace-item relative">
      <button
        className={rowClassName}
        onClick={onSelect}
        onDoubleClick={(event) => {
          event.preventDefault();
          startEditing();
        }}
        title={titleText}
        type="button"
      >
        {responseReady && <ResponseReadyDot className="absolute left-1 top-1/2 -translate-y-1/2" />}
        <StatusDot
          className={dotClassName[status]}
          pulse={dotPulse[status]}
          size="sm"
          title={dotLabels[status]}
          tone={dotTone[status]}
        />
        {running ? (
          <Spinner
            aria-hidden="true"
            aria-label={undefined}
            className="size-3.5 shrink-0 text-[var(--sidebar-muted-foreground)]"
            role={undefined}
          />
        ) : null}
        <TypedTitle className="flex-1 truncate text-[13px]" text={workspace.name} />
        {timestamp && (
          <span
            className={`shrink-0 text-[13px] transition-opacity group-hover/workspace-item:opacity-0 ${
              selected
                ? "text-[var(--sidebar-foreground)] opacity-70"
                : "text-[var(--sidebar-muted-foreground)]"
            }`}
          >
            {timestamp}
          </span>
        )}
      </button>
      <SidebarMenuAction
        aria-label={`Archive workspace ${workspace.name}`}
        className="pointer-events-none opacity-0 transition-opacity disabled:opacity-0 group-hover/workspace-item:pointer-events-auto group-hover/workspace-item:opacity-100 group-hover/workspace-item:disabled:opacity-50"
        disabled={destroyDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onDestroy();
        }}
        title="Archive workspace"
      >
        <Archive size={14} strokeWidth={2} />
      </SidebarMenuAction>
    </div>
  );
}
