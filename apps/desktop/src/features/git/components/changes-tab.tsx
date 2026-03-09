import type { GitFileChangeKind, GitFileStatus, GitStatusResult } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import {
  File,
  FileCode,
  FileJson,
  FileText,
  GitBranch,
  Image as ImageIcon,
} from "lucide-react";
import type React from "react";

interface ChangesTabProps {
  error: unknown;
  gitStatus: GitStatusResult | null;
  isLoading: boolean;
  onOpenDiff: (filePath: string) => void;
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

function resolveDisplayStatus(file: GitFileStatus): GitFileChangeKind | null {
  return file.worktreeStatus ?? file.indexStatus;
}

function FileRow({
  file,
  statusKind,
  onOpen,
}: {
  file: GitFileStatus;
  statusKind: GitFileChangeKind | null;
  onOpen: () => void;
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

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {ins !== null && ins > 0 && (
          <span className="font-mono text-xs text-[var(--git-status-added)]">+{ins}</span>
        )}
        {del !== null && del > 0 && (
          <span className="font-mono text-xs text-[var(--git-status-deleted)]">-{del}</span>
        )}
      </div>
    </div>
  );
}

export function ChangesTab({
  error,
  gitStatus,
  isLoading,
  onOpenDiff,
}: ChangesTabProps) {
  const files = gitStatus?.files ?? [];

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
    <div className="flex flex-col gap-0.5">
      {files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          statusKind={resolveDisplayStatus(file)}
          onOpen={() => onOpenDiff(file.path)}
        />
      ))}
    </div>
  );
}
