import { useState } from "react";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { GitFileHeader } from "@/features/git/components/git-file-header";
import {
  getOpenableDiffFilePath,
  withCopyableGitDiffOptions,
} from "@/features/git/components/git-diff-rendering";

interface GitDiffFileBlockProps {
  fileDiff: FileDiffMetadata;
  onOpenFile?: ((filePath: string) => void) | null;
  themeType: "light" | "dark";
}

export function GitDiffFileBlock({ fileDiff, onOpenFile, themeType }: GitDiffFileBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const openablePath = getOpenableDiffFilePath(fileDiff);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-transparent">
      <GitFileHeader
        collapsed={collapsed}
        fileDiff={fileDiff}
        onOpenFile={openablePath && onOpenFile ? () => onOpenFile(openablePath) : null}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />
      {!collapsed && (
        <div
          className="overflow-auto"
          style={{ "--diffs-gap-block": "0px" } as React.CSSProperties}
        >
          <FileDiff
            fileDiff={fileDiff}
            options={withCopyableGitDiffOptions({
              disableFileHeader: true,
              themeType,
            })}
          />
        </div>
      )}
    </section>
  );
}
