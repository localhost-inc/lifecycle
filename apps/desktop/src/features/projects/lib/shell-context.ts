import type { ProjectRecord } from "@lifecycle/contracts";

export type ShellContextKind = "personal";

export interface ShellContext {
  id: string;
  kind: ShellContextKind;
  name: string;
  persisted: boolean;
}

const PERSONAL_SHELL_CONTEXT_ID = "personal";
const SHELL_CONTEXT_STORAGE_KEY = "lifecycle.desktop.active-shell-context";

function createPersonalShellContext(persisted: boolean, displayName?: string | null): ShellContext {
  return {
    id: PERSONAL_SHELL_CONTEXT_ID,
    kind: "personal",
    name: displayName || "Personal",
    persisted,
  };
}

export function resolveProjectShellContextId(
  _project: Pick<ProjectRecord, "id">,
): string {
  return PERSONAL_SHELL_CONTEXT_ID;
}

export function buildShellContexts(
  _projects: ProjectRecord[],
  options: { personalContextPersisted?: boolean; personalDisplayName?: string | null } = {},
): ShellContext[] {
  return [
    createPersonalShellContext(
      options.personalContextPersisted ?? false,
      options.personalDisplayName,
    ),
  ];
}

export function filterProjectsForShellContext(
  projects: ProjectRecord[],
  _shellContext: Pick<ShellContext, "id">,
): ProjectRecord[] {
  return projects;
}

export function resolveActiveShellContext(options: {
  contexts: ShellContext[];
  projects: ProjectRecord[];
  requestedContextId: string | null;
  routeProjectId: string | undefined;
}): ShellContext {
  const { contexts } = options;
  return contexts[0] ?? createPersonalShellContext(false);
}

export function readPersistedShellContextId(): string | null {
  try {
    return localStorage.getItem(SHELL_CONTEXT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writePersistedShellContextId(contextId: string): void {
  try {
    localStorage.setItem(SHELL_CONTEXT_STORAGE_KEY, contextId);
  } catch {
    // best-effort persistence
  }
}
