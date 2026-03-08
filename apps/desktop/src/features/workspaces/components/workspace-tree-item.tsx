import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { WorkspaceStatus } from "@lifecycle/contracts";
import { cn, sidebarMenuSubButtonVariants, StatusDot, type StatusDotTone } from "@lifecycle/ui";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { TypedTitle } from "../../../components/typed-title";
import { formatCompactRelativeTime } from "../../../lib/format";
import { renameWorkspace, type WorkspaceRow } from "../api";

const dotTone: Record<WorkspaceStatus, StatusDotTone> = {
  creating: "warning",
  starting: "info",
  ready: "success",
  resetting: "warning",
  sleeping: "neutral",
  destroying: "danger",
  failed: "danger",
};

const dotPulse: Record<WorkspaceStatus, boolean> = {
  creating: true,
  starting: true,
  ready: false,
  resetting: true,
  sleeping: false,
  destroying: true,
  failed: false,
};

const dotClassName: Partial<Record<WorkspaceStatus, string>> = {
  sleeping: "bg-zinc-400",
};

const dotLabels: Record<WorkspaceStatus, string> = {
  creating: "Creating",
  starting: "Starting",
  ready: "Ready",
  resetting: "Resetting",
  sleeping: "Sleeping",
  destroying: "Destroying",
  failed: "Failed",
};

interface WorkspaceTreeItemProps {
  responseReady?: boolean;
  workspace: WorkspaceRow;
  selected: boolean;
  onSelect: () => void;
}

export function WorkspaceTreeItem({
  responseReady = false,
  workspace,
  selected,
  onSelect,
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
      <TypedTitle className="flex-1 truncate text-[13px]" text={workspace.name} />
      {timestamp && (
        <span
          className={`shrink-0 text-[13px] ${
            selected
              ? "text-[var(--sidebar-foreground)] opacity-70"
              : "text-[var(--sidebar-muted-foreground)]"
          }`}
        >
          {timestamp}
        </span>
      )}
    </button>
  );
}
