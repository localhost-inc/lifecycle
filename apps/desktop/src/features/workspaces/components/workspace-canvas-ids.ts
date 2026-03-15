export function createWorkspaceCanvasId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createWorkspacePaneId(): string {
  return `pane:${createWorkspaceCanvasId()}`;
}

export function createWorkspaceSplitId(): string {
  return `split:${createWorkspaceCanvasId()}`;
}

export function canvasTabDomId(key: string): string {
  return `workspace-tab-${encodeURIComponent(key)}`;
}

export function canvasTabPanelId(key: string): string {
  return `workspace-tabpanel-${encodeURIComponent(key)}`;
}
