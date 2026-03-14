export function createWorkspaceSurfaceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createWorkspacePaneId(): string {
  return `pane:${createWorkspaceSurfaceId()}`;
}

export function createWorkspaceSplitId(): string {
  return `split:${createWorkspaceSurfaceId()}`;
}

export function workspaceTabDomId(key: string): string {
  return `workspace-tab-${encodeURIComponent(key)}`;
}

export function workspaceTabPanelId(key: string): string {
  return `workspace-panel-${encodeURIComponent(key)}`;
}
