import { Alert, AlertDescription, ToggleGroup, ToggleGroupItem, useTheme } from "@lifecycle/ui";
import { parsePatchFiles } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitDiffResult, GitDiffScope } from "@lifecycle/contracts";
import { useEffect, useMemo, useState } from "react";
import { getGitBaseRef, getGitDiff, openWorkspaceFile } from "../api";
import { useGitStatus } from "../hooks";
import { GitDiffFileBlock } from "./git-diff-file-block";

const SCOPE_LABELS: Record<GitDiffScope, string> = {
  working: "Working",
  staged: "Staged",
  branch: "Branch",
};

interface DiffViewerSurfaceProps {
  activeScope: GitDiffScope;
  filePath: string;
  onScopeChange: (scope: GitDiffScope) => void;
  workspaceId: string;
}

export function DiffViewerSurface({
  activeScope,
  filePath,
  onScopeChange,
  workspaceId,
}: DiffViewerSurfaceProps) {
  const { resolvedAppearance } = useTheme();
  const statusQuery = useGitStatus(workspaceId);
  const [baseRef, setBaseRef] = useState<string | null>(null);
  const [currentScope, setCurrentScope] = useState(activeScope);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setCurrentScope(activeScope);
  }, [activeScope]);

  useEffect(() => {
    let cancelled = false;

    void getGitBaseRef(workspaceId)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setBaseRef(result);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setBaseRef(null);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    setDiff(null);
    setError(null);
    setIsLoading(true);

    void getGitDiff(workspaceId, filePath, currentScope)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setDiff(result);
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
  }, [currentScope, filePath, workspaceId]);

  const fileStatus = statusQuery.data?.files.find((file) => file.path === filePath) ?? null;
  const scopeAvailability: Record<GitDiffScope, boolean> = {
    working: Boolean(fileStatus?.unstaged),
    staged: Boolean(fileStatus?.staged),
    branch: baseRef !== null,
  };

  const parsedFiles = useMemo(() => {
    if (!diff?.patch) {
      return [];
    }

    try {
      return parsePatchFiles(diff.patch).flatMap((patch) => patch.files);
    } catch {
      return null;
    }
  }, [diff?.patch]);

  const handleOpenFile = (nextFilePath: string) => {
    void openWorkspaceFile(workspaceId, nextFilePath).catch((openError) => {
      setError(String(openError));
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <ToggleGroup
          className="gap-1"
          onValueChange={(value) => {
            if (!value) {
              return;
            }

            const scope = value as GitDiffScope;
            if (!scopeAvailability[scope] || scope === currentScope) {
              return;
            }

            setCurrentScope(scope);
            onScopeChange(scope);
          }}
          type="single"
          value={currentScope}
        >
          {(["working", "staged", "branch"] as const).map((scope) => {
            const disabled = !scopeAvailability[scope];
            const title =
              scope === "branch" && baseRef
                ? `Compare against ${baseRef}`
                : scope === "branch"
                  ? "No base branch available"
                  : disabled
                    ? `No ${scope} changes for this file`
                    : undefined;

            return (
              <ToggleGroupItem
                aria-label={SCOPE_LABELS[scope]}
                className={
                  disabled
                    ? "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-[var(--muted-foreground)]"
                    : undefined
                }
                key={scope}
                disabled={disabled}
                title={title}
                value={scope}
              >
                {SCOPE_LABELS[scope]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
          Loading diff...
        </div>
      ) : error ? (
        <Alert className="m-5" variant="destructive">
          <AlertDescription>Failed to load diff: {error}</AlertDescription>
        </Alert>
      ) : !diff?.patch ? (
        <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
          {currentScope === "branch" && !baseRef
            ? "No base branch available for comparison."
            : "No diff to display."}
        </div>
      ) : parsedFiles === null ? (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <PatchDiff
            patch={diff.patch}
            options={{
              disableFileHeader: true,
              themeType: resolvedAppearance,
            }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            {parsedFiles.map((fileDiff, index) => (
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
