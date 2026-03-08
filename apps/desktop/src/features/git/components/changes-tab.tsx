import type {
  GitDiffScope,
  GitFileChangeKind,
  GitFileStatus,
  GitStatusResult,
} from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { GitBranch } from "lucide-react";
import { useState } from "react";
import { stageGitFiles, unstageGitFiles } from "../api";

interface ChangesTabProps {
  error: unknown;
  gitStatus: GitStatusResult | null;
  isLoading: boolean;
  onOpenDiff: (filePath: string, scope: GitDiffScope) => void;
  refresh: () => Promise<void>;
  workspaceId: string;
}

function basename(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] ?? filePath;
}

function dirname(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx > 0 ? filePath.slice(0, idx + 1) : "";
}

function statusLetter(kind: GitFileChangeKind | null): string {
  switch (kind) {
    case "modified":
      return "M";
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "unmerged":
      return "U";
    case "untracked":
      return "?";
    case "ignored":
      return "!";
    case "type_changed":
      return "T";
    default:
      return " ";
  }
}

function statusTextColor(kind: GitFileChangeKind | null): string {
  switch (kind) {
    case "added":
      return "text-emerald-400";
    case "deleted":
    case "unmerged":
      return "text-red-400";
    case "renamed":
    case "copied":
      return "text-blue-400";
    case "modified":
    case "type_changed":
      return "text-amber-400";
    default:
      return "text-[var(--muted-foreground)]";
  }
}

function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
  actionLabel,
  onAction,
  disabled,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-1 py-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
      >
        <span className="text-[9px]">{collapsed ? "▸" : "▾"}</span>
        {label}
        <span className="tabular-nums">({count})</span>
      </button>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-60"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function FileRow({
  file,
  scope,
  statusKind,
  mutating,
  disabled,
  onOpen,
  onToggle,
}: {
  file: GitFileStatus;
  scope: GitDiffScope;
  statusKind: GitFileChangeKind | null;
  mutating: boolean;
  disabled: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const dir = dirname(file.path);
  const name = basename(file.path);
  const letter = statusLetter(statusKind);
  const color = statusTextColor(statusKind);
  const ins = file.stats.insertions;
  const del = file.stats.deletions;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex h-7 cursor-pointer items-center gap-2 rounded px-2 transition hover:bg-[var(--surface-hover)]"
      title={file.path}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-1">
        <span className="shrink-0 text-sm font-medium text-[var(--foreground)]">{name}</span>
        {dir && <span className="truncate text-[13px] text-[var(--muted-foreground)]">{dir}</span>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {ins !== null && ins > 0 && (
          <span className="font-mono text-xs text-[var(--muted-foreground)]">+{ins}</span>
        )}
        {del !== null && del > 0 && (
          <span className="font-mono text-xs text-[var(--muted-foreground)]">-{del}</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={disabled}
          className={`w-4 text-center font-mono text-[12px] font-semibold transition hover:brightness-125 disabled:cursor-wait disabled:opacity-60 ${color}`}
          title={scope === "working" ? "Stage file" : "Unstage file"}
        >
          {mutating ? "…" : letter}
        </button>
      </div>
    </div>
  );
}

export function ChangesTab({
  error,
  gitStatus,
  isLoading,
  onOpenDiff,
  refresh,
  workspaceId,
}: ChangesTabProps) {
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [unstagedCollapsed, setUnstagedCollapsed] = useState(false);

  const files = gitStatus?.files ?? [];
  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => f.unstaged);

  const runMutation = async (key: string, action: () => Promise<void>) => {
    setMutatingKey(key);
    try {
      await action();
      await refresh();
    } finally {
      setMutatingKey(null);
    }
  };

  const handleStageFile = (file: GitFileStatus) => {
    void runMutation(`stage:${file.path}`, () => stageGitFiles(workspaceId, [file.path]));
  };

  const handleUnstageFile = (file: GitFileStatus) => {
    void runMutation(`unstage:${file.path}`, () => unstageGitFiles(workspaceId, [file.path]));
  };

  const handleStageAll = () => {
    const paths = unstagedFiles.map((f) => f.path);
    void runMutation("stage:all", () => stageGitFiles(workspaceId, paths));
  };

  const handleUnstageAll = () => {
    const paths = stagedFiles.map((f) => f.path);
    void runMutation("unstage:all", () => unstageGitFiles(workspaceId, paths));
  };

  if (isLoading && !gitStatus) {
    return <p className="text-xs text-[var(--muted-foreground)]">Loading changes...</p>;
  }

  if (error) {
    return <p className="text-xs text-red-400">Failed to load changes: {String(error)}</p>;
  }

  if (files.length === 0) {
    return (
      <EmptyState
        description="New edits will appear here."
        icon={<GitBranch />}
        size="sm"
        title="Working tree clean"
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {stagedFiles.length > 0 && (
        <div>
          <SectionHeader
            label="Staged Changes"
            count={stagedFiles.length}
            collapsed={stagedCollapsed}
            onToggle={() => setStagedCollapsed((v) => !v)}
            actionLabel="Unstage All"
            onAction={handleUnstageAll}
            disabled={mutatingKey !== null}
          />
          {!stagedCollapsed && (
            <div className="flex flex-col">
              {stagedFiles.map((file) => (
                <FileRow
                  key={`staged:${file.path}`}
                  file={file}
                  scope="staged"
                  statusKind={file.indexStatus}
                  mutating={mutatingKey === `unstage:${file.path}`}
                  disabled={mutatingKey !== null}
                  onOpen={() => onOpenDiff(file.path, "staged")}
                  onToggle={() => handleUnstageFile(file)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {unstagedFiles.length > 0 && (
        <div>
          <SectionHeader
            label="Changes"
            count={unstagedFiles.length}
            collapsed={unstagedCollapsed}
            onToggle={() => setUnstagedCollapsed((v) => !v)}
            actionLabel="Stage All"
            onAction={handleStageAll}
            disabled={mutatingKey !== null}
          />
          {!unstagedCollapsed && (
            <div className="flex flex-col">
              {unstagedFiles.map((file) => (
                <FileRow
                  key={`unstaged:${file.path}`}
                  file={file}
                  scope="working"
                  statusKind={file.worktreeStatus}
                  mutating={mutatingKey === `stage:${file.path}`}
                  disabled={mutatingKey !== null}
                  onOpen={() => onOpenDiff(file.path, "working")}
                  onToggle={() => handleStageFile(file)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
