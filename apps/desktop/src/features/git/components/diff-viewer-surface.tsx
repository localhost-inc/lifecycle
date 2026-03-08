import { Alert, AlertDescription, ToggleGroup, ToggleGroupItem, useTheme } from "@lifecycle/ui";
import { parsePatchFiles } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import type { GitDiffScope } from "@lifecycle/contracts";
import { useEffect, useMemo, useState } from "react";
import { getGitBaseRef, getGitScopePatch, openWorkspaceFile } from "../api";
import { useGitStatus } from "../hooks";
import { buildPatchRenderCacheKey } from "../lib/diff-virtualization";
import { DiffRenderProvider } from "./diff-render-provider";
import { MultiFileDiffLayout } from "./multi-file-diff-layout";

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
  const [patch, setPatch] = useState("");
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

    setPatch("");
    setError(null);
    setIsLoading(true);

    void getGitScopePatch(workspaceId, currentScope)
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
  }, [currentScope, workspaceId]);

  const hasWorkingChanges = (statusQuery.data?.files ?? []).some((file) => file.unstaged);
  const hasStagedChanges = (statusQuery.data?.files ?? []).some((file) => file.staged);
  const scopeAvailability: Record<GitDiffScope, boolean> = {
    working: hasWorkingChanges,
    staged: hasStagedChanges,
    branch: baseRef !== null,
  };

  const parsedFiles = useMemo(() => {
    if (!patch) {
      return [];
    }

    try {
      return parsePatchFiles(
        patch,
        buildPatchRenderCacheKey(
          `workspace-diff:${workspaceId}:${currentScope}:${filePath}`,
          patch,
        ),
      ).flatMap((patch) => patch.files);
    } catch {
      return null;
    }
  }, [currentScope, filePath, patch, workspaceId]);

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
                    ? `No ${scope} changes in this workspace`
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

      <DiffRenderProvider>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            Loading diff...
          </div>
        ) : error ? (
          <Alert className="m-5" variant="destructive">
            <AlertDescription>Failed to load diff: {error}</AlertDescription>
          </Alert>
        ) : !patch ? (
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            {currentScope === "branch" && !baseRef
              ? "No base branch available for comparison."
              : "No diff to display."}
          </div>
        ) : parsedFiles === null ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <PatchDiff
              patch={patch}
              options={{
                disableFileHeader: true,
                themeType: resolvedAppearance,
              }}
            />
          </div>
        ) : (
          <MultiFileDiffLayout
            files={parsedFiles}
            initialFilePath={filePath}
            onOpenFile={handleOpenFile}
            themeType={resolvedAppearance}
          />
        )}
      </DiffRenderProvider>
    </div>
  );
}
