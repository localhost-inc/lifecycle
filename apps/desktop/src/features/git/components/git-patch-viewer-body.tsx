import type { FileDiffMetadata } from "@pierre/diffs/react";
import { PatchDiff } from "@pierre/diffs/react";
import { diffTheme, useTheme } from "@lifecycle/ui";
import { useEffect, useRef } from "react";
import type { GitDiffStyle } from "../lib/diff-style";
import { DiffRenderProvider } from "./diff-render-provider";
import { MultiFileDiffLayout } from "./multi-file-diff-layout";

interface GitPatchViewerBodyProps {
  diffStyle: GitDiffStyle;
  initialFilePath?: string | null;
  initialScrollTop?: number;
  onOpenFile?: (filePath: string) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  parsedFiles: FileDiffMetadata[] | null;
  patch: string;
}

export function GitPatchViewerBody({
  diffStyle,
  initialFilePath,
  initialScrollTop = 0,
  onOpenFile,
  onScrollTopChange,
  parsedFiles,
  patch,
}: GitPatchViewerBodyProps) {
  const { resolvedAppearance, resolvedTheme } = useTheme();
  const patchViewportRef = useRef<HTMLDivElement | null>(null);
  const theme = diffTheme(resolvedTheme);

  useEffect(() => {
    if (patchViewportRef.current) {
      patchViewportRef.current.scrollTop = initialScrollTop;
    }
  }, [initialScrollTop, patch]);

  return (
    <DiffRenderProvider theme={theme}>
      {parsedFiles === null || parsedFiles.length === 0 ? (
        <div
          className="min-h-0 flex-1 overflow-auto pb-24"
          onScroll={(event) => {
            onScrollTopChange?.(event.currentTarget.scrollTop);
          }}
          ref={patchViewportRef}
        >
          <PatchDiff
            patch={patch}
            options={{
              diffStyle,
              disableFileHeader: true,
              theme,
              themeType: resolvedAppearance,
            }}
          />
        </div>
      ) : (
        <MultiFileDiffLayout
          diffStyle={diffStyle}
          files={parsedFiles}
          initialFilePath={initialFilePath}
          initialScrollTop={initialScrollTop}
          onOpenFile={onOpenFile}
          onScrollTopChange={onScrollTopChange}
          theme={theme}
          themeType={resolvedAppearance}
        />
      )}
    </DiffRenderProvider>
  );
}
