import { SquareArrowOutUpRight } from "lucide-react";
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

function statusBadgeClasses(type: FileDiffMetadata["type"]): string {
  switch (type) {
    case "new":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "deleted":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    case "rename-pure":
    case "rename-changed":
      return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx + 1);
}

export function summarizeChanges(fileDiff: FileDiffMetadata): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }

  return { additions, deletions };
}

interface GitFileHeaderProps {
  fileDiff: FileDiffMetadata;
  onOpenFile?: (() => void) | null;
  openable: boolean;
}

export function GitFileHeader({ fileDiff, onOpenFile, openable }: GitFileHeaderProps) {
  const { additions, deletions } = summarizeChanges(fileDiff);
  const title = fileDiff.name;
  const previousTitle = fileDiff.prevName;
  const dir = dirname(title);
  const file = basename(title);
  const Container = openable ? "button" : "div";

  return (
    <Container
      {...(openable
        ? {
            onClick: onOpenFile ?? undefined,
            type: "button" as const,
          }
        : {})}
      className={`group/file-header flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left ${
        openable ? "cursor-pointer transition hover:bg-[var(--surface-hover)]" : ""
      }`}
      title={openable ? `Open ${title}` : title}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${statusBadgeClasses(fileDiff.type)}`}
          >
            {changeTypeLabel(fileDiff.type)}
          </span>
          <span className="truncate font-mono text-sm">
            {dir && (
              <span className="text-[var(--muted-foreground)]">{dir}</span>
            )}
            <span className="text-[var(--foreground)]">{file}</span>
          </span>
        </div>
        {previousTitle && previousTitle !== title && (
          <p className="mt-1 truncate font-mono text-xs text-[var(--muted-foreground)]">
            from {previousTitle}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
        {additions > 0 && <span className="text-emerald-400">+{additions}</span>}
        {deletions > 0 && <span className="text-red-400">-{deletions}</span>}
        {openable && (
          <SquareArrowOutUpRight className="h-3.5 w-3.5 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover/file-header:opacity-100" />
        )}
      </div>
    </Container>
  );
}
