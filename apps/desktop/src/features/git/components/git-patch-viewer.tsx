import { Alert, AlertDescription, Loading } from "@lifecycle/ui";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { lazy, Suspense } from "react";
import { useLocalStorage } from "@/lib/use-local-storage";
import {
  DEFAULT_GIT_DIFF_STYLE,
  GIT_DIFF_STYLE_STORAGE_KEY,
  isGitDiffStyle,
  type GitDiffStyle,
} from "@/features/git/lib/diff-style";
import { DiffStyleToggle } from "@/features/git/components/diff-style-toggle";

const GitPatchViewerBody = lazy(async () => {
  const module = await import("./git-patch-viewer-body");
  return { default: module.GitPatchViewerBody };
});

interface GitPatchViewerProps {
  emptyMessage?: string;
  error: string | null;
  errorMessagePrefix: string;
  initialFilePath?: string | null;
  initialScrollTop?: number;
  isLoading: boolean;
  loadingMessage: string;
  onOpenFile?: (filePath: string) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  parsedFiles: FileDiffMetadata[] | null;
  patch: string;
}

export function GitPatchViewer({
  emptyMessage = "No diff to display.",
  error,
  errorMessagePrefix,
  initialFilePath,
  initialScrollTop = 0,
  isLoading,
  loadingMessage,
  onOpenFile,
  onScrollTopChange,
  parsedFiles,
  patch,
}: GitPatchViewerProps) {
  const [diffStyle, setDiffStyle] = useLocalStorage(GIT_DIFF_STYLE_STORAGE_KEY, {
    defaultValue: DEFAULT_GIT_DIFF_STYLE,
    parse: (rawValue) => rawValue as GitDiffStyle,
    serialize: (value) => value,
    validate: isGitDiffStyle,
  });
  const parseError =
    patch.length > 0 && parsedFiles === null ? "Unable to parse diff patch." : null;
  const displayError = error ?? parseError;
  const displayErrorPrefix = error !== null ? errorMessagePrefix : "Failed to parse diff";
  const hasRenderableDiff = parsedFiles !== null && parsedFiles.length > 0;
  const diffControlsDisabled = isLoading || displayError !== null || !hasRenderableDiff;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col" data-slot="git-patch-viewer-content">
        {isLoading && !patch ? (
          <Loading className="min-h-0 h-full py-0" delay={0} message={loadingMessage} />
        ) : displayError ? (
          <div className="flex h-full min-h-0 items-center justify-center p-5">
            <Alert className="w-full max-w-2xl" variant="destructive">
              <AlertDescription>
                {displayErrorPrefix}: {displayError}
              </AlertDescription>
            </Alert>
          </div>
        ) : !hasRenderableDiff ? (
          <div className="flex h-full min-h-0 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            {emptyMessage}
          </div>
        ) : (
          <Suspense
            fallback={
              <Loading className="min-h-0 h-full py-0" delay={0} message={loadingMessage} />
            }
          >
            <GitPatchViewerBody
              diffStyle={diffStyle}
              initialFilePath={initialFilePath}
              initialScrollTop={initialScrollTop}
              onOpenFile={onOpenFile}
              onScrollTopChange={onScrollTopChange}
              parsedFiles={parsedFiles}
            />
          </Suspense>
        )}
      </div>
      <DiffStyleToggle
        diffStyle={diffStyle}
        disabled={diffControlsDisabled}
        onChange={setDiffStyle}
      />
    </div>
  );
}
