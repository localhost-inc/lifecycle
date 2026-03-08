import type React from "react";
import { ChevronRight, SquareArrowOutUpRight } from "lucide-react";
import type { FileDiffMetadata } from "@pierre/diffs/react";

function changeTypeLetter(type: FileDiffMetadata["type"]): string {
  switch (type) {
    case "new":
      return "A";
    case "deleted":
      return "D";
    case "rename-pure":
    case "rename-changed":
      return "R";
    default:
      return "M";
  }
}

function statusCssVar(type: FileDiffMetadata["type"]): string {
  if (type === "new") return "--git-status-added";
  if (type === "deleted") return "--git-status-deleted";
  if (type === "rename-pure" || type === "rename-changed") return "--git-status-renamed";
  return "--git-status-modified";
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
  sticky?: boolean;
}

export function GitFileHeader({
  collapsed,
  fileDiff,
  onOpenFile,
  onToggleCollapse,
  sticky,
}: GitFileHeaderProps) {
  const { additions, deletions } = summarizeChanges(fileDiff);
  const title = fileDiff.name;
  const previousTitle = fileDiff.prevName;
  const dir = dirname(title);
  const file = basename(title);

  return (
    <div
      className={`group/file-header flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left ${sticky ? "sticky top-0 z-10 bg-[var(--panel)] border-b border-[var(--border)]" : collapsed ? "" : "border-b border-[var(--border)]"}`}
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
              className="shrink-0 text-xs font-semibold"
              style={{ color: `var(${statusCssVar(fileDiff.type)})` }}
            >
              {changeTypeLetter(fileDiff.type)}
            </span>
            <span className="truncate font-mono text-xs">
              {dir && <span className="text-[var(--muted-foreground)]">{dir}</span>}
              <span className="text-[var(--foreground)]">{file}</span>
            </span>
            {(additions > 0 || deletions > 0) && (
              <span className="shrink-0 font-mono text-xs flex items-center gap-1.5">
                {additions > 0 && <span className="text-[var(--git-status-added)]">+{additions}</span>}
                {deletions > 0 && <span className="text-[var(--git-status-deleted)]">-{deletions}</span>}
              </span>
            )}
          </div>
          {previousTitle && previousTitle !== title && (
            <p className="mt-1 truncate font-mono text-xs text-[var(--muted-foreground)]">
              from {previousTitle}
            </p>
          )}
        </div>
      </button>
      {onOpenFile && (
        <button
          type="button"
          onClick={onOpenFile}
          className="shrink-0 cursor-pointer text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--foreground)] group-hover/file-header:opacity-100"
          title={`Open ${title}`}
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
