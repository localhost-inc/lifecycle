export type ProjectViewId = "activity" | "overview" | "pull-requests";

export interface ProjectViewTab {
  id: string;
  kind: "project-view";
  viewId: ProjectViewId;
}

export interface PullRequestTab {
  id: string;
  kind: "pull-request";
  pullRequestNumber: number;
}

export interface WorkspaceTab {
  id: string;
  kind: "workspace";
  workspaceId: string;
}

export type ProjectContentTab = ProjectViewTab | PullRequestTab | WorkspaceTab;

export interface ProjectContentTabsState {
  activeTabId: string;
  tabs: ProjectContentTab[];
}
