import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { WorkspaceKind, WorkspaceRecord } from "@lifecycle/contracts";
import { cn, SidebarMenuAction, sidebarMenuSubButtonVariants, Spinner } from "@lifecycle/ui";
import { Archive, FolderGit2, GitBranch, type LucideIcon } from "lucide-react";
import { ResponseReadyDot } from "../../../components/response-ready-dot";
import { TypedTitle } from "../../../components/typed-title";
import { formatCompactRelativeTime } from "../../../lib/format";
import { renameWorkspace } from "../api";
import { canInlineRenameWorkspace, getWorkspaceDisplayName } from "../lib/workspace-display";
import { formatWorkspaceError } from "../lib/workspace-errors";
import { getWorkspaceSessionStatusState } from "./workspace-session-status";

const workspaceKindIcons: Record<WorkspaceKind, LucideIcon> = {
  root: FolderGit2,
  managed: GitBranch,
};

function WorkspaceKindIcon({ kind, className }: { kind: WorkspaceKind; className?: string }) {
  const Icon = workspaceKindIcons[kind];
  return <Icon className={className} size={10} strokeWidth={2} />;
}

function WorkspaceTreeLeadingVisual({
  kind,
  selected,
  state,
}: {
  kind: WorkspaceKind;
  selected: boolean;
  state: ReturnType<typeof getWorkspaceSessionStatusState>;
}) {
  if (state === "ready") {
    return <ResponseReadyDot className="mr-0.5 shrink-0" />;
  }

  if (state === "loading") {
    return (
      <span
        aria-label="Generating response"
        className="mr-0.5 flex shrink-0 items-center justify-center"
        role="img"
        title="Generating response"
      >
        <Spinner
          aria-hidden="true"
          aria-label={undefined}
          className={cn(
            "size-3.5",
            selected
              ? "text-[var(--sidebar-foreground)]"
              : "text-[var(--sidebar-muted-foreground)]",
          )}
          role={undefined}
        />
      </span>
    );
  }

  return (
    <WorkspaceKindIcon
      className={cn(
        "mr-0.5 shrink-0",
        selected ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted-foreground)]",
      )}
      kind={kind}
    />
  );
}

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
  const timestamp = formatCompactRelativeTime(workspace.last_active_at);
  const sessionStatusState = getWorkspaceSessionStatusState({ responseReady, running });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurCommitRef = useRef(false);
  const displayName = getWorkspaceDisplayName(workspace);
  const inlineRenameEnabled = canInlineRenameWorkspace(workspace);
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
    if (!inlineRenameEnabled) {
      return;
    }
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
    if (!inlineRenameEnabled) {
      cancelEditing();
      return;
    }

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
      setRenameError(formatWorkspaceError(error, "Workspace rename failed."));
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
    sidebarMenuSubButtonVariants({ active: false }),
    "gap-1.5 rounded-md pl-2 pr-1 text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover)]",
    selected
      ? "bg-[var(--sidebar-selected)] opacity-100"
      : "bg-transparent opacity-80 hover:opacity-100",
    editing ? "cursor-text ring-1 ring-[var(--sidebar-foreground)]/20" : undefined,
  );

  const titleText = renameError ?? workspace.source_ref;
  const trailingMetaClassName = editing
    ? undefined
    : "transition-opacity group-hover/workspace-item:opacity-0";

  if (editing) {
    return (
      <div className={rowClassName} title={titleText}>
        <input
          ref={inputRef}
          aria-label="Rename workspace"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--sidebar-muted-foreground)]",
            renameError ? "text-[var(--destructive)]" : undefined,
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
        {timestamp ? (
          <span
            className={cn(
              "shrink-0 min-w-9 text-right text-[13px] text-[var(--sidebar-foreground)] opacity-70",
              trailingMetaClassName,
            )}
          >
            {timestamp}
          </span>
        ) : null}
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
        <WorkspaceTreeLeadingVisual
          kind={workspace.kind}
          selected={selected}
          state={sessionStatusState}
        />
        <TypedTitle className="flex-1 truncate text-sm" text={displayName} />
        {timestamp ? (
          <span
            className={cn(
              "shrink-0 min-w-9 text-right text-[13px] text-[var(--sidebar-foreground)] opacity-70 transition-opacity group-hover/workspace-item:opacity-0",
            )}
          >
            {timestamp}
          </span>
        ) : null}
      </button>
      <SidebarMenuAction
        aria-label={`Archive workspace ${displayName}`}
        className="right-0 pointer-events-none opacity-0 transition-opacity disabled:opacity-0 group-hover/workspace-item:pointer-events-auto group-hover/workspace-item:opacity-100 group-hover/workspace-item:disabled:opacity-50"
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
