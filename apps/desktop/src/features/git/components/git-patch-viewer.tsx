import { Alert, AlertDescription, Loading } from "@lifecycle/ui";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import { lazy, Suspense } from "react";
import { useLocalStorage } from "../../../lib/use-local-storage";
import {
  DEFAULT_GIT_DIFF_STYLE,
  GIT_DIFF_STYLE_STORAGE_KEY,
  isGitDiffStyle,
  type GitDiffStyle,
} from "../lib/diff-style";
import { DiffStyleToggle } from "./diff-style-toggle";

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
  const diffControlsDisabled = isLoading || error !== null || patch.length === 0;

  return (
    <>
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
      ) : (
        <Suspense fallback={<Loading message={loadingMessage} />}>
          <GitPatchViewerBody
            diffStyle={diffStyle}
            initialFilePath={initialFilePath}
            initialScrollTop={initialScrollTop}
            onOpenFile={onOpenFile}
            onScrollTopChange={onScrollTopChange}
            parsedFiles={parsedFiles}
            patch={patch}
          />
        </Suspense>
      )}
      <DiffStyleToggle
        diffStyle={diffStyle}
        disabled={diffControlsDisabled}
        onChange={setDiffStyle}
      />
    </>
  );
}
