import { isGitPanelTabValue, type GitPanelTabValue } from "../../git/lib/git-panel-tabs";

export const WORKSPACE_ROUTE_GIT_TAB_PARAM = "git";

export interface WorkspaceRouteState {
  gitTab: GitPanelTabValue;
}

export interface WorkspaceRouteStatePatch {
  gitTab?: GitPanelTabValue;
}

export function readWorkspaceRouteState(searchParams: URLSearchParams): WorkspaceRouteState {
  const gitTabParam = searchParams.get(WORKSPACE_ROUTE_GIT_TAB_PARAM);

  return {
    gitTab: isGitPanelTabValue(gitTabParam) ? gitTabParam : "changes",
  };
}

export function updateWorkspaceRouteState(
  searchParams: URLSearchParams,
  patch: WorkspaceRouteStatePatch,
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams);

  if (patch.gitTab !== undefined) {
    if (patch.gitTab === "changes") {
      nextSearchParams.delete(WORKSPACE_ROUTE_GIT_TAB_PARAM);
    } else {
      nextSearchParams.set(WORKSPACE_ROUTE_GIT_TAB_PARAM, patch.gitTab);
    }
  }

  return nextSearchParams;
}
