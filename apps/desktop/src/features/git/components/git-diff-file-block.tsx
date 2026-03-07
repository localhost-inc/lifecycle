import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import type { ThemeResolvedAppearance } from "@lifecycle/ui";
import { GitFileHeader } from "./git-file-header";

export function getOpenableDiffFilePath(fileDiff: FileDiffMetadata): string | null {
  if (fileDiff.type === "deleted") {
    return null;
  }

  return fileDiff.name;
}

interface GitDiffFileBlockProps {
  fileDiff: FileDiffMetadata;
  onOpenFile?: ((filePath: string) => void) | null;
  themeType: ThemeResolvedAppearance;
}

export function GitDiffFileBlock({
  fileDiff,
  onOpenFile,
  themeType,
}: GitDiffFileBlockProps) {
  const openablePath = getOpenableDiffFilePath(fileDiff);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]/70">
      <GitFileHeader
        fileDiff={fileDiff}
        onOpenFile={openablePath && onOpenFile ? () => onOpenFile(openablePath) : null}
        openable={Boolean(openablePath && onOpenFile)}
      />
      <div className="overflow-auto px-2 py-2">
        <FileDiff
          fileDiff={fileDiff}
          options={{
            disableFileHeader: true,
            themeType,
          }}
        />
      </div>
    </section>
  );
}
