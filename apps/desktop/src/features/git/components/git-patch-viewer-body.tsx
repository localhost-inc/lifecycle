import type { FileDiffMetadata } from "@pierre/diffs/react";
import { diffTheme } from "@lifecycle/ui";
import { useSettings } from "@/features/settings/state/settings-provider";
import type { GitDiffStyle } from "@/features/git/lib/diff-style";
import { DiffRenderProvider } from "@/features/git/components/diff-render-provider";
import { MultiFileDiffLayout } from "@/features/git/components/multi-file-diff-layout";

interface GitPatchViewerBodyProps {
  diffStyle: GitDiffStyle;
  initialFilePath?: string | null;
  initialScrollTop?: number;
  onOpenFile?: (filePath: string) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  parsedFiles: FileDiffMetadata[];
}

export function GitPatchViewerBody({
  diffStyle,
  initialFilePath,
  initialScrollTop = 0,
  onOpenFile,
  onScrollTopChange,
  parsedFiles,
}: GitPatchViewerBodyProps) {
  const { resolvedAppearance, resolvedTheme } = useSettings();
  const theme = diffTheme(resolvedTheme);

  return (
    <DiffRenderProvider theme={theme}>
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
    </DiffRenderProvider>
  );
}
