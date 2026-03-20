import { memo, useCallback, useEffect, useRef } from "react";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { GitFileHeader } from "@/features/git/components/git-file-header";
import { getOpenableDiffFilePath, withCopyableGitDiffOptions } from "@/features/git/components/git-diff-rendering";
import type { GitDiffStyle } from "@/features/git/lib/diff-style";
import { estimateDiffBodyHeight } from "@/features/git/lib/diff-virtualization";

interface DiffFileSectionProps {
  collapsed: boolean;
  diffStyle: GitDiffStyle;
  fileDiff: FileDiffMetadata;
  onHeightChange?: ((path: string, height: number) => void) | null;
  onOpenFile?: ((filePath: string) => void) | null;
  onToggleCollapse: (path: string) => void;
  theme: string;
  themeType: "light" | "dark";
}

function DiffFileSectionComponent({
  collapsed,
  diffStyle,
  fileDiff,
  onHeightChange,
  onOpenFile,
  onToggleCollapse,
  theme,
  themeType,
}: DiffFileSectionProps) {
  const openablePath = getOpenableDiffFilePath(fileDiff);
  const sectionRef = useRef<HTMLElement | null>(null);

  const handleToggleCollapse = useCallback(() => {
    onToggleCollapse(fileDiff.name);
  }, [fileDiff.name, onToggleCollapse]);

  useEffect(() => {
    if (!onHeightChange) {
      return;
    }

    const section = sectionRef.current;
    if (!section) {
      return;
    }

    const reportHeight = () => {
      const nextHeight = Math.round(section.getBoundingClientRect().height);
      if (nextHeight > 0) {
        onHeightChange(fileDiff.name, nextHeight);
      }
    };

    reportHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      reportHeight();
    });

    observer.observe(section);
    return () => observer.disconnect();
  }, [collapsed, fileDiff.name, onHeightChange]);

  return (
    <section ref={sectionRef} data-file-path={fileDiff.name}>
      <GitFileHeader
        collapsed={collapsed}
        fileDiff={fileDiff}
        onOpenFile={openablePath && onOpenFile ? () => onOpenFile(openablePath) : null}
        onToggleCollapse={handleToggleCollapse}
        sticky
      />
      {!collapsed && (
        <div
          className="overflow-x-auto overflow-y-hidden"
          style={
            {
              containIntrinsicSize: `${estimateDiffBodyHeight(fileDiff)}px`,
              contentVisibility: "auto",
            } as React.CSSProperties
          }
        >
          <FileDiff
            fileDiff={fileDiff}
            options={withCopyableGitDiffOptions({
              disableFileHeader: true,
              diffStyle,
              theme,
              themeType,
            })}
          />
        </div>
      )}
    </section>
  );
}

export const DiffFileSection = memo(DiffFileSectionComponent);
DiffFileSection.displayName = "DiffFileSection";
