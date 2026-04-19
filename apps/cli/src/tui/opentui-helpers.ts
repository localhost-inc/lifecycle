export interface WorkspaceIdentity {
  id: string;
}

export interface TerminalIdentity {
  id: string;
}

export interface TuiKeyLike {
  ctrl?: boolean;
  name?: string | null;
}

export interface BridgeRepositoryWorkspaceSummary extends WorkspaceIdentity {
  host: string;
  name: string;
  path?: string;
  ref?: string;
  slug: string;
  status: string;
}

export interface BridgeRepositorySummary {
  id: string;
  name: string;
  path: string;
  slug: string;
  workspaces: BridgeRepositoryWorkspaceSummary[];
}

export interface ListedWorkspace extends WorkspaceIdentity {
  host: string;
  name: string;
  repositoryName: string;
  repositoryPath: string;
  repositorySlug: string;
  slug: string;
  sourceRef: string;
  status: string;
  workspacePath: string | null;
}

export interface RepositoryWorkspaceGroup {
  id: string;
  name: string;
  path: string;
  slug: string;
  workspaces: ListedWorkspace[];
}

export interface RepositorySidebarEntry {
  activeWorkspace: ListedWorkspace | null;
  isCollapsed: boolean;
  key: string;
  kind: "repository";
  repository: RepositoryWorkspaceGroup;
}

export interface WorkspaceSidebarEntry {
  key: string;
  kind: "workspace";
  repositoryId: string;
  workspace: ListedWorkspace;
}

export type SidebarEntry = RepositorySidebarEntry | WorkspaceSidebarEntry;

export function pickWorkspaceId(
  workspaces: WorkspaceIdentity[],
  preferredWorkspaceId: string | null,
): string | null {
  if (
    preferredWorkspaceId &&
    workspaces.some((workspace) => workspace.id === preferredWorkspaceId)
  ) {
    return preferredWorkspaceId;
  }
  return workspaces[0]?.id ?? null;
}

export function pickTerminalId(
  terminals: TerminalIdentity[],
  preferredTerminalId: string | null,
): string | null {
  if (preferredTerminalId && terminals.some((terminal) => terminal.id === preferredTerminalId)) {
    return preferredTerminalId;
  }
  return terminals[0]?.id ?? null;
}

export function mergeLaunchEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  pairs: Array<[string, string]>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnvironment)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }
  for (const [key, value] of pairs) {
    merged[key] = value;
  }
  return merged;
}

export function describeShellExit(exitCode: number, signal?: number | string): string {
  if (signal !== undefined) {
    return `Shell exited via ${String(signal)}.`;
  }
  return `Shell exited with code ${exitCode}.`;
}

export function isTuiQuitKey(key: TuiKeyLike): boolean {
  return key.ctrl === true && key.name === "q";
}

export function formatTuiFatalError(error: unknown, maxLines = 12): string {
  const message =
    error instanceof Error
      ? error.stack?.trim() || error.message.trim() || "Unknown Lifecycle TUI error."
      : String(error).trim() || "Unknown Lifecycle TUI error.";

  return message.split("\n").slice(0, Math.max(1, maxLines)).join("\n");
}

export function groupRepositoryWorkspaces(
  repositories: BridgeRepositorySummary[],
): RepositoryWorkspaceGroup[] {
  return repositories.map((repository) => ({
    id: repository.id,
    name: repository.name,
    path: repository.path,
    slug: repository.slug,
    workspaces: repository.workspaces.map((workspace) => ({
      host: workspace.host,
      id: workspace.id,
      name: workspace.name,
      repositoryName: repository.name,
      repositoryPath: repository.path,
      repositorySlug: repository.slug,
      slug: workspace.slug,
      sourceRef: workspace.ref ?? "",
      status: workspace.status,
      workspacePath: workspace.path ?? null,
    })),
  }));
}

export function flattenWorkspaceGroups(
  repositoryGroups: RepositoryWorkspaceGroup[],
): ListedWorkspace[] {
  return repositoryGroups.flatMap((repository) => repository.workspaces);
}

export function createVisibleSidebarEntries(
  repositoryGroups: RepositoryWorkspaceGroup[],
  collapsedRepositoryIds: ReadonlySet<string>,
  selectedWorkspaceId: string | null,
): SidebarEntry[] {
  return repositoryGroups.flatMap((repository) => {
    const isCollapsed = collapsedRepositoryIds.has(repository.id);
    const activeWorkspace =
      repository.workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

    const entries: SidebarEntry[] = [
      {
        activeWorkspace,
        isCollapsed,
        key: repositorySidebarEntryKey(repository.id),
        kind: "repository",
        repository,
      },
    ];

    if (isCollapsed) {
      return entries;
    }

    return entries.concat(
      repository.workspaces.map((workspace) => ({
        key: workspaceSidebarEntryKey(workspace.id),
        kind: "workspace" as const,
        repositoryId: repository.id,
        workspace,
      })),
    );
  });
}

export function repositorySidebarEntryKey(repositoryId: string): string {
  return `repo:${repositoryId}`;
}

export function workspaceSidebarEntryKey(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function pickSidebarEntryKey(
  entries: SidebarEntry[],
  preferredEntryKey: string | null,
  selectedWorkspaceId: string | null,
): string | null {
  if (preferredEntryKey && entries.some((entry) => entry.key === preferredEntryKey)) {
    return preferredEntryKey;
  }

  if (selectedWorkspaceId) {
    const selectedWorkspaceEntry = entries.find(
      (entry) => entry.kind === "workspace" && entry.workspace.id === selectedWorkspaceId,
    );
    if (selectedWorkspaceEntry) {
      return selectedWorkspaceEntry.key;
    }

    const selectedRepositoryEntry = entries.find(
      (entry) => entry.kind === "repository" && entry.activeWorkspace?.id === selectedWorkspaceId,
    );
    if (selectedRepositoryEntry) {
      return selectedRepositoryEntry.key;
    }
  }

  return entries[0]?.key ?? null;
}

export function workspaceShortLabel(workspace: ListedWorkspace): string {
  return workspace.slug || workspace.name;
}

export function formatWorkspaceTabLabel(input: { busy: boolean; title: string }): string {
  return `${input.busy ? "* " : ""}${input.title}`;
}
