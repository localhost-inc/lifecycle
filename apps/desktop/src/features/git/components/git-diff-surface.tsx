import { Alert, AlertDescription, diffTheme, useTheme } from "@lifecycle/ui";
import type { GitLogEntry, GitStatusResult } from "@lifecycle/contracts";
import { parsePatchFiles } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatRelativeTime } from "../../../lib/format";
import { getGitChangesPatch, getGitCommitPatch, openWorkspaceFile } from "../api";
import { useGitStatus } from "../hooks";
import { buildPatchRenderCacheKey } from "../lib/diff-virtualization";
import { DiffRenderProvider } from "./diff-render-provider";
import { MultiFileDiffLayout } from "./multi-file-diff-layout";

type GitDiffSurfaceSource =
  | {
      focusPath: string | null;
      mode: "changes";
    }
  | {
      commit: GitLogEntry;
      mode: "commit";
    };

interface GitDiffSurfaceProps {
  source: GitDiffSurfaceSource;
  workspaceId: string;
}

function loadingLabel(source: GitDiffSurfaceSource): string {
  return source.mode === "changes" ? "Loading changes..." : "Loading commit diff...";
}

function errorLabel(source: GitDiffSurfaceSource, error: string): string {
  return source.mode === "changes"
    ? `Failed to load changes: ${error}`
    : `Failed to load commit diff: ${error}`;
}

function header(source: GitDiffSurfaceSource) {
  if (source.mode === "changes") {
    return (
      <div className="border-b border-[var(--border)] px-4 py-4">
        <p className="text-base font-semibold leading-snug text-[var(--foreground)]">Changes</p>
        <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
          Current local edits across the workspace
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--border)] px-4 py-4">
      <p className="text-base font-semibold leading-snug text-[var(--foreground)]">
        {source.commit.message}
      </p>
      <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
        {source.commit.author} · {formatRelativeTime(source.commit.timestamp)} ·{" "}
        <span className="font-mono">{source.commit.shortSha}</span>
      </p>
    </div>
  );
}

export function buildChangesPatchReloadKey(
  focusPath: string | null,
  gitStatus: Pick<GitStatusResult, "files" | "headSha"> | null,
): string {
  const filesSignature =
    gitStatus?.files
      .map((file) =>
        [
          file.path,
          file.originalPath ?? "",
          file.indexStatus ?? "",
          file.worktreeStatus ?? "",
          file.staged ? "1" : "0",
          file.unstaged ? "1" : "0",
          file.stats.insertions ?? "",
          file.stats.deletions ?? "",
        ].join("\u0001"),
      )
      .join("\u0002") ?? "";

  return [focusPath ?? "", gitStatus?.headSha ?? "", filesSignature].join("\u0003");
}

export function GitDiffSurface({ source, workspaceId }: GitDiffSurfaceProps) {
  const { resolvedAppearance, resolvedTheme } = useTheme();
  const [patch, setPatch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const commitSha = source.mode === "commit" ? source.commit.sha : null;
  const focusPath = source.mode === "changes" ? source.focusPath : null;
  const changesStatusQuery = useGitStatus(source.mode === "changes" ? workspaceId : null, {
    polling: false,
  });
  const changesPatchReloadKey = useMemo(
    () =>
      source.mode === "changes"
        ? buildChangesPatchReloadKey(focusPath, changesStatusQuery.data ?? null)
        : null,
    [changesStatusQuery.data, focusPath, source.mode],
  );
  const previousSurfaceIdentityRef = useRef<string | null>(null);
  const surfaceIdentity =
    source.mode === "changes" ? `changes:${workspaceId}` : `commit:${workspaceId}:${commitSha}`;

  useEffect(() => {
    let cancelled = false;

    const shouldResetPatch = previousSurfaceIdentityRef.current !== surfaceIdentity;
    previousSurfaceIdentityRef.current = surfaceIdentity;

    if (shouldResetPatch) {
      setPatch("");
    }

    setError(null);
    setIsLoading(true);

    const patchRequest =
      source.mode === "changes"
        ? getGitChangesPatch(workspaceId)
        : getGitCommitPatch(workspaceId, commitSha ?? "").then((result) => result.patch);

    void patchRequest
      .then((result) => {
        if (cancelled) {
          return;
        }

        setPatch(result);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }

        setError(String(nextError));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [changesPatchReloadKey, commitSha, source.mode, surfaceIdentity, workspaceId]);

  const parsedFiles = useMemo(() => {
    if (!patch) {
      return [];
    }

    const cacheKey =
      source.mode === "changes"
        ? buildPatchRenderCacheKey(`changes-diff:${workspaceId}`, patch)
        : buildPatchRenderCacheKey(`commit-diff:${workspaceId}:${commitSha}`, patch);

    try {
      return parsePatchFiles(patch, cacheKey).flatMap((parsedPatch) => parsedPatch.files);
    } catch {
      return null;
    }
  }, [commitSha, patch, source.mode, workspaceId]);

  const handleOpenFile = (filePath: string) => {
    void openWorkspaceFile(workspaceId, filePath).catch((openError) => {
      setError(String(openError));
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      {header(source)}

      <DiffRenderProvider theme={diffTheme(resolvedTheme)}>
        {isLoading && !patch ? (
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            {loadingLabel(source)}
          </div>
        ) : error ? (
          <Alert className="m-5" variant="destructive">
            <AlertDescription>{errorLabel(source, error)}</AlertDescription>
          </Alert>
        ) : !patch ? (
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            No diff to display.
          </div>
        ) : parsedFiles === null || parsedFiles.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <PatchDiff
              patch={patch}
              options={{
                disableFileHeader: true,
                theme: diffTheme(resolvedTheme),
                themeType: resolvedAppearance,
              }}
            />
          </div>
        ) : (
          <MultiFileDiffLayout
            files={parsedFiles}
            initialFilePath={focusPath}
            onOpenFile={handleOpenFile}
            theme={diffTheme(resolvedTheme)}
            themeType={resolvedAppearance}
          />
        )}
      </DiffRenderProvider>
    </div>
  );
}
