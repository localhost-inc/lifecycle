import type { GitLogEntry, GitStatusResult } from "@lifecycle/contracts";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import { measureAsyncPerformance } from "@/lib/performance";
import { GithubAvatar } from "@/features/git/components/github-avatar";
import { getGitChangesPatch, getGitCommitPatch } from "@/features/git/api";
import { useGitStatus } from "@/features/git/hooks";
import { useParsedGitPatchFiles } from "@/features/git/lib/parsed-patch-files";
import { GitPatchViewer } from "@/features/git/components/git-patch-viewer";

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
  initialScrollTop?: number;
  onOpenFile?: (filePath: string) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  source: GitDiffSurfaceSource;
  workspaceId: string;
}

function loadingLabel(source: GitDiffSurfaceSource): string {
  return source.mode === "changes" ? "Loading changes..." : "Loading commit diff...";
}

function header(source: GitDiffSurfaceSource) {
  if (source.mode === "changes") {
    return null;
  }

  return (
    <div className="border-b border-[var(--border)] px-4 py-4">
      <p className="text-base font-semibold leading-snug text-[var(--foreground)]">
        {source.commit.message}
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <GithubAvatar name={source.commit.author} email={source.commit.email} size="sm" />
        <span>
          {source.commit.author} · {formatRelativeTime(source.commit.timestamp)} ·{" "}
          <span className="font-mono">{source.commit.shortSha}</span>
        </span>
      </div>
    </div>
  );
}

export function buildChangesPatchReloadKey(
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

  return [gitStatus?.headSha ?? "", filesSignature].join("\u0003");
}

export function GitDiffSurface({
  initialScrollTop = 0,
  onOpenFile,
  onScrollTopChange,
  source,
  workspaceId,
}: GitDiffSurfaceProps) {
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
        ? buildChangesPatchReloadKey(changesStatusQuery.data ?? null)
        : null,
    [changesStatusQuery.data, source.mode],
  );
  const diffCacheKeyPrefix =
    source.mode === "changes"
      ? `changes-diff:${workspaceId}`
      : `commit-diff:${workspaceId}:${commitSha}`;
  const previousSurfaceIdentityRef = useRef<string | null>(null);
  const surfaceIdentity =
    source.mode === "changes" ? `changes:${workspaceId}` : `commit:${workspaceId}:${commitSha}`;

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;

    const shouldResetPatch = previousSurfaceIdentityRef.current !== surfaceIdentity;
    previousSurfaceIdentityRef.current = surfaceIdentity;

    if (shouldResetPatch) {
      setPatch("");
    }

    setError(null);
    setIsLoading(true);

    frameId = window.requestAnimationFrame(() => {
      const patchRequest = measureAsyncPerformance(
        `git-diff-surface.patch:${surfaceIdentity}`,
        () =>
          source.mode === "changes"
            ? getGitChangesPatch(workspaceId)
            : getGitCommitPatch(workspaceId, commitSha ?? "").then((result) => result.patch),
      );

      void patchRequest
        .then((result) => {
          if (cancelled) {
            return;
          }

          startTransition(() => {
            setPatch(result);
            setIsLoading(false);
          });
        })
        .catch((nextError) => {
          if (cancelled) {
            return;
          }

          setError(String(nextError));
          setIsLoading(false);
        });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [changesPatchReloadKey, commitSha, source.mode, surfaceIdentity, workspaceId]);
  const parsedFiles = useParsedGitPatchFiles(diffCacheKeyPrefix, patch);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]">
      {header(source)}
      <GitPatchViewer
        error={error}
        errorMessagePrefix={
          source.mode === "changes" ? "Failed to load changes" : "Failed to load commit diff"
        }
        initialFilePath={focusPath}
        initialScrollTop={initialScrollTop}
        isLoading={isLoading}
        loadingMessage={loadingLabel(source)}
        onOpenFile={onOpenFile}
        onScrollTopChange={onScrollTopChange}
        parsedFiles={parsedFiles}
        patch={patch}
      />
    </div>
  );
}
