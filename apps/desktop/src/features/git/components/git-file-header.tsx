import type React from "react";
import { ChevronRight, SquareArrowOutUpRight } from "lucide-react";
import type { FileDiffMetadata } from "@pierre/diffs/react";

function changeTypeLabel(type: FileDiffMetadata["type"]): string {
  switch (type) {
    case "new":
      return "Added";
    case "deleted":
      return "Deleted";
    case "rename-pure":
      return "Renamed";
    case "rename-changed":
      return "Renamed";
    default:
      return "Modified";
  }
}

function statusBadgeStyle(type: FileDiffMetadata["type"]): React.CSSProperties {
  const v =
    type === "new"
      ? "--git-status-added"
      : type === "deleted"
        ? "--git-status-deleted"
        : type === "rename-pure" || type === "rename-changed"
          ? "--git-status-renamed"
          : "--git-status-modified";
  return {
    color: `var(${v})`,
    borderColor: `color-mix(in srgb, var(${v}) 25%, transparent)`,
    backgroundColor: `color-mix(in srgb, var(${v}) 8%, transparent)`,
  };
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx + 1);
}

export function summarizeChanges(fileDiff: FileDiffMetadata): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;

  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }

  return { additions, deletions };
}

interface GitFileHeaderProps {
  collapsed: boolean;
  fileDiff: FileDiffMetadata;
  onOpenFile?: (() => void) | null;
  onToggleCollapse: () => void;
}

export function GitFileHeader({
  collapsed,
  fileDiff,
  onOpenFile,
  onToggleCollapse,
}: GitFileHeaderProps) {
  const { additions, deletions } = summarizeChanges(fileDiff);
  const title = fileDiff.name;
  const previousTitle = fileDiff.prevName;
  const dir = dirname(title);
  const file = basename(title);

  return (
    <div
      className={`group/file-header flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left ${collapsed ? "border-b-transparent" : ""}`}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 transition hover:opacity-80"
        title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform ${collapsed ? "" : "rotate-90"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]"
              style={statusBadgeStyle(fileDiff.type)}
            >
              {changeTypeLabel(fileDiff.type)}
            </span>
            <span className="truncate font-mono text-sm">
              {dir && <span className="text-[var(--muted-foreground)]">{dir}</span>}
              <span className="text-[var(--foreground)]">{file}</span>
            </span>
          </div>
          {previousTitle && previousTitle !== title && (
            <p className="mt-1 truncate font-mono text-xs text-[var(--muted-foreground)]">
              from {previousTitle}
            </p>
          )}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
        {additions > 0 && <span className="text-[var(--git-status-added)]">+{additions}</span>}
        {deletions > 0 && <span className="text-[var(--git-status-deleted)]">-{deletions}</span>}
        {onOpenFile && (
          <button
            type="button"
            onClick={onOpenFile}
            className="ml-1 cursor-pointer text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--foreground)] group-hover/file-header:opacity-100"
            title={`Open ${title}`}
          >
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
