import { useState } from "react";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
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
  themeType: "light" | "dark";
}

export function GitDiffFileBlock({ fileDiff, onOpenFile, themeType }: GitDiffFileBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const openablePath = getOpenableDiffFilePath(fileDiff);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]/70">
      <GitFileHeader
        collapsed={collapsed}
        fileDiff={fileDiff}
        onOpenFile={openablePath && onOpenFile ? () => onOpenFile(openablePath) : null}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />
      {!collapsed && (
        <div className="overflow-auto" style={{ "--diffs-gap-block": "0px" } as React.CSSProperties}>
          <FileDiff
            fileDiff={fileDiff}
            options={{
              disableFileHeader: true,
              themeType,
            }}
          />
        </div>
      )}
    </section>
  );
}
