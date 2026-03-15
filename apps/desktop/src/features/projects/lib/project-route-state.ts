import type { ProjectContentTab, ProjectViewId } from "../types/project-content-tabs";

export const PROJECT_ROUTE_PULL_REQUEST_PARAM = "pull-request";
export const PROJECT_ROUTE_VIEW_PARAM = "view";
export const PROJECT_ROUTE_WORKSPACE_PARAM = "workspace";

export type ProjectRouteFocus =
  | {
      kind: "project-view";
      viewId: ProjectViewId;
    }
  | {
      kind: "pull-request";
      pullRequestNumber: number;
    }
  | {
      kind: "workspace";
      workspaceId: string;
    };

function parsePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isProjectViewId(value: string | null): value is ProjectViewId {
  return value === "overview" || value === "pull-requests" || value === "activity";
}

export function readProjectRouteFocus(searchParams: URLSearchParams): ProjectRouteFocus | null {
  const workspaceId = searchParams.get(PROJECT_ROUTE_WORKSPACE_PARAM);
  if (workspaceId) {
    return {
      kind: "workspace",
      workspaceId,
    };
  }

  const pullRequestNumber = parsePositiveInteger(
    searchParams.get(PROJECT_ROUTE_PULL_REQUEST_PARAM),
  );
  if (pullRequestNumber !== null) {
    return {
      kind: "pull-request",
      pullRequestNumber,
    };
  }

  const viewId = searchParams.get(PROJECT_ROUTE_VIEW_PARAM);
  if (isProjectViewId(viewId)) {
    return {
      kind: "project-view",
      viewId,
    };
  }

  return null;
}

export function projectRouteFocusFromTab(tab: ProjectContentTab): ProjectRouteFocus {
  if (tab.kind === "workspace") {
    return {
      kind: "workspace",
      workspaceId: tab.workspaceId,
    };
  }

  if (tab.kind === "pull-request") {
    return {
      kind: "pull-request",
      pullRequestNumber: tab.pullRequestNumber,
    };
  }

  return {
    kind: "project-view",
    viewId: tab.viewId,
  };
}

export function isProjectRouteFocusAvailable(
  focus: ProjectRouteFocus | null,
  options?: {
    availableWorkspaceIds?: ReadonlySet<string>;
  },
): boolean {
  if (!focus) {
    return false;
  }

  if (focus.kind !== "workspace") {
    return true;
  }

  const availableWorkspaceIds = options?.availableWorkspaceIds;
  return availableWorkspaceIds ? availableWorkspaceIds.has(focus.workspaceId) : true;
}

export function projectRouteFocusEqualsTab(
  focus: ProjectRouteFocus | null,
  tab: ProjectContentTab | null,
): boolean {
  if (!focus || !tab || focus.kind !== tab.kind) {
    return false;
  }

  if (focus.kind === "workspace" && tab.kind === "workspace") {
    return focus.workspaceId === tab.workspaceId;
  }

  if (focus.kind === "pull-request" && tab.kind === "pull-request") {
    return focus.pullRequestNumber === tab.pullRequestNumber;
  }

  return focus.kind === "project-view" && tab.kind === "project-view"
    ? focus.viewId === tab.viewId
    : false;
}

export function updateProjectRouteFocus(
  searchParams: URLSearchParams,
  focus: ProjectRouteFocus,
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete(PROJECT_ROUTE_VIEW_PARAM);
  nextSearchParams.delete(PROJECT_ROUTE_WORKSPACE_PARAM);
  nextSearchParams.delete(PROJECT_ROUTE_PULL_REQUEST_PARAM);

  if (focus.kind === "project-view") {
    nextSearchParams.set(PROJECT_ROUTE_VIEW_PARAM, focus.viewId);
    nextSearchParams.delete("git");
    return nextSearchParams;
  }

  if (focus.kind === "workspace") {
    nextSearchParams.set(PROJECT_ROUTE_WORKSPACE_PARAM, focus.workspaceId);
    return nextSearchParams;
  }

  nextSearchParams.set(PROJECT_ROUTE_PULL_REQUEST_PARAM, String(focus.pullRequestNumber));
  nextSearchParams.delete("git");
  return nextSearchParams;
}
