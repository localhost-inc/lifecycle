import type { GitFileChangeKind, GitFileStatus, GitStatusResult } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import {
  ChevronRight,
  File,
  FileCode,
  FileJson,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Minus,
  Plus,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { stageGitFiles, unstageGitFiles } from "../api";

interface ChangesTabProps {
  error: unknown;
  gitStatus: GitStatusResult | null;
  isLoading: boolean;
  onOpenDiff: (filePath: string) => void;
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

function statusCssVar(kind: GitFileChangeKind | null): string {
  switch (kind) {
    case "added":
    case "untracked":
      return "--git-status-added";
    case "deleted":
    case "unmerged":
      return "--git-status-deleted";
    case "renamed":
    case "copied":
      return "--git-status-renamed";
    case "modified":
    case "type_changed":
      return "--git-status-modified";
    default:
      return "--muted-foreground";
  }
}

function fileIconFor(filePath: string): React.ComponentType<{ className?: string }> {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return File;
  const ext = filePath.slice(dot).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".rs":
    case ".py":
    case ".go":
    case ".rb":
    case ".java":
    case ".c":
    case ".cpp":
    case ".h":
    case ".css":
    case ".scss":
    case ".html":
    case ".vue":
    case ".svelte":
      return FileCode;
    case ".json":
    case ".yaml":
    case ".yml":
    case ".toml":
      return FileJson;
    case ".md":
    case ".mdx":
    case ".txt":
    case ".rst":
      return FileText;
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".svg":
    case ".webp":
    case ".ico":
      return ImageIcon;
    default:
      return File;
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
    <div className="flex items-center justify-between px-1 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
        />
        {label}
        <span className="font-normal tabular-nums">{count}</span>
      </button>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="rounded-sm px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-60"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function ActionRow({
  actionLabel,
  onAction,
  disabled,
}: {
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end px-1 pb-1">
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="rounded-sm px-1.5 py-0.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-wait disabled:opacity-60"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function FileRow({
  file,
  toggleMode,
  statusKind,
  mutating,
  disabled,
  onOpen,
  onToggle,
}: {
  file: GitFileStatus;
  toggleMode: "stage" | "unstage";
  statusKind: GitFileChangeKind | null;
  mutating: boolean;
  disabled: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const dir = dirname(file.path);
  const name = basename(file.path);
  const ins = file.stats.insertions;
  const del = file.stats.deletions;
  const Icon = fileIconFor(file.path);
  const cssVar = statusCssVar(statusKind);

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
      className="group/row flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      title={file.path}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        style={{ color: `var(${cssVar})` }}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="flex min-w-0 flex-1 items-baseline gap-1">
        <span className="shrink-0 text-sm font-medium text-[var(--foreground)]">{name}</span>
        {dir && (
          <span className="truncate text-sm text-[var(--muted-foreground)] opacity-60">
            {dir}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {ins !== null && ins > 0 && (
          <span className="font-mono text-xs text-[var(--git-status-added)]">+{ins}</span>
        )}
        {del !== null && del > 0 && (
          <span className="font-mono text-xs text-[var(--git-status-deleted)]">-{del}</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={disabled}
          className={`flex h-5 w-5 items-center justify-center rounded-sm text-[var(--muted-foreground)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:cursor-wait ${mutating ? "" : "opacity-0 group-hover/row:opacity-100"}`}
          title={toggleMode === "stage" ? "Stage file" : "Unstage file"}
        >
          {mutating ? (
            <span className="text-xs">&hellip;</span>
          ) : toggleMode === "stage" ? (
            <Plus className="h-3.5 w-3.5" />
          ) : (
            <Minus className="h-3.5 w-3.5" />
          )}
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
  const hasBothSections = stagedFiles.length > 0 && unstagedFiles.length > 0;

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
    <div className="flex flex-col gap-3">
      {stagedFiles.length > 0 && (
        <div>
          {hasBothSections ? (
            <SectionHeader
              label="Staged Changes"
              count={stagedFiles.length}
              collapsed={stagedCollapsed}
              onToggle={() => setStagedCollapsed((v) => !v)}
              actionLabel="Unstage All"
              onAction={handleUnstageAll}
              disabled={mutatingKey !== null}
            />
          ) : (
            <ActionRow
              actionLabel="Unstage All"
              onAction={handleUnstageAll}
              disabled={mutatingKey !== null}
            />
          )}
          {(!hasBothSections || !stagedCollapsed) && (
            <div className="flex flex-col gap-0.5">
              {stagedFiles.map((file) => (
                <FileRow
                  key={`staged:${file.path}`}
                  file={file}
                  statusKind={file.indexStatus}
                  toggleMode="unstage"
                  mutating={mutatingKey === `unstage:${file.path}`}
                  disabled={mutatingKey !== null}
                  onOpen={() => onOpenDiff(file.path)}
                  onToggle={() => handleUnstageFile(file)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {unstagedFiles.length > 0 && (
        <div>
          {hasBothSections ? (
            <SectionHeader
              label="Changes"
              count={unstagedFiles.length}
              collapsed={unstagedCollapsed}
              onToggle={() => setUnstagedCollapsed((v) => !v)}
              actionLabel="Stage All"
              onAction={handleStageAll}
              disabled={mutatingKey !== null}
            />
          ) : (
            <ActionRow
              actionLabel="Stage All"
              onAction={handleStageAll}
              disabled={mutatingKey !== null}
            />
          )}
          {(!hasBothSections || !unstagedCollapsed) && (
            <div className="flex flex-col gap-0.5">
              {unstagedFiles.map((file) => (
                <FileRow
                  key={`unstaged:${file.path}`}
                  file={file}
                  statusKind={file.worktreeStatus}
                  toggleMode="stage"
                  mutating={mutatingKey === `stage:${file.path}`}
                  disabled={mutatingKey !== null}
                  onOpen={() => onOpenDiff(file.path)}
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
