import type { FileDiffMetadata } from "@pierre/diffs/react";
import { PatchDiff } from "@pierre/diffs/react";
import { Alert, AlertDescription, Loading, diffTheme, useTheme } from "@lifecycle/ui";
import { useLocalStorage } from "../../../lib/use-local-storage";
import {
  DEFAULT_GIT_DIFF_STYLE,
  GIT_DIFF_STYLE_STORAGE_KEY,
  isGitDiffStyle,
  type GitDiffStyle,
} from "../lib/diff-style";
import { DiffStyleToggle } from "./diff-style-toggle";
import { DiffRenderProvider } from "./diff-render-provider";
import { MultiFileDiffLayout } from "./multi-file-diff-layout";

interface GitPatchViewerProps {
  emptyMessage?: string;
  error: string | null;
  errorMessagePrefix: string;
  initialFilePath?: string | null;
  isLoading: boolean;
  loadingMessage: string;
  onOpenFile?: (filePath: string) => void;
  parsedFiles: FileDiffMetadata[] | null;
  patch: string;
}

export function GitPatchViewer({
  emptyMessage = "No diff to display.",
  error,
  errorMessagePrefix,
  initialFilePath,
  isLoading,
  loadingMessage,
  onOpenFile,
  parsedFiles,
  patch,
}: GitPatchViewerProps) {
  const { resolvedAppearance, resolvedTheme } = useTheme();
  const [diffStyle, setDiffStyle] = useLocalStorage(GIT_DIFF_STYLE_STORAGE_KEY, {
    defaultValue: DEFAULT_GIT_DIFF_STYLE,
    parse: (rawValue) => rawValue as GitDiffStyle,
    serialize: (value) => value,
    validate: isGitDiffStyle,
  });
  const theme = diffTheme(resolvedTheme);
  const diffControlsDisabled = isLoading || error !== null || patch.length === 0;

  return (
    <>
      <DiffRenderProvider theme={theme}>
        {isLoading && !patch ? (
          <Loading message={loadingMessage} />
        ) : error ? (
          <Alert className="m-5" variant="destructive">
            <AlertDescription>
              {errorMessagePrefix}: {error}
            </AlertDescription>
          </Alert>
        ) : !patch ? (
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            {emptyMessage}
          </div>
        ) : parsedFiles === null || parsedFiles.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-auto pb-24">
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
            onOpenFile={onOpenFile}
            theme={theme}
            themeType={resolvedAppearance}
          />
        )}
      </DiffRenderProvider>
      <DiffStyleToggle
        diffStyle={diffStyle}
        disabled={diffControlsDisabled}
        onChange={setDiffStyle}
      />
    </>
  );
}
