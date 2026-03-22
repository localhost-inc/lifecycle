import type { GitFileChangeKind, GitFileStatus, GitStatusResult } from "@lifecycle/contracts";
import { Button, EmptyState, Loading } from "@lifecycle/ui";
import {
  File,
  FileCode,
  FileJson,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Minus,
  Plus,
  SquareArrowOutUpRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import type React from "react";
import { stageGitFiles, unstageGitFiles } from "@/features/git/api";
import { useRuntime } from "@/store";

interface ChangesTabProps {
  error: unknown;
  gitStatus: GitStatusResult | null;
  isLoading: boolean;
  onOpenDiff: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onRefresh: () => Promise<void>;
  workspaceId: string;
}

type ChangesSectionKind = "staged" | "working";
type MutationKind = "stage" | "unstage";

interface PendingMutation {
  filePaths: string[];
  kind: MutationKind;
}

function basename(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] ?? filePath;
}

function statusCssVar(kind: GitFileChangeKind | null): string {
  switch (kind) {
    case "added":
    case "untracked":
      return "--git-status-added";
    case "deleted":
    case "unmerged":
      return "--git-status-deleted";
    case "renamed":
    case "copied":
      return "--git-status-renamed";
    case "modified":
    case "type_changed":
      return "--git-status-modified";
    default:
      return "--muted-foreground";
  }
}

function fileIconFor(filePath: string): React.ComponentType<{ className?: string }> {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return File;
  const ext = filePath.slice(dot).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".rs":
    case ".py":
    case ".go":
    case ".rb":
    case ".java":
    case ".c":
    case ".cpp":
    case ".h":
    case ".css":
    case ".scss":
    case ".html":
    case ".vue":
    case ".svelte":
      return FileCode;
    case ".json":
    case ".yaml":
    case ".yml":
    case ".toml":
      return FileJson;
    case ".md":
    case ".mdx":
    case ".txt":
    case ".rst":
      return FileText;
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".svg":
    case ".webp":
    case ".ico":
      return ImageIcon;
    default:
      return File;
  }
}

function resolveDisplayStatus(
  file: GitFileStatus,
  section: ChangesSectionKind,
): GitFileChangeKind | null {
  return section === "working" ? file.worktreeStatus : file.indexStatus;
}

function sectionFiles(
  files: readonly GitFileStatus[],
  section: ChangesSectionKind,
): readonly GitFileStatus[] {
  return files.filter((file) => (section === "working" ? file.unstaged : file.staged));
}

function isPendingFile(filePath: string, pendingMutation: PendingMutation | null): boolean {
  return pendingMutation?.filePaths.includes(filePath) ?? false;
}

function isPendingSection(
  section: ChangesSectionKind,
  pendingMutation: PendingMutation | null,
  files: readonly GitFileStatus[],
): boolean {
  if (!pendingMutation || pendingMutation.filePaths.length !== files.length) {
    return false;
  }

  if (section === "working" && pendingMutation.kind !== "stage") {
    return false;
  }

  if (section === "staged" && pendingMutation.kind !== "unstage") {
    return false;
  }

  return files.every((file) => pendingMutation.filePaths.includes(file.path));
}

function SectionHeader({
  actionDisabled,
  actionLabel,
  count,
  isActionPending,
  onAction,
  title,
}: {
  actionDisabled: boolean;
  actionLabel: string;
  count: number;
  isActionPending: boolean;
  onAction: () => void;
  title: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex min-h-6 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-0.5">
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="text-xs font-medium text-[var(--foreground)]">{title}</span>
        <span className="text-xs text-[var(--muted-foreground)] opacity-60">{count}</span>
      </div>
      <Button
        className="shrink-0"
        disabled={actionDisabled}
        onClick={onAction}
        size="sm"
        variant="ghost"
      >
        {isActionPending ? `${actionLabel}...` : actionLabel}
      </Button>
    </div>
  );
}

function FileRow({
  actionLabel,
  file,
  isActionPending,
  onAction,
  onOpen,
  onOpenFile,
  section,
}: {
  actionLabel: string;
  file: GitFileStatus;
  isActionPending: boolean;
  onAction: () => void;
  onOpen: () => void;
  onOpenFile: () => void;
  section: ChangesSectionKind;
}) {
  const name = basename(file.path);
  const ins = file.stats.insertions;
  const del = file.stats.deletions;
  const Icon = fileIconFor(file.path);
  const ActionIcon = section === "working" ? Plus : Minus;
  const cssVar = statusCssVar(resolveDisplayStatus(file, section));
  const hasDiffStats = (ins !== null && ins > 0) || (del !== null && del > 0);
  const actionTitle = `${actionLabel} ${file.path}`;
  const openTitle = `Open ${file.path}`;
  const actionVisibilityClass = isActionPending
    ? "pointer-events-none opacity-100"
    : "pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100";
  const statsVisibilityClass = isActionPending
    ? "opacity-0"
    : "group-hover/row:opacity-0 group-focus-within/row:opacity-0";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group/row flex min-h-8 items-center gap-3 px-4 py-1 transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      title={file.path}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        style={{ color: `var(${cssVar})` }}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="min-w-0 truncate text-sm text-[var(--foreground)]" title={file.path}>
        {name}
      </span>

      <div className="ml-auto flex shrink-0 items-center">
        <div className="relative flex min-h-8 min-w-12 items-center justify-end">
          {hasDiffStats ? (
            <span
              className={`shrink-0 font-mono text-xs transition-opacity ${statsVisibilityClass}`}
            >
              {ins !== null && ins > 0 && (
                <span className="text-[var(--git-status-added)]">+{ins}</span>
              )}
              {ins !== null && ins > 0 && del !== null && del > 0 && <span> </span>}
              {del !== null && del > 0 && (
                <span className="text-[var(--git-status-deleted)]">-{del}</span>
              )}
            </span>
          ) : null}
          <Button
            aria-label={openTitle}
            className="absolute top-1/2 right-8 -translate-y-1/2 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--foreground)] group-hover/row:opacity-100 group-focus-within/row:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onOpenFile();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            size="icon"
            title={openTitle}
            variant="ghost"
          >
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label={actionTitle}
            className={`absolute right-0 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] ${actionVisibilityClass}`}
            disabled={isActionPending}
            onClick={(event) => {
              event.stopPropagation();
              onAction();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            size="icon"
            title={actionTitle}
            variant="ghost"
          >
            <ActionIcon className="h-3.5 w-3.5" strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChangesSection({
  actionLabel,
  files,
  isMutating,
  onActionAll,
  onActionFile,
  onOpenDiff,
  onOpenFile,
  pendingMutation,
  rowActionLabel,
  title,
  section,
}: {
  actionLabel: string;
  files: readonly GitFileStatus[];
  isMutating: boolean;
  onActionAll: () => void;
  onActionFile: (filePath: string) => void;
  onOpenDiff: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  pendingMutation: PendingMutation | null;
  rowActionLabel: string;
  title: string;
  section: ChangesSectionKind;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader
        actionDisabled={isMutating}
        actionLabel={actionLabel}
        count={files.length}
        isActionPending={isPendingSection(section, pendingMutation, files)}
        onAction={onActionAll}
        title={title}
      />
      <div>
        {files.map((file) => (
          <FileRow
            actionLabel={rowActionLabel}
            file={file}
            isActionPending={isPendingFile(file.path, pendingMutation)}
            key={`${section}:${file.path}`}
            onAction={() => onActionFile(file.path)}
            onOpen={() => onOpenDiff(file.path)}
            onOpenFile={() => onOpenFile(file.path)}
            section={section}
          />
        ))}
      </div>
    </section>
  );
}

export function ChangesTab({
  error,
  gitStatus,
  isLoading,
  onOpenDiff,
  onOpenFile,
  onRefresh,
  workspaceId,
}: ChangesTabProps) {
  const runtime = useRuntime();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const files = gitStatus?.files ?? [];
  const workingFiles = useMemo(() => sectionFiles(files, "working"), [files]);
  const stagedFiles = useMemo(() => sectionFiles(files, "staged"), [files]);
  const isMutating = pendingMutation !== null;

  async function runMutation(kind: MutationKind, filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) {
      return;
    }

    setMutationError(null);
    setPendingMutation({ filePaths, kind });

    try {
      if (kind === "stage") {
        await stageGitFiles(runtime, workspaceId, filePaths);
      } else {
        await unstageGitFiles(runtime, workspaceId, filePaths);
      }
      await onRefresh();
    } catch (nextError) {
      setMutationError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setPendingMutation(null);
    }
  }

  if (isLoading && !gitStatus) {
    return <Loading delay={0} message="Loading changes..." />;
  }

  if (error) {
    return (
      <p className="text-xs text-[var(--destructive)]">Failed to load changes: {String(error)}</p>
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        description="New edits will appear here."
        icon={<GitBranch />}
        size="sm"
        title="Working tree clean"
      />
    );
  }

  return (
    <div className="-mx-2.5 flex flex-col [&>section+section]:border-t [&>section+section]:border-[var(--border)]">
      {mutationError && (
        <div
          className="rounded-[18px] border border-[var(--destructive)]/30 bg-[var(--destructive)]/8 px-3 py-2 text-[12px] text-[var(--destructive)]"
          role="alert"
        >
          Failed to update staged files: {mutationError}
        </div>
      )}

      <ChangesSection
        actionLabel="Stage all"
        files={workingFiles}
        isMutating={isMutating}
        onActionAll={() => {
          void runMutation(
            "stage",
            workingFiles.map((file) => file.path),
          );
        }}
        onActionFile={(filePath) => {
          void runMutation("stage", [filePath]);
        }}
        onOpenDiff={onOpenDiff}
        onOpenFile={onOpenFile}
        pendingMutation={pendingMutation}
        rowActionLabel="Stage"
        section="working"
        title="Working"
      />

      <ChangesSection
        actionLabel="Unstage all"
        files={stagedFiles}
        isMutating={isMutating}
        onActionAll={() => {
          void runMutation(
            "unstage",
            stagedFiles.map((file) => file.path),
          );
        }}
        onActionFile={(filePath) => {
          void runMutation("unstage", [filePath]);
        }}
        onOpenDiff={onOpenDiff}
        onOpenFile={onOpenFile}
        pendingMutation={pendingMutation}
        rowActionLabel="Unstage"
        section="staged"
        title="Staged"
      />
    </div>
  );
}
