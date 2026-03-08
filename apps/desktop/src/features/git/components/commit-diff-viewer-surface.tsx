import { Alert, AlertDescription, useTheme } from "@lifecycle/ui";
import { parsePatchFiles } from "@pierre/diffs";
import type { GitLogEntry } from "@lifecycle/contracts";
import { useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "../../../lib/format";
import { getGitCommitPatch, openWorkspaceFile } from "../api";
import { GitDiffFileBlock } from "./git-diff-file-block";
import { summarizeChanges } from "./git-file-header";

interface CommitDiffViewerSurfaceProps {
  commit: GitLogEntry;
  workspaceId: string;
}

export function CommitDiffViewerSurface({ commit, workspaceId }: CommitDiffViewerSurfaceProps) {
  const { resolvedAppearance } = useTheme();
  const [patch, setPatch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setPatch("");
    setError(null);
    setIsLoading(true);

    void getGitCommitPatch(workspaceId, commit.sha)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setPatch(result.patch);
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
  }, [commit.sha, workspaceId]);

  const files = useMemo(() => {
    if (!patch) {
      return [];
    }

    try {
      return parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files);
    } catch {
      return [];
    }
  }, [patch]);

  const { totalAdditions, totalDeletions } = useMemo(() => {
    let adds = 0;
    let dels = 0;
    for (const f of files) {
      const s = summarizeChanges(f);
      adds += s.additions;
      dels += s.deletions;
    }
    return { totalAdditions: adds, totalDeletions: dels };
  }, [files]);

  const handleOpenFile = (filePath: string) => {
    void openWorkspaceFile(workspaceId, filePath).catch((openError) => {
      setError(String(openError));
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      <div className="border-b border-[var(--border)] px-4 py-4">
        <p className="text-base font-semibold leading-snug text-[var(--foreground)]">
          {commit.message}
        </p>
        <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
          {commit.author} · {formatRelativeTime(commit.timestamp)} ·{" "}
          <span className="font-mono">{commit.shortSha}</span>
        </p>
      </div>
      {files.length > 0 && (
        <div className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
          {files.length} {files.length === 1 ? "file" : "files"} changed
          {totalAdditions > 0 && (
            <>
              ,{" "}
              <span className="text-emerald-400">
                {totalAdditions} insertion{totalAdditions === 1 ? "" : "s"}(+)
              </span>
            </>
          )}
          {totalDeletions > 0 && (
            <>
              ,{" "}
              <span className="text-red-400">
                {totalDeletions} deletion{totalDeletions === 1 ? "" : "s"}(-)
              </span>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
          Loading commit diff...
        </div>
      ) : error ? (
        <Alert className="m-5" variant="destructive">
          <AlertDescription>Failed to load commit diff: {error}</AlertDescription>
        </Alert>
      ) : files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
          No diff to display.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            {files.map((fileDiff, index) => (
              <GitDiffFileBlock
                key={`${fileDiff.prevName ?? ""}:${fileDiff.name}:${index}`}
                fileDiff={fileDiff}
                onOpenFile={handleOpenFile}
                themeType={resolvedAppearance}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
