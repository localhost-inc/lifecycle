import type { ProjectRecord } from "@lifecycle/contracts";

export type ShellContextKind = "personal" | "organization";

export interface ShellContext {
  id: string;
  kind: ShellContextKind;
  name: string;
  persisted: boolean;
  organizationId?: string;
}

const PERSONAL_SHELL_CONTEXT_ID = "personal";
const ORGANIZATION_SHELL_CONTEXT_PREFIX = "organization:";
const SHELL_CONTEXT_STORAGE_KEY = "lifecycle.desktop.active-shell-context";

function organizationShellContextId(organizationId: string): string {
  return `${ORGANIZATION_SHELL_CONTEXT_PREFIX}${organizationId}`;
}

function buildOrganizationContextName(index: number, total: number): string {
  return total === 1 ? "Organization" : `Organization ${index + 1}`;
}

function createPersonalShellContext(persisted: boolean): ShellContext {
  return {
    id: PERSONAL_SHELL_CONTEXT_ID,
    kind: "personal",
    name: "Personal",
    persisted,
  };
}

export function resolveProjectShellContextId(
  project: Pick<ProjectRecord, "organizationId">,
): string {
  return project.organizationId
    ? organizationShellContextId(project.organizationId)
    : PERSONAL_SHELL_CONTEXT_ID;
}

export function buildShellContexts(
  projects: ProjectRecord[],
  options: { personalContextPersisted?: boolean } = {},
): ShellContext[] {
  const organizationIds = [...new Set(projects.map((project) => project.organizationId))]
    .filter((organizationId): organizationId is string => Boolean(organizationId))
    .sort((left, right) => left.localeCompare(right));

  return [
    createPersonalShellContext(options.personalContextPersisted ?? false),
    ...organizationIds.map((organizationId, index) => ({
      id: organizationShellContextId(organizationId),
      kind: "organization" as const,
      name: buildOrganizationContextName(index, organizationIds.length),
      persisted: true,
      organizationId,
    })),
  ];
}

export function filterProjectsForShellContext(
  projects: ProjectRecord[],
  shellContext: Pick<ShellContext, "id">,
): ProjectRecord[] {
  return projects.filter(
    (project) => resolveProjectShellContextId(project) === shellContext.id,
  );
}

export function resolveActiveShellContext(options: {
  contexts: ShellContext[];
  projects: ProjectRecord[];
  requestedContextId: string | null;
  routeProjectId: string | undefined;
}): ShellContext {
  const { contexts, projects, requestedContextId, routeProjectId } = options;
  const personalContext = contexts.find((context) => context.kind === "personal")
    ?? createPersonalShellContext(false);

  if (routeProjectId) {
    const routeProject = projects.find((project) => project.id === routeProjectId);
    if (routeProject) {
      return (
        contexts.find(
          (context) => context.id === resolveProjectShellContextId(routeProject),
        ) ?? personalContext
      );
    }
  }

  if (requestedContextId) {
    const requestedContext = contexts.find((context) => context.id === requestedContextId);
    if (requestedContext && filterProjectsForShellContext(projects, requestedContext).length > 0) {
      return requestedContext;
    }
  }

  if (filterProjectsForShellContext(projects, personalContext).length > 0 || contexts.length === 1) {
    return personalContext;
  }

  return (
    contexts.find((context) => filterProjectsForShellContext(projects, context).length > 0)
    ?? personalContext
  );
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

