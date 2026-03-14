import type {
  WorkspacePaneLeaf,
  WorkspacePaneNode,
  WorkspacePaneSplit,
} from "../state/workspace-surface-state";

export const DEFAULT_WORKSPACE_PANE_ID = "pane-root";
export const DEFAULT_WORKSPACE_SPLIT_RATIO = 0.5;

export interface WorkspacePaneLayoutSnapshot {
  firstPane: WorkspacePaneLeaf;
  paneCount: number;
  paneIds: string[];
  panes: WorkspacePaneLeaf[];
}

export interface CloseWorkspacePaneLayoutResult {
  didClose: boolean;
  nextRoot: WorkspacePaneNode;
  survivingPaneId: string | null;
}

export interface SplitWorkspacePaneLayoutResult {
  didSplit: boolean;
  nextRoot: WorkspacePaneNode;
}

export interface UpdateWorkspacePaneLayoutSplitResult {
  didUpdate: boolean;
  nextRoot: WorkspacePaneNode;
}

export function createWorkspacePane(id: string = DEFAULT_WORKSPACE_PANE_ID): WorkspacePaneLeaf {
  return {
    id,
    kind: "leaf",
  };
}

export function isWorkspacePaneLeaf(node: WorkspacePaneNode): node is WorkspacePaneLeaf {
  return node.kind === "leaf";
}

export function isWorkspacePaneSplit(node: WorkspacePaneNode): node is WorkspacePaneSplit {
  return node.kind === "split";
}

function collectWorkspacePaneLeaves(root: WorkspacePaneNode): WorkspacePaneLeaf[] {
  if (isWorkspacePaneLeaf(root)) {
    return [root];
  }

  return [...collectWorkspacePaneLeaves(root.first), ...collectWorkspacePaneLeaves(root.second)];
}

function findWorkspacePaneLeaf(root: WorkspacePaneNode, paneId: string): WorkspacePaneLeaf | null {
  if (isWorkspacePaneLeaf(root)) {
    return root.id === paneId ? root : null;
  }

  return findWorkspacePaneLeaf(root.first, paneId) ?? findWorkspacePaneLeaf(root.second, paneId);
}

function splitWorkspacePaneNode(
  root: WorkspacePaneNode,
  paneId: string,
  split: WorkspacePaneSplit,
): WorkspacePaneNode {
  if (isWorkspacePaneLeaf(root)) {
    return root.id === paneId ? split : root;
  }

  const first = splitWorkspacePaneNode(root.first, paneId, split);
  const second = splitWorkspacePaneNode(root.second, paneId, split);
  return first === root.first && second === root.second ? root : { ...root, first, second };
}

function closeWorkspacePaneNode(
  root: WorkspacePaneNode,
  paneId: string,
): {
  nextRoot: WorkspacePaneNode;
  survivingPaneId: string | null;
} {
  if (isWorkspacePaneLeaf(root)) {
    return {
      nextRoot: root,
      survivingPaneId: null,
    };
  }

  if (isWorkspacePaneLeaf(root.first) && root.first.id === paneId) {
    return {
      nextRoot: root.second,
      survivingPaneId: inspectWorkspacePaneLayout(root.second).firstPane.id,
    };
  }

  if (isWorkspacePaneLeaf(root.second) && root.second.id === paneId) {
    return {
      nextRoot: root.first,
      survivingPaneId: inspectWorkspacePaneLayout(root.first).firstPane.id,
    };
  }

  const firstResult = closeWorkspacePaneNode(root.first, paneId);
  if (firstResult.survivingPaneId !== null) {
    return {
      nextRoot: {
        ...root,
        first: firstResult.nextRoot,
      },
      survivingPaneId: firstResult.survivingPaneId,
    };
  }

  const secondResult = closeWorkspacePaneNode(root.second, paneId);
  if (secondResult.survivingPaneId !== null) {
    return {
      nextRoot: {
        ...root,
        second: secondResult.nextRoot,
      },
      survivingPaneId: secondResult.survivingPaneId,
    };
  }

  return {
    nextRoot: root,
    survivingPaneId: null,
  };
}

function updateWorkspaceSplitNode(
  root: WorkspacePaneNode,
  splitId: string,
  updater: (split: WorkspacePaneSplit) => WorkspacePaneSplit,
): WorkspacePaneNode {
  if (isWorkspacePaneLeaf(root)) {
    return root;
  }

  if (root.id === splitId) {
    return updater(root);
  }

  const first = updateWorkspaceSplitNode(root.first, splitId, updater);
  const second = updateWorkspaceSplitNode(root.second, splitId, updater);
  return first === root.first && second === root.second ? root : { ...root, first, second };
}

export function inspectWorkspacePaneLayout(root: WorkspacePaneNode): WorkspacePaneLayoutSnapshot {
  const panes = collectWorkspacePaneLeaves(root);
  const firstPane = panes[0] ?? createWorkspacePane();

  return {
    firstPane,
    paneCount: panes.length,
    paneIds: panes.map((pane) => pane.id),
    panes,
  };
}

export function getWorkspacePane(
  root: WorkspacePaneNode,
  paneId: string,
): WorkspacePaneLeaf | null {
  return findWorkspacePaneLeaf(root, paneId);
}

export function requireWorkspacePane(root: WorkspacePaneNode, paneId: string): WorkspacePaneLeaf {
  const pane = getWorkspacePane(root, paneId);
  if (!pane) {
    throw new Error(`Workspace pane not found in layout: ${paneId}`);
  }

  return pane;
}

export function hasWorkspacePane(root: WorkspacePaneNode, paneId: string): boolean {
  return findWorkspacePaneLeaf(root, paneId) !== null;
}

export function updateWorkspacePaneLayoutSplit(
  root: WorkspacePaneNode,
  splitId: string,
  updater: (split: WorkspacePaneSplit) => WorkspacePaneSplit,
): UpdateWorkspacePaneLayoutSplitResult {
  const nextRoot = updateWorkspaceSplitNode(root, splitId, updater);
  return {
    didUpdate: nextRoot !== root,
    nextRoot,
  };
}

export function splitWorkspacePaneLayout(
  root: WorkspacePaneNode,
  paneId: string,
  split: WorkspacePaneSplit,
): SplitWorkspacePaneLayoutResult {
  if (!hasWorkspacePane(root, paneId)) {
    return {
      didSplit: false,
      nextRoot: root,
    };
  }

  return {
    didSplit: true,
    nextRoot: splitWorkspacePaneNode(root, paneId, split),
  };
}

export function closeWorkspacePaneLayout(
  root: WorkspacePaneNode,
  paneId: string,
): CloseWorkspacePaneLayoutResult {
  if (inspectWorkspacePaneLayout(root).paneCount <= 1 || !hasWorkspacePane(root, paneId)) {
    return {
      didClose: false,
      nextRoot: root,
      survivingPaneId: null,
    };
  }

  const result = closeWorkspacePaneNode(root, paneId);
  return {
    didClose: result.survivingPaneId !== null,
    nextRoot: result.nextRoot,
    survivingPaneId: result.survivingPaneId,
  };
}
