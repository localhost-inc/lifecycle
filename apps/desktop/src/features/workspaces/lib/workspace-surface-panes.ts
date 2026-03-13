import type {
  WorkspacePaneLeaf,
  WorkspacePaneNode,
  WorkspacePaneSplit,
} from "../state/workspace-surface-state";

export const DEFAULT_WORKSPACE_PANE_ID = "pane-root";
export const DEFAULT_WORKSPACE_SPLIT_RATIO = 0.5;

export function createWorkspacePane(id: string = DEFAULT_WORKSPACE_PANE_ID): WorkspacePaneLeaf {
  return {
    activeTabKey: null,
    id,
    kind: "leaf",
    tabOrderKeys: [],
  };
}

export function isWorkspacePaneLeaf(node: WorkspacePaneNode): node is WorkspacePaneLeaf {
  return node.kind === "leaf";
}

export function isWorkspacePaneSplit(node: WorkspacePaneNode): node is WorkspacePaneSplit {
  return node.kind === "split";
}

export function collectWorkspacePaneLeaves(root: WorkspacePaneNode): WorkspacePaneLeaf[] {
  if (isWorkspacePaneLeaf(root)) {
    return [root];
  }

  return [
    ...collectWorkspacePaneLeaves(root.first),
    ...collectWorkspacePaneLeaves(root.second),
  ];
}

export function countWorkspacePanes(root: WorkspacePaneNode): number {
  return collectWorkspacePaneLeaves(root).length;
}

export function getFirstWorkspacePane(root: WorkspacePaneNode): WorkspacePaneLeaf {
  return collectWorkspacePaneLeaves(root)[0] ?? createWorkspacePane();
}

export function findWorkspacePaneById(
  root: WorkspacePaneNode,
  paneId: string,
): WorkspacePaneLeaf | null {
  if (isWorkspacePaneLeaf(root)) {
    return root.id === paneId ? root : null;
  }

  return findWorkspacePaneById(root.first, paneId) ?? findWorkspacePaneById(root.second, paneId);
}

export function findWorkspacePaneContainingTab(
  root: WorkspacePaneNode,
  tabKey: string,
): WorkspacePaneLeaf | null {
  return collectWorkspacePaneLeaves(root).find((pane) => pane.tabOrderKeys.includes(tabKey)) ?? null;
}

export function updateWorkspacePane(
  root: WorkspacePaneNode,
  paneId: string,
  updater: (pane: WorkspacePaneLeaf) => WorkspacePaneLeaf,
): WorkspacePaneNode {
  if (isWorkspacePaneLeaf(root)) {
    return root.id === paneId ? updater(root) : root;
  }

  const first = updateWorkspacePane(root.first, paneId, updater);
  const second = updateWorkspacePane(root.second, paneId, updater);
  return first === root.first && second === root.second ? root : { ...root, first, second };
}

export function updateWorkspaceSplit(
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

  const first = updateWorkspaceSplit(root.first, splitId, updater);
  const second = updateWorkspaceSplit(root.second, splitId, updater);
  return first === root.first && second === root.second ? root : { ...root, first, second };
}

export function splitWorkspacePane(
  root: WorkspacePaneNode,
  paneId: string,
  split: WorkspacePaneSplit,
): WorkspacePaneNode {
  if (isWorkspacePaneLeaf(root)) {
    return root.id === paneId ? split : root;
  }

  const first = splitWorkspacePane(root.first, paneId, split);
  const second = splitWorkspacePane(root.second, paneId, split);
  return first === root.first && second === root.second ? root : { ...root, first, second };
}

export function closeWorkspacePane(
  root: WorkspacePaneNode,
  paneId: string,
): {
  nextRoot: WorkspacePaneNode;
  siblingPaneId: string | null;
} {
  if (isWorkspacePaneLeaf(root)) {
    return {
      nextRoot: root,
      siblingPaneId: null,
    };
  }

  if (isWorkspacePaneLeaf(root.first) && root.first.id === paneId) {
    return {
      nextRoot: root.second,
      siblingPaneId: getFirstWorkspacePane(root.second).id,
    };
  }

  if (isWorkspacePaneLeaf(root.second) && root.second.id === paneId) {
    return {
      nextRoot: root.first,
      siblingPaneId: getFirstWorkspacePane(root.first).id,
    };
  }

  const firstResult = closeWorkspacePane(root.first, paneId);
  if (firstResult.siblingPaneId !== null) {
    return {
      nextRoot: {
        ...root,
        first: firstResult.nextRoot,
      },
      siblingPaneId: firstResult.siblingPaneId,
    };
  }

  const secondResult = closeWorkspacePane(root.second, paneId);
  if (secondResult.siblingPaneId !== null) {
    return {
      nextRoot: {
        ...root,
        second: secondResult.nextRoot,
      },
      siblingPaneId: secondResult.siblingPaneId,
    };
  }

  return {
    nextRoot: root,
    siblingPaneId: null,
  };
}
